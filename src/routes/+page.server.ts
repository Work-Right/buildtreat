import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dev } from '$app/environment';
import { loadBskyProfile, loadBskyProfiles } from '@svelte-atproto/oauth/bsky';
import { actorToDid } from '@svelte-atproto/oauth/helper';
import { cloudflareKV } from '@svelte-atproto/oauth/server/stores/cloudflare';
import { codeOfConduct, retreat, waiver, type TravelValue } from '$lib/content';
import { checkAllowlist, getResponse } from '$lib/server/db';
import { sendEmail } from '$lib/server/messaging/email';
import { getRegistration, setDeclined, upsertConfirmed, type Registration } from '$lib/server/registration';
import { confirmationEmail } from '$lib/server/messaging/registration-email';
import { asksSupport, canConfirm, parseRegistrationForm, validateRegistration } from '$lib/registration/registration';
import { backfillWaitlistHandle, getWaitlistEntry, isValidWaitlistEmail, joinWaitlist, type WaitlistState } from '$lib/server/waitlist';
import type { SurveyDraft } from '$lib/survey/survey.svelte';
import type { KnownUser } from '$lib/types';
import { loadSite } from '$lib/server/site/page';
import { appviewProfileCache } from '$lib/server/site/appview-cache';
import { appviewFetch, kvLike } from '$lib/server/site/bsky-posts';
import { previewRegistration } from '$lib/server/site/home-preview';
import { verifiedHandle } from '$lib/server/site/verified-handle';
import { registrationGate, surveyGate } from '$lib/server/organizer/admin';

/** Enough of a DID to correlate log lines without logging the full identifier. */
const logDid = (did: string) => `${did.slice(0, 14)}…`;

export interface PageUser {
	did: string;
	handle: string | null;
	displayName: string | null;
	avatar: string | null;
}

export interface Organizer {
	handle: string;
	avatar: string | null;
}

const KNOWN_COOKIE = 'abr_known';

/** Strict shape check: the cookie value renders in the sheet and seeds login(),
 * and a sibling-subdomain page could plant a non-httpOnly copy. */
const KNOWN_HANDLE_RE = /^[a-z0-9.:-]{1,253}$/i;

function readKnownUser(raw: string | undefined): KnownUser | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (typeof parsed.handle !== 'string' || !KNOWN_HANDLE_RE.test(parsed.handle)) return null;
		return {
			handle: parsed.handle,
			displayName: typeof parsed.displayName === 'string' ? parsed.displayName.slice(0, 64) : null,
			avatar:
				typeof parsed.avatar === 'string' && parsed.avatar.startsWith('https://') && parsed.avatar.length <= 512 ? parsed.avatar : null
		};
	} catch {
		return null;
	}
}

/** Bound on the organizer-avatar lookup: a slow resolver must not stall `/`. */
const ORGANIZER_TIMEOUT_MS = 2000;

/** The organizer's avatar, resolved from the public appview and cached. */
async function loadOrganizer(profileCache: ReturnType<typeof cloudflareKV> | undefined): Promise<Organizer> {
	const fallback: Organizer = { handle: retreat.organizerHandle, avatar: null };
	let timer: ReturnType<typeof setTimeout> | undefined;
	const lookup = (async (): Promise<Organizer> => {
		const did = await actorToDid(retreat.organizerHandle);
		if (!did) return fallback;
		const profile = await loadBskyProfile(did, { cache: profileCache });
		return { handle: retreat.organizerHandle, avatar: profile?.avatar ?? null };
	})().catch(() => fallback);
	const timeout = new Promise<Organizer>((resolve) => {
		timer = setTimeout(() => resolve(fallback), ORGANIZER_TIMEOUT_MS);
	});
	try {
		return await Promise.race([lookup, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export const load: PageServerLoad = async ({ locals, platform, url, cookies, setHeaders }) => {
	// What `/` shows depends on who is asking (tier, invite state): never let
	// a shared cache hand one visitor's page to another.
	setHeaders({ 'cache-control': 'private, no-store' });

	// The OAuth library redirects back with ?error=... when a login fails.
	const authError = url.searchParams.get('error');

	const db = platform?.env?.DB;
	const profileCache = platform?.env?.PROFILE_CACHE ? cloudflareKV(platform.env.PROFILE_CACHE, { ttl: 3600 }) : undefined;

	// Base gates (no respondent yet): the survey's deadline + reopen switch,
	// and registration's own deadline. A signed-in visitor gets both re-asked
	// below so a late pass can lift them. The organizer avatar lookup runs
	// alongside (bounded by a timeout) instead of in front.
	const [{ deadline, closed }, reg, organizer] = await Promise.all([
		surveyGate(db, platform?.env?.DEADLINE, null),
		registrationGate(db, platform?.env?.REG_DEADLINE, null),
		loadOrganizer(profileCache)
	]);
	let regBase = { regDeadline: reg.deadline, regDeadlineDisplay: reg.display, regClosed: reg.closed };

	const knownUser = readKnownUser(cookies.get(KNOWN_COOKIE));
	const registerMode = url.searchParams.has('register');
	const origin = platform?.env?.ORIGIN ?? url.origin;
	// Attendee cards use the batch appview call (no PDS fallback) with their
	// own `appview:` cache namespace: the shared PROFILE_CACHE keys can hold
	// a PDS fallback written by loadBskyProfile, whose handle is unverified.
	const attendeeCache = platform?.env?.PROFILE_CACHE ? appviewProfileCache(platform.env.PROFILE_CACHE) : undefined;
	const attendeeProfiles = (dids: string[]) => loadBskyProfiles(dids as `did:${string}:${string}`[], { cache: attendeeCache });
	const siteFor = (who: { did: string; handle: string | null } | null) =>
		loadSite({
			db,
			organizerDids: platform?.env?.ORGANIZER_DIDS,
			origin,
			who,
			asParam: url.searchParams.get('as'),
			profiles: attendeeProfiles,
			// Fixed host only (public.api.bsky.app), KV-cached for an hour.
			bsky: { fetch: appviewFetch, kv: kvLike(platform?.env?.PROFILE_CACHE) }
		});

	// Dev-only design preview; `dev` is compile-time false in production
	// builds, so this path cannot ship. `?preview` = the signed-in survey;
	// `?preview=notinvited` / `=member` render the waitlist states.
	if (dev && url.searchParams.has('preview')) {
		const variant = url.searchParams.get('preview');
		const uninvited = variant === 'notinvited' || variant === 'member';
		const regVariant = variant === 'register' || variant === 'registered' || variant === 'declined';
		const previewReg = previewRegistration(variant);
		return {
			site: await siteFor({ did: 'did:plc:preview', handle: 'preview.bsky.social' }),
			registerMode,
			user: {
				did: 'did:plc:preview',
				handle: uninvited ? 'newbuilder.bsky.social' : 'preview.bsky.social',
				displayName: uninvited ? 'New Builder' : 'Preview Builder',
				avatar: null
			} as PageUser,
			allowed: !uninvited,
			waitlistState: (variant === 'member' ? 'member' : 'none') as WaitlistState,
			waitlistEmail: variant === 'member' ? 'you@example.com' : null,
			answers: null as SurveyDraft | null,
			existingResponse: false,
			organizer,
			deadline,
			closed,
			knownUser,
			authError,
			...regBase,
			registrationMode: regVariant,
			registration: previewReg,
			prefill: { name: 'Preview Builder', email: 'preview@example.com' },
			// `?preview=register&travel=partial` previews the support section.
			surveyTravel: (['yes', 'partial', 'no'] as const).find((v) => v === url.searchParams.get('travel')) ?? null
		};
	}

	if (!locals.did) {
		return {
			site: await siteFor(null),
			registerMode,
			user: null as PageUser | null,
			allowed: true,
			waitlistState: 'none' as WaitlistState,
			waitlistEmail: null as string | null,
			answers: null as SurveyDraft | null,
			existingResponse: false,
			organizer,
			deadline,
			closed,
			knownUser,
			authError,
			...regBase,
			registrationMode: false,
			registration: null as Registration | null,
			prefill: { name: '', email: '' },
			surveyTravel: null as TravelValue | null
		};
	}

	// Two lookups, two jobs. `profile` is for DISPLAY only: loadBskyProfile
	// falls back to the user's own PDS, so its handle is merely claimed.
	// Every allowlist / late-pass / tier match below uses `who`, whose handle
	// the public appview has verified (null → DID-only matching).
	const [profile, handle] = await Promise.all([
		loadBskyProfile(locals.did, { cache: profileCache }).catch((e) => {
			console.error('profile load failed for', logDid(locals.did), e);
			return undefined;
		}),
		verifiedHandle(locals.did, platform?.env?.PROFILE_CACHE)
	]);
	const who = { did: locals.did, handle };

	const user: PageUser = {
		did: locals.did,
		handle: profile?.handle ?? null,
		displayName: profile?.displayName ?? null,
		avatar: profile?.avatar ?? null
	};

	// Late passes are per-respondent: only now that we know who this is can
	// the gate answer for them specifically.
	const userGate = closed && db ? await surveyGate(db, platform?.env?.DEADLINE, who) : null;
	const closedForUser = userGate ? userGate.closed : closed;
	if (reg.closed && db) {
		const userReg = await registrationGate(db, platform?.env?.REG_DEADLINE, who);
		// A late pass reopens the form for this person; the "register by" date
		// is dropped so the hero doesn't advertise a deadline already behind them.
		if (userReg.latePass) regBase = { regDeadline: reg.deadline, regDeadlineDisplay: null, regClosed: false };
	}

	// The allowlist gates the whole survey, not just submission: a signed-in
	// account that isn't invited sees the polite invite-only state and the
	// feed stays sealed. This gate is a courtesy, so it degrades OPEN: the
	// response API re-enforces authoritatively on write, and a false "not on
	// the list" screen for an invited user is worse than an uninvited one
	// browsing questions they can't submit.
	let allowed = true;
	if (db) {
		try {
			allowed = await checkAllowlist(db, who);
			if (!allowed && !profile) {
				// Identity resolution failed above — a handle-less lookup can't
				// confidently deny (DIDs are pre-pinned, but stay honest).
				console.error('allowlist: unverifiable without profile for', logDid(locals.did));
				allowed = true;
			}
		} catch (e) {
			console.error('allowlist check failed for', logDid(locals.did), e);
		}
	}

	// Remember who signed in (identity hint only, no credentials) so a
	// returning visitor — even after logout — gets a one-tap re-entry. Only
	// for allowed users: a denied account shouldn't be greeted back into a
	// login that will be denied again.
	if (user.handle && allowed) {
		cookies.set(
			KNOWN_COOKIE,
			JSON.stringify({ handle: user.handle, displayName: user.displayName, avatar: user.avatar }),
			// 30 days comfortably covers the survey window (see the DEADLINE
			// binding) while keeping identity-hint retention short.
			{ path: '/', maxAge: 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'lax', secure: !dev }
		);
	}

	const stored =
		db && allowed
			? await getResponse(db, locals.did).catch((e) => {
					console.error('response load failed for', logDid(locals.did), e);
					return null;
				})
			: null;

	// Registration row for the front door (allowed users only).
	const registration =
		db && allowed
			? await getRegistration(db, locals.did).catch((e) => {
					console.error('registration load failed for', logDid(locals.did), e);
					return null;
				})
			: null;

	// Uninvited visitors: are they already on the waitlist? Drives the
	// invitation-vs-confirmation state on the hero. (Promoted people are
	// `allowed` and never reach this branch.)
	let waitlistState: WaitlistState = 'none';
	let waitlistEmail: string | null = null;
	if (db && !allowed) {
		const entry = await getWaitlistEntry(db, locals.did).catch((e) => {
			console.error('waitlist load failed for', logDid(locals.did), e);
			return null;
		});
		if (entry) {
			waitlistState = 'member';
			waitlistEmail = entry.email;
			// Self-heal a null/stale handle (transient profile failure at join,
			// or a later handle change) so the row stays promotable. Silent,
			// no user action — a plain revisit repairs it.
			// Verified handle only: promotion allowlists (and pins) this handle.
			if (handle && entry.handle !== handle) {
				await backfillWaitlistHandle(db, locals.did, handle).catch((e) =>
					console.error('waitlist handle backfill failed for', logDid(locals.did), e)
				);
			}
		}
	}

	return {
		site: await siteFor(who),
		registerMode,
		user,
		allowed,
		waitlistState,
		waitlistEmail,
		answers: stored?.draft ?? null,
		existingResponse: stored !== null,
		organizer,
		deadline,
		closed: closedForUser,
		knownUser,
		authError,
		...regBase,
		registrationMode: allowed,
		registration,
		prefill: {
			name: stored?.draft.name ?? user.displayName ?? '',
			email: stored?.draft.email ?? ''
		},
		/** Survey travel answer — decides whether registration asks about support. */
		surveyTravel: stored?.draft.travel ?? null
	};
};

export const actions: Actions = {
	// Join the waitlist. Requires an authenticated session; the handle is
	// resolved from the DID server-side (never trusted from the form) so a
	// later promotion allowlists the right identity. On success the load
	// re-runs and the hero flips to the confirmation state.
	joinWaitlist: async ({ locals, platform, request }) => {
		if (!locals.did) return fail(401, { waitlistError: 'Sign in first, then add your name.' });
		const db = platform?.env?.DB;
		if (!db) return fail(503, { waitlistError: 'Storage is not available right now — try again shortly.' });

		const email = String((await request.formData()).get('email') ?? '')
			.trim()
			.slice(0, 320);
		if (!isValidWaitlistEmail(email)) {
			return fail(400, { waitlistError: 'Enter a valid email so we can reach you.' });
		}

		// Appview-verified only: promotion allowlists this handle pinned to
		// this DID, so a PDS-claimed handle must never be stored here.
		const handle = await verifiedHandle(locals.did, platform?.env?.PROFILE_CACHE);

		try {
			await joinWaitlist(db, { did: locals.did, handle, email });
		} catch (e) {
			console.error('waitlist join failed for', logDid(locals.did), e);
			return fail(500, { waitlistError: 'Something went wrong adding you — please try again.' });
		}
		return { joined: true };
	},

	// Confirm attendance + the full form. Deadline rule: a NEW confirmation
	// is refused after REG_DEADLINE; an existing confirmed row may always be
	// edited (travel firms up late by design).
	register: async ({ locals, platform, request }) => {
		if (!locals.did) return fail(401, { regMessage: 'Sign in first.' });
		const db = platform?.env?.DB;
		if (!db) return fail(503, { regMessage: 'Storage is not available right now — try again shortly.' });

		// Support is required of exactly the people the form asked — same
		// survey lookup the load used, so the rule can't drift from the UI.
		// A failed lookup must not pass as "never surveyed": that would demand
		// fields the rendered form (built from a stored "yes") never showed.
		let surveyTravel: TravelValue | null;
		try {
			surveyTravel = (await getResponse(db, locals.did))?.draft.travel ?? null;
		} catch (e) {
			console.error('survey lookup failed for', logDid(locals.did), e);
			return fail(503, { regMessage: 'Something went wrong — please try again.' });
		}
		const input = parseRegistrationForm(await request.formData());
		const checked = validateRegistration(input, { support: asksSupport(surveyTravel) });
		if (!checked.ok) return fail(400, { regErrors: checked.errors, regValues: input });

		// Appview-verified handle only (null → DID-only match): a PDS-claimed
		// handle must not match or pin an invitee's row.
		const handle = await verifiedHandle(locals.did, platform?.env?.PROFILE_CACHE);

		try {
			const allowed = await checkAllowlist(db, { did: locals.did, handle });
			if (!allowed) return fail(403, { regMessage: 'Registration is for invited builders.' });

			const existing = await getRegistration(db, locals.did);
			const { closed } = await registrationGate(db, platform?.env?.REG_DEADLINE, { did: locals.did, handle });
			if (!canConfirm(closed, existing)) return fail(403, { regClosed: true });

			await upsertConfirmed(db, { did: locals.did, handle }, checked.value, {
				waiver: waiver.version,
				coc: codeOfConduct.version
			});

			// Best-effort confirmation: never blocks the registration.
			if (!existing || existing.status !== 'confirmed') {
				const saved = await getRegistration(db, locals.did);
				if (saved) {
					const mail = confirmationEmail(saved);
					const result = await sendEmail(platform?.env ?? {}, { to: saved.email, ...mail });
					if (!result.ok) console.error('registration confirmation email failed', result.code, result.detail ?? '');
				}
			}
		} catch (e) {
			console.error('registration save failed for', logDid(locals.did), e);
			return fail(500, { regMessage: 'Something went wrong saving your registration — please try again.' });
		}
		return { registered: true };
	},

	// One tap, no form. Always allowed, before or after the deadline.
	decline: async ({ locals, platform }) => {
		if (!locals.did) return fail(401, { regMessage: 'Sign in first.' });
		const db = platform?.env?.DB;
		if (!db) return fail(503, { regMessage: 'Storage is not available right now — try again shortly.' });

		const profileCache = platform?.env?.PROFILE_CACHE ? cloudflareKV(platform.env.PROFILE_CACHE, { ttl: 3600 }) : undefined;
		// Display name fallback only; matching uses the appview-verified handle.
		const [profile, handle] = await Promise.all([
			loadBskyProfile(locals.did, { cache: profileCache }).catch(() => undefined),
			verifiedHandle(locals.did, platform?.env?.PROFILE_CACHE)
		]);

		try {
			const allowed = await checkAllowlist(db, { did: locals.did, handle });
			if (!allowed) return fail(403, { regMessage: 'Registration is for invited builders.' });
			const stored = await getResponse(db, locals.did).catch(() => null);
			await setDeclined(db, {
				did: locals.did,
				handle,
				name: stored?.draft.name ?? profile?.displayName ?? handle ?? locals.did,
				email: stored?.draft.email ?? ''
			});
		} catch (e) {
			console.error('registration decline failed for', logDid(locals.did), e);
			return fail(500, { regMessage: 'Something went wrong — please try again.' });
		}
		return { declined: true };
	}
};
