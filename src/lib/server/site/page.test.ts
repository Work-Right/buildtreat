import { describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { sqliteD1 } from '$lib/server/test/sqlite-d1';
import { createSection } from './sections';
import { setFeatured, type ProfileLoader } from './featured';
import { loadSite } from './page';
import type { FetchLike } from './bsky-posts';

const ORIGIN = 'https://buildersretre.at';
const ORGS = 'did:plc:org1';

async function db(): Promise<D1Database> {
	const d = sqliteD1();
	await d.prepare(`INSERT INTO allowlist (handle, did) VALUES ('invited.test', 'did:plc:inv')`).run();
	await createSection(d, { title: 'The house', body: 'Address: **secret**', visibility: 'invited' }, ORGS);
	return d;
}
const base = { organizerDids: ORGS, origin: ORIGIN, asParam: null };

describe('loadSite', () => {
	it('public viewers get public sections only, rendered', async () => {
		const site = await loadSite({ ...base, db: await db(), who: null });
		expect(site.tier).toBe('public');
		expect(site.sections.map((s) => s.title)).toEqual(['The retreat', "Who's organizing"]);
		expect(site.sections[0].html).toContain('<p>');
		expect(JSON.stringify(site)).not.toContain('secret');
	});

	it('invited viewers also get invited sections, never hidden drafts', async () => {
		const site = await loadSite({ ...base, db: await db(), who: { did: 'did:plc:inv', handle: null } });
		expect(site.tier).toBe('invited');
		expect(site.sections.map((s) => s.title)).toContain('The house');
		expect(site.sections.some((s) => s.title === 'Schedule')).toBe(false);
	});

	it('organizers render invited by default and public with ?as=public', async () => {
		const d = await db();
		const asInvited = await loadSite({ ...base, db: d, who: { did: 'did:plc:org1', handle: null } });
		expect(asInvited).toMatchObject({ tier: 'invited', organizer: true });
		const asPublic = await loadSite({ ...base, db: d, asParam: 'public', who: { did: 'did:plc:org1', handle: null } });
		expect(asPublic.tier).toBe('public');
		expect(JSON.stringify(asPublic)).not.toContain('secret');
	});

	it('link preview uses public content only, with an absolute image url', async () => {
		const site = await loadSite({ ...base, db: await db(), who: { did: 'did:plc:inv', handle: null } });
		expect(site.preview.description).toContain('December 4–7, 2026');
		expect(site.preview.description).not.toContain('secret');
		expect(site.preview.image).toBe(`${ORIGIN}/media/hero-landscape.png`);
	});

	it('a failed read degrades to unavailable, not a throw', async () => {
		const broken = { prepare: () => { throw new Error('down'); } } as unknown as D1Database;
		const site = await loadSite({ ...base, db: broken, who: null });
		expect(site).toMatchObject({ unavailable: true, sections: [], attendees: [], posts: [] });
	});

	it('ignores ?as for non-organizers', async () => {
		const d = await db();
		// Invited viewer with asParam: 'public' still gets invited tier and sees 'The house'
		const invitedAsPublic = await loadSite({
			...base,
			db: d,
			asParam: 'public',
			who: { did: 'did:plc:inv', handle: null }
		});
		expect(invitedAsPublic.tier).toBe('invited');
		expect(invitedAsPublic.sections.map((s) => s.title)).toContain('The house');

		// Signed-out viewer with asParam: 'invited' gets public tier and doesn't see secret
		const publicAsInvited = await loadSite({
			...base,
			db: d,
			asParam: 'invited',
			who: null
		});
		expect(publicAsInvited.tier).toBe('public');
		expect(JSON.stringify(publicAsInvited)).not.toContain('secret');
	});

	it('builds the link preview from public sections only', async () => {
		const d = sqliteD1();
		await d.prepare(`DELETE FROM site_sections`).run();
		// Create invited section with secret
		await createSection(
			d,
			{ title: 'Invited secrets', body: 'Invited-only **secret**', visibility: 'invited' },
			ORGS
		);
		// Create public section
		await createSection(
			d,
			{ title: 'Public info', body: 'Public intro text', visibility: 'public' },
			ORGS
		);
		// Allowlist and load as invited viewer
		await d.prepare(`INSERT INTO allowlist (handle, did) VALUES ('v.test', 'did:plc:v')`).run();
		const site = await loadSite({
			...base,
			db: d,
			who: { did: 'did:plc:v', handle: 'v.test' }
		});
		expect(site.preview.description).toContain('Public intro text');
		expect(site.preview.description).not.toContain('secret');
	});

	it('shows curated, still-confirmed attendees to every tier', async () => {
		const d = await db();
		const at = '2026-09-01T00:00:00Z';
		for (const [did, handle, status] of [
			['did:plc:inv', 'invited.test', 'confirmed'],
			['did:plc:gone', 'gone.test', 'confirmed'],
			['did:plc:hidden', 'hidden.test', 'confirmed']
		] as const) {
			await d
				.prepare(
					`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
					 VALUES (?1, ?2, 'Private Name', 'x@example.com', ?3, ?4, ?4, ?4)`
				)
				.bind(did, handle, status, at)
				.run();
		}
		await setFeatured(d, 'did:plc:inv', { shown: true, blurb: 'building feeds' });
		await setFeatured(d, 'did:plc:gone', { shown: true });
		await setFeatured(d, 'did:plc:hidden', { blurb: 'not shown' });
		await d.prepare(`UPDATE registrations SET status = 'declined' WHERE did = 'did:plc:gone'`).run();

		const profiles: ProfileLoader = async () => ({
			'did:plc:inv': { handle: 'inv.example', displayName: 'Inv', avatar: 'https://cdn.bsky.app/a.jpg' }
		});
		for (const who of [null, { did: 'did:plc:inv', handle: null }]) {
			const site = await loadSite({ ...base, db: d, who, profiles });
			expect(site.attendees).toEqual([
				{ did: 'did:plc:inv', handle: 'inv.example', displayName: 'Inv', avatar: 'https://cdn.bsky.app/a.jpg', blurb: 'building feeds' }
			]);
			expect(JSON.stringify(site)).not.toContain('Private Name');
		}
	});

	it('a profile failure omits attendees (no unverified handles), never a throw', async () => {
		const d = await db();
		await d
			.prepare(
				`INSERT INTO registrations (did, handle, name, email, status, agreed_at, created_at, updated_at)
				 VALUES ('did:plc:inv', 'invited.test', 'N', 'x@example.com', 'confirmed', ?1, ?1, ?1)`
			)
			.bind('2026-09-01T00:00:00Z')
			.run();
		await setFeatured(d, 'did:plc:inv', { shown: true });
		const site = await loadSite({ ...base, db: d, who: null, profiles: async () => { throw new Error('down'); } });
		expect(site.attendees).toEqual([]);
		expect(site.unavailable).toBe(false);
	});
	it('merges visible updates and Bluesky posts newest first; updates leave the page flow', async () => {
		const d = await db();
		await createSection(d, { title: 'Old news', body: 'public update', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, ORGS);
		await createSection(d, { title: 'Invited news', body: 'invited **secret** update', visibility: 'invited', kind: 'update', publishedAt: '2026-10-20' }, ORGS);
		await createSection(d, { title: 'Draft news', body: 'hidden', visibility: 'hidden', kind: 'update', publishedAt: '2026-10-25' }, ORGS);
		const did = 'did:plc:abcdefghijklmnopqrstuvwx';
		const live = `at://${did}/app.bsky.feed.post/3l6oveex3ii2l`;
		const gone = `at://${did}/app.bsky.feed.post/3l6oveex3ii2m`;
		await d.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?3, ?4), (?2, ?3, ?4)`).bind(live, gone, '2026-10-11T00:00:00Z', ORGS).run();
		const fetchFn: FetchLike = async () =>
			new Response(
				JSON.stringify({
					posts: [
						{
							uri: live,
							author: { did, handle: 'alice.test' },
							record: { text: 'see you there', createdAt: '2026-10-10T17:00:00.000Z' }
						}
					]
				}),
				{ status: 200 }
			);
		const bsky = { fetch: fetchFn };

		const pub = await loadSite({ ...base, db: d, who: null, bsky });
		expect(pub.posts.map((p) => (p.kind === 'update' ? p.update.title : p.post.uri))).toEqual([live, 'Old news']);
		expect(pub.posts.map((p) => p.dateLabel)).toEqual(['Oct 10, 2026', 'Oct 1, 2026']);
		expect(pub.sections.some((s) => s.title.includes('news'))).toBe(false);
		expect(JSON.stringify(pub)).not.toContain('secret');

		const inv = await loadSite({ ...base, db: d, who: { did: 'did:plc:inv', handle: null }, bsky });
		expect(inv.posts.map((p) => (p.kind === 'update' ? p.update.title : 'bsky'))).toEqual(['Invited news', 'bsky', 'Old news']);
		expect(JSON.stringify(inv)).not.toContain('Draft news');
	});

	it('without a Bluesky fetcher (or when it fails) the stream still shows updates', async () => {
		const d = await db();
		await createSection(d, { title: 'Hello', body: 'x', visibility: 'public', kind: 'update', publishedAt: '2026-10-01' }, ORGS);
		await d.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?2, ?3)`).bind('at://did:plc:abcdefghijklmnopqrstuvwx/app.bsky.feed.post/abc', '2026-10-11T00:00:00Z', ORGS).run();
		const failing: FetchLike = async () => { throw new Error('down'); };
		for (const bsky of [undefined, { fetch: failing }]) {
			const site = await loadSite({ ...base, db: d, who: null, bsky });
			expect(site.posts.map((p) => p.kind)).toEqual(['update']);
		}
	});

	it('an update leads a Bluesky post from the same Pacific day, even one that is already tomorrow in UTC', async () => {
		const d = await db();
		await createSection(d, { title: 'Same day', body: '', visibility: 'public', kind: 'update', publishedAt: '2026-10-31' }, ORGS);
		const did = 'did:plc:abcdefghijklmnopqrstuvwx';
		const late = `at://${did}/app.bsky.feed.post/3l6oveex3ii2l`;
		await d.prepare(`INSERT INTO site_bsky_posts (uri, added_at, added_by) VALUES (?1, ?2, ?3)`).bind(late, '2026-11-01T00:00:00Z', ORGS).run();
		// 7 PM Pacific on Oct 31 = Nov 1 in UTC.
		const fetchFn: FetchLike = async () =>
			new Response(JSON.stringify({ posts: [{ uri: late, author: { did, handle: 'alice.test' }, record: { text: 'x', createdAt: '2026-11-01T02:00:00.000Z' } }] }), { status: 200 });
		const site = await loadSite({ ...base, db: d, who: null, bsky: { fetch: fetchFn } });
		expect(site.posts.map((p) => [p.kind, p.dateLabel])).toEqual([
			['update', 'Oct 31, 2026'],
			['bsky', 'Oct 31, 2026']
		]);
	});
});
