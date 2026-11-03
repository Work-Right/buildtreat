import type { BskyConsoleItem } from './bsky-posts';
import type { ConsoleAttendee } from './featured';
import type { Photo } from './photos';
import type { Section } from './sections';

/**
 * Dev-only synthetic data for `/organizer/retreat?preview` (design
 * screenshots). Only reachable behind `dev` in the route's load. Photo ids
 * are fake, so thumbnails 404 and the console shows its neutral frame.
 * Generic copy only — never the venue.
 */
type Row = Section & { photos: Photo[] };

export function consolePreview(): {
	sections: Row[];
	updates: Row[];
	today: string;
	bskyPosts: BskyConsoleItem[];
	mediaConfigured: boolean;
} {
	const at = '2026-10-30T18:20:00.000Z';
	const by = 'did:plc:preview';
	const photo = (id: string, alt: string, position: number, width = 2400, height = 1600): Photo => ({
		id,
		sectionId: 2,
		alt,
		width,
		height,
		contentType: 'image/jpeg',
		position
	});
	return {
		mediaConfigured: true,
		sections: [
			{
				id: 1,
				title: 'What this is',
				body:
					'Four days for people building on atproto to work side by side, away from the feed.\n\n' +
					'## The shape of it\n\n- Mornings: hacking in small groups\n- Afternoons: walks, talks, naps\n- Evenings: dinner together\n\n' +
					'Questions? Read the [code of conduct](https://example.com/coc) or reply to your invite.',
				visibility: 'public',
				position: 1,
				updatedAt: at,
				updatedBy: by,
				kind: 'section',
				publishedAt: null,
				photos: []
			},
			{
				id: 2,
				title: 'Getting there',
				body:
					'Fly into the nearest regional airport on **Thursday, December 4**. We’ll run shuttles from 1 to 5 PM.\n\n' +
					'1. Send your flight in the registration form\n2. Watch for the shuttle email the week before\n3. Text the organizer line if you’re delayed',
				visibility: 'invited',
				position: 2,
				updatedAt: at,
				updatedBy: by,
				kind: 'section',
				publishedAt: null,
				photos: [photo('preview-photo-1', 'Long table set for dinner at dusk', 1), photo('preview-photo-2', '', 2, 1600, 2400)]
			},
			{
				id: 3,
				title: 'Packing list',
				body: '_Draft_ — layers for cold desert nights, a laptop, a reusable bottle.',
				visibility: 'hidden',
				position: 3,
				updatedAt: at,
				updatedBy: by,
				kind: 'section',
				publishedAt: null,
				photos: []
			}
		],
		today: '2026-11-01',
		updates: [
			{
				id: 11,
				title: 'Rides from the airport',
				body: 'Shuttle sign-ups are open. Add your flight to your registration by **November 20** and we’ll match you to a van.',
				visibility: 'invited',
				position: 4,
				updatedAt: at,
				updatedBy: by,
				kind: 'update',
				publishedAt: '2026-10-30',
				photos: []
			},
			{
				id: 12,
				title: 'Registration is open',
				body: 'Confirm your spot from the home page. It takes about two minutes.',
				visibility: 'public',
				position: 5,
				updatedAt: at,
				updatedBy: by,
				kind: 'update',
				publishedAt: '2026-10-12',
				photos: []
			}
		],
		// Synthetic and offline: no network in preview; `.example` authors only.
		bskyPosts: [
			{
				uri: 'at://did:plc:previewaaaaaaaaaaaaaaaaaa/app.bsky.feed.post/3preview1',
				url: 'https://bsky.app/profile/did:plc:previewaaaaaaaaaaaaaaaaaa/post/3preview1',
				author: '@builder.example',
				excerpt: 'Booked my flight for December. Bringing a half-finished feed generator and a lot of questions.'
			},
			{
				uri: 'at://did:plc:previewaaaaaaaaaaaaaaaaaa/app.bsky.feed.post/3preview2',
				url: null,
				author: null,
				excerpt: null
			}
		]
	};
}

/**
 * Dev-only synthetic people for `/organizer/retreat/attendees?preview`.
 * Invented names and `.example` handles — never real registrants.
 */
export function attendeesPreview(): ConsoleAttendee[] {
	const p = (n: number, name: string, shown: boolean, blurb = '', handle: string | null = `person${n}.example`) => ({
		did: `did:plc:preview${n}`,
		handle,
		name,
		shown,
		blurb
	});
	return [
		p(1, 'Avery Lindgren', true, 'A feed generator for neighborhood news'),
		p(2, 'Jordan Okoye', true, 'PDS hosting for small groups and clubs'),
		p(3, 'Sam Whitfield', true),
		p(4, 'Casey Morales', false, 'Lexicons for shared calendars, so a club, a meetup or a family can keep one schedule that every atproto app can read and write together'),
		p(5, 'Riley Tanaka-Brennan', false),
		p(6, 'Morgan Ellis', false, '', null)
	];
}
