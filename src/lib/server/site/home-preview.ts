import type { Registration } from '$lib/server/registration';

/**
 * Dev-only `?preview` fixture for `/`: the registration row behind
 * `?preview=registered` / `=declined` (null for every other variant).
 * Synthetic data; the route only calls this under `dev`.
 */
export function previewRegistration(variant: string | null): Registration | null {
	return variant === 'registered' || variant === 'declined'
		? {
				did: 'did:plc:preview',
				handle: 'preview.bsky.social',
				name: 'Preview Builder',
				email: 'preview@example.com',
				status: variant === 'declined' ? 'declined' : 'confirmed',
				phone: '555-0100',
				emergencyName: 'Sam Preview',
				emergencyPhone: '555-0101',
				dietary: ['vegetarian', 'nut_allergy'],
				dietaryOther: '',
				accessibility: variant === 'declined' ? '' : 'Ground-floor room if possible',
				notes: '',
				travelArrival: 'Fri afternoon, PSP',
				travelDeparture: '',
				travelMode: 'flying',
				travelDetails: '',
				supportNeed: variant === 'declined' ? null : 'partial',
				supportAmount: variant === 'declined' ? null : 450,
				supportContingent: variant === 'declined' ? null : false,
				waiverVersion: variant === 'declined' ? null : 'v1',
				cocVersion: variant === 'declined' ? null : 'v1',
				agreedAt: variant === 'declined' ? null : '2026-08-30T18:00:00Z',
				createdAt: '2026-08-30T18:00:00Z',
				updatedAt: '2026-08-30T18:00:00Z'
			}
		: null;
}
