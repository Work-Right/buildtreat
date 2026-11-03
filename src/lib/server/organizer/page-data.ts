import { error, redirect } from '@sveltejs/kit';
import {
	isOrganizer,
	type AllowlistEntry,
	type LatePass,
	type OrganizerResponse
} from '$lib/server/organizer/admin';
import type { WaitlistEntry } from '$lib/server/waitlist';
import {
	isRegistered,
	travelStatus,
	type Registration,
	type RegistrationCounts,
	type TravelStatus
} from '$lib/server/registration';
import type { AudienceCount, BroadcastPerson, BroadcastView } from '$lib/server/messaging/broadcasts';

/**
 * Registrations panel view row. `isRegistered`/`travelStatus` from
 * $lib/server/registration are pure but the module lives under $lib/server,
 * so a client component (RegistrationsPanel.svelte, and +page.svelte itself)
 * cannot import them as values — SvelteKit's illegal-import guard blocks any
 * runtime import from $lib/server/* into browser-reachable code, regardless
 * of what the module actually touches at runtime. So the derived fields are
 * computed once here, server-side, and shipped down as plain data.
 */
export type RegistrationView = Registration & { travel: TravelStatus; registered: boolean };

export function toRegistrationView(r: Registration): RegistrationView {
	return { ...r, travel: travelStatus(r), registered: isRegistered(r) };
}

export interface OrganizerPageData {
	authState: 'signed-out' | 'ok';
	/** True only for the dev ?preview fixture state — rendered on-surface. */
	preview: boolean;
	responses: OrganizerResponse[];
	allowlist: AllowlistEntry[];
	latePasses: LatePass[];
	waitlist: WaitlistEntry[];
	reopened: boolean;
	deadline: string | null;
	deadlineDisplay: string | null;
	deadlinePassed: boolean;
	anchors: string[];
	/** True when the anchor read failed — mutations are disabled for this load. */
	anchorsUnavailable: boolean;
	/** True when the registrations read failed — the panel shows an error, not an empty list. */
	registrationsUnavailable: boolean;
	/** False until COMAIL_API_KEY + vars are set — renders setup hints. */
	emailConfigured: boolean;
	/** False until the BSKY_DM_* secrets are set — renders setup hints. */
	dmConfigured: boolean;
	broadcasts: BroadcastView[];
	/** Recipient count per broadcast audience, for the compose selector. */
	audiences: AudienceCount[];
	/** Everyone the compose form can add one at a time, beyond the picked audience. */
	people: BroadcastPerson[];
	registrations: RegistrationView[];
	regDeadlineDisplay: string | null;
	regClosed: boolean;
	regCounts: RegistrationCounts;
	regMissing: AllowlistEntry[];
}

export const EMPTY: Omit<OrganizerPageData, 'authState'> = {
	preview: false,
	responses: [],
	allowlist: [],
	latePasses: [],
	waitlist: [],
	reopened: false,
	deadline: null,
	deadlineDisplay: null,
	deadlinePassed: false,
	anchors: [],
	anchorsUnavailable: false,
	registrationsUnavailable: false,
	emailConfigured: false,
	dmConfigured: false,
	broadcasts: [],
	audiences: [],
	people: [],
	registrations: [],
	regDeadlineDisplay: null,
	regClosed: false,
	regCounts: {
		confirmed: 0,
		registered: 0,
		declined: 0,
		noResponse: 0,
		support: { people: 0, contingent: 0, total: 0, contingentTotal: 0, covered: 0 }
	},
	regMissing: []
};

export function requireOrganizer(locals: App.Locals, platform: App.Platform | undefined): void {
	if (!locals.did || !isOrganizer(platform?.env?.ORGANIZER_DIDS, locals.did)) {
		error(404, { message: 'Not found' });
	}
}

/**
 * For organizer sub-pages (`/organizer/retreat`, `/organizer/registrations/[did]`…):
 * signed out → redirect to the `/organizer` gate; signed in but not an
 * organizer → 404. Returns the organizer's DID.
 */
export function requireOrganizerOrGate(locals: App.Locals, platform: App.Platform | undefined): string {
	if (!locals.did) redirect(303, '/organizer');
	if (!isOrganizer(platform?.env?.ORGANIZER_DIDS, locals.did)) error(404, { message: 'Not found' });
	return locals.did;
}

export function broadcastMessage(run: { sent: number; failed: number; stopped: string | null }): string {
	const parts = [`Sent ${run.sent}`];
	if (run.failed) parts.push(`${run.failed} failed`);
	if (run.stopped) parts.push(`paused on ${run.stopped} — use Retry to resume`);
	return parts.join(' · ');
}
