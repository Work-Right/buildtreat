import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { requireOrganizerOrGate } from '$lib/server/organizer/page-data';
import {
	createSection,
	listSections,
	listUpdates,
	moveSection,
	retreatToday,
	updateSection,
	validateSection
} from '$lib/server/site/sections';
import {
	addBskyPost,
	appviewFetch,
	consoleItems,
	hydrateBskyPosts,
	isPostUri,
	kvLike,
	listBskyPostUris,
	parsePostUrl,
	postUri,
	removeBskyPost,
	resolveDid
} from '$lib/server/site/bsky-posts';
import {
	addPhoto,
	UnknownSectionError,
	deletePhoto,
	deleteSection,
	deleteSectionWithoutMedia,
	movePhoto,
	photosFor,
	setPhotoAlt,
	isPhotoType,
	PHOTO_MAX_BYTES,
	UPLOAD_LIMIT_MESSAGE,
	UPLOAD_MAX_FILES,
	UPLOAD_MAX_TOTAL_BYTES,
	validatePhoto
} from '$lib/server/site/photos';
import { imageSize } from '$lib/server/site/image-size';
import { stripReason } from '$lib/server/site/strip-metadata';
import { consolePreview } from '$lib/server/site/console-preview';

/**
 * /organizer/retreat — edit the retreat home's sections, updates, photos
 * and the Bluesky posts in the stream. Same
 * access policy as /organizer (requireOrganizerOrGate): signed out → the
 * gate, non-organizer → 404.
 */

const sectionId = (form: FormData) => {
	const n = Number(form.get('id'));
	return Number.isInteger(n) && n > 0 ? n : null;
};
const direction = (form: FormData) => (form.get('direction') === 'up' ? 'up' : form.get('direction') === 'down' ? 'down' : null);

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	// Dev-only design preview with synthetic data; `dev` is compile-time false
	// in production builds, so this path (and its skipped auth) cannot ship.
	// Actions still require an organizer.
	if (dev && url.searchParams.has('preview')) return { ...consolePreview(), preview: true };
	requireOrganizerOrGate(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	const [sections, updates, uris] = await Promise.all([listSections(db), listUpdates(db), listBskyPostUris(db)]);
	const [photos, views] = await Promise.all([
		photosFor(
			db,
			[...sections, ...updates].map((s) => s.id)
		),
		// Fixed host only; an unresolvable post stays listed so it can be removed.
		hydrateBskyPosts(uris, { fetch: appviewFetch, kv: kvLike(platform?.env?.PROFILE_CACHE) })
	]);
	return {
		sections: sections.map((s) => ({ ...s, photos: photos.get(s.id) ?? [] })),
		updates: updates.map((s) => ({ ...s, photos: photos.get(s.id) ?? [] })),
		today: retreatToday(),
		bskyPosts: consoleItems(uris, views),
		mediaConfigured: Boolean(platform?.env?.SITE_MEDIA),
		preview: false
	};
};

export const actions: Actions = {
	create: async ({ locals, platform, request }) => {
		const by = requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const asUpdate = (await request.formData()).get('kind') === 'update';
		const id = await createSection(
			db,
			asUpdate
				? { title: 'New update', body: '', visibility: 'hidden', kind: 'update', publishedAt: retreatToday() }
				: { title: 'New section', body: '', visibility: 'hidden' },
			by
		);
		return { message: `${asUpdate ? 'Update' : 'Section'} added (hidden until you change who can see it)`, sectionId: id };
	},

	save: async ({ locals, platform, request }) => {
		const by = requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const id = sectionId(form);
		if (!id) return fail(400, { message: 'Missing section' });
		const checked = validateSection({
			title: form.get('title'),
			body: form.get('body'),
			visibility: form.get('visibility'),
			kind: form.get('kind'),
			publishedAt: form.get('publishedAt')
		});
		if (!checked.ok) return fail(400, { message: checked.error, sectionId: id });
		const result = await updateSection(db, id, checked.value, by, String(form.get('updatedAt') ?? ''));
		if (result === 'conflict') return fail(409, { message: 'Changed elsewhere — reload first', sectionId: id });
		if (result === 'missing') return fail(404, { message: 'That section no longer exists' });
		return { message: 'Saved', sectionId: id };
	},

	move: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const id = sectionId(form);
		const dir = direction(form);
		if (!id || !dir) return fail(400, { message: 'Missing section or direction' });
		await moveSection(db, id, dir);
		return { sectionId: id };
	},

	delete: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const id = sectionId(await request.formData());
		if (!id) return fail(400, { message: 'Missing section' });
		if (!bucket) {
			// Without R2 a section can only go if it has no photos to clean up.
			const r = await deleteSectionWithoutMedia(db, id);
			if (r === 'has-photos') {
				return fail(503, { message: 'Photo storage is unavailable — can’t delete a section with photos yet', sectionId: id });
			}
			if (!r) return fail(404, { message: 'That section no longer exists' });
			return { message: 'Section deleted' };
		}
		if (!(await deleteSection(db, bucket, id))) return fail(404, { message: 'That section no longer exists' });
		return { message: 'Section deleted' };
	},

	upload: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		if (!bucket) return fail(503, { message: 'Photo storage isn’t set up yet' });
		// A declared body far over the cap isn't even parsed (1 MB form overhead).
		if (Number(request.headers.get('content-length') ?? 0) > UPLOAD_MAX_TOTAL_BYTES + 1024 * 1024) {
			return fail(400, { message: UPLOAD_LIMIT_MESSAGE });
		}
		const form = await request.formData();
		const id = sectionId(form);
		if (!id) return fail(400, { message: 'Missing section' });
		const files = form.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
		if (!files.length) return fail(400, { message: 'Pick at least one photo', sectionId: id });
		// Bound memory/CPU per request before any bytes are read or stripped.
		const total = files.reduce((sum, f) => sum + f.size, 0);
		if (files.length > UPLOAD_MAX_FILES || total > UPLOAD_MAX_TOTAL_BYTES) {
			return fail(400, { message: UPLOAD_LIMIT_MESSAGE, sectionId: id });
		}
		const failures: string[] = [];
		let added = 0;
		for (const file of files) {
			// Wrong type or oversize: validatePhoto names the problem without a read.
			if (!isPhotoType(file.type) || file.size > PHOTO_MAX_BYTES) {
				const rejected = validatePhoto(file, undefined, undefined);
				if (!rejected.ok) failures.push(`${file.name}: ${rejected.error}`);
				continue;
			}
			// Metadata (EXIF GPS, XMP, IPTC) never reaches storage, whatever the
			// client did; the pixel size comes from the bytes, never the browser.
			const result = stripReason(new Uint8Array(await file.arrayBuffer()), file.type);
			if (!('bytes' in result)) {
				const why = result.reason === 'animated' ? 'Animated images aren’t supported' : 'Couldn’t read that image';
				failures.push(`${file.name}: ${why}`);
				continue;
			}
			const stripped = result.bytes;
			const dims = imageSize(stripped, file.type);
			const checked = validatePhoto({ type: file.type, size: stripped.length }, dims?.width, dims?.height);
			if (!checked.ok) {
				failures.push(`${file.name}: ${checked.error}`);
				continue;
			}
			try {
				await addPhoto(db, bucket, id, new Blob([stripped], { type: checked.contentType }), checked);
				added++;
			} catch (e) {
				if (e instanceof UnknownSectionError) {
					return fail(404, { message: 'That section no longer exists — reload', sectionId: id });
				}
				console.error('photo upload failed', e);
				failures.push(`${file.name}: storage unavailable`);
			}
		}
		if (!added) return fail(400, { message: failures.join(' · '), sectionId: id });
		return {
			message: `Added ${added} photo${added === 1 ? '' : 's'} — add alt text to show them${failures.length ? ` · ${failures.join(' · ')}` : ''}`,
			sectionId: id
		};
	},

	bskyAdd: async ({ locals, platform, request }) => {
		const by = requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now', bsky: true });
		const raw = String((await request.formData()).get('url') ?? '');
		// Input becomes identifiers only; the fetches go to public.api.bsky.app.
		// Parse first, so a bad link and an unreachable appview read differently.
		const parsed = parsePostUrl(raw);
		if (!parsed) {
			return fail(400, { message: 'Paste a post link like https://bsky.app/profile/name.bsky.social/post/…', bsky: true });
		}
		const resolved = await resolveDid(parsed.actor, appviewFetch);
		if (resolved === 'not-found') {
			return fail(400, { message: 'No Bluesky account with that handle — check the link', bsky: true });
		}
		if (resolved === 'error') return fail(502, { message: 'Couldn’t reach Bluesky — try again in a minute', bsky: true });
		const uri = postUri(resolved.did, parsed.rkey);
		// fresh: a just-published post isn't held back by an old negative cache entry.
		const views = await hydrateBskyPosts([uri], { fetch: appviewFetch, kv: kvLike(platform?.env?.PROFILE_CACHE), fresh: true });
		if (!views.has(uri)) {
			return fail(404, { message: 'Couldn’t load that post from Bluesky — check the link, or try again in a minute', bsky: true });
		}
		const r = await addBskyPost(db, uri, by);
		return { message: r === 'added' ? 'Post added to the stream' : 'That post is already in the stream', bsky: true };
	},

	bskyRemove: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now', bsky: true });
		const uri = String((await request.formData()).get('uri') ?? '');
		if (!isPostUri(uri)) return fail(400, { message: 'Missing post', bsky: true });
		if (!(await removeBskyPost(db, uri))) return fail(404, { message: 'That post was already removed', bsky: true });
		return { message: 'Post removed from the stream', bsky: true };
	},

	photoAlt: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const ok = await setPhotoAlt(db, String(form.get('photo') ?? ''), String(form.get('alt') ?? ''));
		if (!ok) return fail(404, { message: 'That photo no longer exists' });
		return { message: 'Alt text saved', sectionId: sectionId(form) };
	},

	photoMove: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const dir = direction(form);
		if (!dir) return fail(400, { message: 'Missing direction' });
		await movePhoto(db, String(form.get('photo') ?? ''), dir);
		return { sectionId: sectionId(form) };
	},

	photoDelete: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		const bucket = platform?.env?.SITE_MEDIA;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		if (!bucket) return fail(503, { message: 'Photo storage isn’t set up yet' });
		const form = await request.formData();
		const ok = await deletePhoto(db, bucket, String(form.get('photo') ?? ''));
		if (!ok) return fail(404, { message: 'That photo no longer exists' });
		return { message: 'Photo deleted', sectionId: sectionId(form) };
	}
};
