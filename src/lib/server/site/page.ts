import type { D1Database } from '@cloudflare/workers-types';
import { renderMarkdown } from '$lib/markdown/render';
import { retreat, siteHome } from '$lib/content';
import { pageTier, viewerTier } from './tier';
import { listSections, listUpdates, retreatToday, visibleTo, type Section } from './sections';
import { photosFor, type Photo } from './photos';
import { hydrateAttendees, shownAttendees, type AttendeeView, type ProfileLoader } from './featured';
import { hydrateBskyPosts, listBskyPostUris, type BskyPostView, type FetchLike, type KvLike } from './bsky-posts';

export interface SitePhotoView {
	id: string;
	alt: string;
	width: number;
	height: number;
	src: string;
}

export interface SiteSectionView {
	id: number;
	title: string;
	html: string;
	visibility: 'public' | 'invited';
	photos: SitePhotoView[];
}

interface PostBase {
	key: string;
	/**
	 * Newest-first ordering key, compared as a string: the Pacific calendar
	 * day, then updates ahead of Bluesky posts on that day, then the instant.
	 */
	sortKey: string;
	/** Machine date for <time datetime>. */
	datetime: string;
	dateLabel: string;
}

export type SitePostView = (PostBase & { kind: 'update'; update: SiteSectionView }) | (PostBase & { kind: 'bsky'; post: BskyPostView });

export interface SiteData {
	tier: 'public' | 'invited';
	/** True for organizers — the page shows "Edit retreat info" and preview links. */
	organizer: boolean;
	sections: SiteSectionView[];
	/** Who's coming: curated, still-confirmed registrants. Public at every tier. */
	attendees: AttendeeView[];
	/** Updates the viewer may see + Bluesky posts (public), newest first. */
	posts: SitePostView[];
	/** The section read failed: render hero + strip + a quiet "more soon". */
	unavailable: boolean;
	/** Link-preview tags, built from public content only. */
	preview: { title: string; description: string; image: string };
}

const plain = (markdown: string) =>
	markdown
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_#>`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

function previewFrom(publicSections: Section[], origin: string): SiteData['preview'] {
	const first = publicSections.find((s) => s.body.trim());
	const description = (first ? plain(first.body) : siteHome.fallbackDescription).slice(0, 200);
	return { title: retreat.name, description, image: `${origin}/media/hero-landscape.png` };
}

function sectionView(s: Section, photos: Map<number, Photo[]>): SiteSectionView {
	return {
		id: s.id,
		title: s.title,
		html: renderMarkdown(s.body),
		visibility: s.visibility === 'public' ? 'public' : 'invited',
		photos: (photos.get(s.id) ?? [])
			.filter((p) => p.alt)
			.map((p) => ({ id: p.id, alt: p.alt, width: p.width, height: p.height, src: `/media/site/${p.id}` }))
	};
}

// Updates carry a calendar date (format it in UTC so it never shifts);
// Bluesky posts carry an instant (format it at the retreat, Pacific).
const dayLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const instantLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });

/** Who's coming never breaks the page: any failure renders no cards. */
async function loadAttendees(db: D1Database, profiles: ProfileLoader | undefined): Promise<AttendeeView[]> {
	try {
		return await hydrateAttendees(await shownAttendees(db), profiles);
	} catch (e) {
		console.error('who’s coming load failed', e);
		return [];
	}
}

/**
 * The stream never breaks the page: a failure renders no posts. Days are
 * retreat (Pacific) days — the same day the label shows — and an organizer
 * update leads any Bluesky post from its publish day.
 */
async function loadPosts(
	db: D1Database,
	tier: 'public' | 'invited',
	bsky: { fetch: FetchLike; kv?: KvLike } | undefined
): Promise<SitePostView[]> {
	try {
		// The DB doesn't enforce publishedAt on updates; every write path sets it (validateSection, create), so this only narrows the type.
		const updates = visibleTo(await listUpdates(db), tier).filter((u): u is Section & { publishedAt: string } => u.publishedAt !== null);
		const photos = await photosFor(
			db,
			updates.map((u) => u.id)
		);
		const items: SitePostView[] = updates.map((u): SitePostView => {
			const day = u.publishedAt;
			return {
				kind: 'update',
				key: `u:${u.id}`,
				sortKey: `${day}|1|`,
				datetime: day,
				dateLabel: dayLabel.format(new Date(`${day}T12:00:00Z`)),
				update: sectionView(u, photos)
			};
		});
		if (bsky) {
			const uris = await listBskyPostUris(db);
			const views = await hydrateBskyPosts(uris, bsky);
			for (const uri of uris) {
				const post = views.get(uri);
				if (!post) continue;
				items.push({
					kind: 'bsky',
					key: `b:${uri}`,
					sortKey: `${retreatToday(new Date(post.createdAt))}|0|${post.createdAt}`,
					datetime: post.createdAt,
					dateLabel: instantLabel.format(new Date(post.createdAt)),
					post
				});
			}
		}
		return items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
	} catch (e) {
		console.error('posts stream load failed', e);
		return [];
	}
}

export async function loadSite(input: {
	db: D1Database | undefined;
	organizerDids: string | undefined;
	origin: string;
	who: { did: string; handle: string | null } | null;
	asParam: string | null;
	/** Public-appview profile loader for attendee cards; omitted → no cards (handles must be appview-verified). */
	profiles?: ProfileLoader;
	/** Fixed-host Bluesky fetcher + KV cache for the stream; omitted → updates only. */
	bsky?: { fetch: FetchLike; kv?: KvLike };
}): Promise<SiteData> {
	const actual = await viewerTier(input.db, input.organizerDids, input.who);
	const tier = pageTier(actual, input.asParam);
	const organizer = actual === 'organizer';
	const empty = { title: retreat.name, description: siteHome.fallbackDescription, image: `${input.origin}/media/hero-landscape.png` };
	if (!input.db) return { tier, organizer, sections: [], attendees: [], posts: [], unavailable: true, preview: empty };
	// Started now, awaited below: the appview calls overlap the section reads.
	const attendeesP = loadAttendees(input.db, input.profiles);
	const postsP = loadPosts(input.db, tier, input.bsky);
	try {
		const all = await listSections(input.db);
		const shown = visibleTo(all, tier);
		const photos = await photosFor(
			input.db,
			shown.map((s) => s.id)
		);
		const [attendees, posts] = await Promise.all([attendeesP, postsP]);
		return {
			tier,
			organizer,
			attendees,
			posts,
			unavailable: false,
			preview: previewFrom(visibleTo(all, 'public'), input.origin),
			sections: shown.map((s) => sectionView(s, photos))
		};
	} catch (e) {
		console.error('site sections load failed', e);
		return { tier, organizer, sections: [], attendees: await attendeesP, posts: await postsP, unavailable: true, preview: empty };
	}
}
