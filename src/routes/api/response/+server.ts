import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkAllowlist, upsertResponse, validateDraft, ValidationError } from '$lib/server/db';
import { surveyGate } from '$lib/server/organizer/admin';
import { retreat } from '$lib/content';
import { verifiedHandle } from '$lib/server/site/verified-handle';

export const PUT: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.did) {
		error(401, { message: 'Sign in with Atmosphere first' });
	}
	const db = platform?.env?.DB;
	if (!db) {
		error(503, { message: 'Storage is not available right now' });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, { message: 'Send JSON' });
	}

	let draft;
	try {
		draft = validateDraft(body);
	} catch (e) {
		if (e instanceof ValidationError) error(422, { message: e.message });
		throw e;
	}

	// Appview-verified handle only (null → DID-only match), the same source
	// the page's gates and tier use, so the write path can't drift from them.
	const handle = await verifiedHandle(locals.did, platform?.env?.PROFILE_CACHE);
	const who = { did: locals.did as string, handle };

	// The deadline check honors the organizer's overrides: the global reopen
	// switch, or a late pass granted to this respondent.
	const gate = await surveyGate(db, platform?.env?.DEADLINE, who);
	if (gate.closed) {
		error(403, {
			message: `The survey closed on ${gate.display} — answers are locked. Ping @${retreat.organizerHandle} if something needs fixing.`
		});
	}

	if (!(await checkAllowlist(db, who))) {
		error(403, {
			message: `This survey is invite-only — your handle isn’t on the list. DM @${retreat.organizerHandle} if that seems wrong.`
		});
	}

	await upsertResponse(db, who, draft);
	return json({ ok: true });
};
