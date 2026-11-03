import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { requireOrganizerOrGate } from '$lib/server/organizer/page-data';
import { loadBskyProfiles } from '@svelte-atproto/oauth/bsky';
import {
	BLURB_MAX,
	consoleAvatars,
	listConsoleAttendees,
	moveFeatured,
	setFeatured,
	type ConsoleAttendeeView
} from '$lib/server/site/featured';
import { appviewProfileCache } from '$lib/server/site/appview-cache';
import { attendeesPreview } from '$lib/server/site/console-preview';

/**
 * /organizer/retreat/attendees — curate "Who's coming". Same access policy
 * as /organizer: signed out → the gate, non-organizer → 404.
 */

const didOf = (form: FormData) => {
	const v = String(form.get('did') ?? '');
	return v.startsWith('did:') && v.length <= 2048 ? v : null;
};

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	// Dev-only design preview with synthetic people; `dev` is compile-time
	// false in production builds, so this path (and its skipped auth) cannot
	// ship. Actions still require an organizer.
	if (dev && url.searchParams.has('preview')) {
		const attendees: ConsoleAttendeeView[] = attendeesPreview().map((a) => ({ ...a, avatar: null }));
		return { attendees, blurbMax: BLURB_MAX, preview: true };
	}
	requireOrganizerOrGate(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	const rows = await listConsoleAttendees(db);
	// Avatars via the public appview only, in the `appview:` cache namespace
	// (same path as the public cards); failure just means glyphs.
	const cache = platform?.env?.PROFILE_CACHE ? appviewProfileCache(platform.env.PROFILE_CACHE) : undefined;
	const avatars = await consoleAvatars(
		rows.map((r) => r.did),
		(dids) => loadBskyProfiles(dids as `did:${string}:${string}`[], { cache })
	);
	const attendees: ConsoleAttendeeView[] = rows.map((r) => ({ ...r, avatar: avatars[r.did] ?? null }));
	return { attendees, blurbMax: BLURB_MAX, preview: false };
};

export const actions: Actions = {
	toggle: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		if (!did) return fail(400, { message: 'Missing person' });
		const shown = form.get('shown') === '1';
		const r = await setFeatured(db, did, { shown });
		if (!r.ok) return fail(400, { message: r.error });
		return { message: shown ? 'Shown on the retreat home' : 'Hidden from the retreat home' };
	},

	blurb: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		if (!did) return fail(400, { message: 'Missing person' });
		const r = await setFeatured(db, did, { blurb: String(form.get('blurb') ?? '') });
		if (!r.ok) return fail(400, { message: r.error });
		return { message: 'Blurb saved' };
	},

	move: async ({ locals, platform, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });
		const form = await request.formData();
		const did = didOf(form);
		const dir = form.get('direction') === 'up' ? 'up' : form.get('direction') === 'down' ? 'down' : null;
		if (!did || !dir) return fail(400, { message: 'Missing person or direction' });
		await moveFeatured(db, did, dir);
		return {};
	}
};
