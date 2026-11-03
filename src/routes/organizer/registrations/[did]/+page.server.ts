import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireOrganizerOrGate } from '$lib/server/organizer/page-data';
import { getRegistration, updateRegistrationFields, type Registration } from '$lib/server/registration';
import { parseRegistrationForm, validateRegistration } from '$lib/registration/registration';

/**
 * /organizer/registrations/[did] — the organizer edits one attendee's
 * registration. Same access policy as /organizer (signed out → back to the
 * gate, non-organizer → 404). Only the form fields are editable: status and
 * the agreement record stay the attendee's own (see updateRegistrationFields).
 */

export const load: PageServerLoad = async ({ locals, platform, params }): Promise<{ registration: Registration }> => {
	requireOrganizerOrGate(locals, platform);
	const db = platform?.env?.DB;
	if (!db) error(503, { message: 'Storage is not available right now' });
	const registration = await getRegistration(db, params.did);
	if (!registration) error(404, { message: 'No registration for that account' });
	return { registration };
};

export const actions: Actions = {
	save: async ({ locals, platform, params, request }) => {
		requireOrganizerOrGate(locals, platform);
		const db = platform?.env?.DB;
		if (!db) return fail(503, { message: 'Storage is not available right now' });

		// Read the row before validating: a declined row never collected the
		// confirmation-only fields, so those rules would lock it out of editing.
		let existing: Registration | null;
		try {
			existing = await getRegistration(db, params.did);
		} catch (e) {
			console.error('organizer registration read failed', e);
			return fail(500, { message: 'Could not load — try again' });
		}
		if (!existing) return fail(404, { message: 'That registration no longer exists' });

		const input = parseRegistrationForm(await request.formData());
		const checked = validateRegistration(input, {
			agreements: false,
			confirmation: existing.status === 'confirmed'
		});
		if (!checked.ok) return fail(400, { errors: checked.errors, values: input });

		try {
			const updated = await updateRegistrationFields(db, params.did, checked.value);
			if (!updated) return fail(404, { message: 'That registration no longer exists' });
		} catch (e) {
			console.error('organizer registration edit failed', e);
			return fail(500, { message: 'Could not save — try again' });
		}
		return { message: 'Saved', values: checked.value };
	}
};
