/**
 * Single source of product truth for the survey surface.
 * Facts come from PRODUCT.md — do not invent or alter claims here.
 */

export const retreat = {
	name: 'Atmospheric Builders’ Retreat',
	nameLines: ['ATMOSPHERIC', 'BUILDERS’ RETREAT.'] as [string, string],
	kicker: 'For the (very cool) builders of the Atmosphere',
	acknowledgment: ['The date is set.', 'December 4–7 — register to lock your spot.'] as [string, string],
	facts: [
		{ label: 'What', value: '3 nights · 2 full days' },
		{ label: 'Where', value: 'Near Palm Springs, California' },
		{ label: 'When', value: 'December 4–7, 2026' },
		{ label: 'Your Costs', value: 'Travel only. Lodging & food all taken care of' }
	],
	signIn: 'Sign in with Atmosphere',
	// Attribution reads: "Organized by Bryan Guffey (@chaosgreml.in) in partnership with Bluesky PBC"
	// — the handle is a link, so the sentence is split around it.
	organizerLead: 'Organized by Bryan Guffey',
	organizerHandle: 'chaosgreml.in',
	organizerTail: 'in partnership with Bluesky PBC',
	/**
	 * aturi.to universal link: opens the organizer's profile in whatever
	 * Atmosphere client the visitor uses (there's no cross-client DM deep
	 * link, so the profile — with its Message button — is the closest stop).
	 * DID, not handle, so the link survives handle changes.
	 */
	organizerLink: 'https://aturi.to/profile/did:plc:h3wpawnrlptr4534chevddo6',
	/** Window the availability calendar covers (inclusive). */
	window: { start: '2026-09-01', end: '2026-11-15' }
} as const;

export type InterestValue = 'yes' | 'no' | 'maybe';
export type TravelValue = 'yes' | 'partial' | 'no';
export type DayPortion = 'full' | 'first_half' | 'second_half';

export interface AvailabilityRange {
	start: string; // ISO date, inclusive
	end: string; // ISO date, inclusive
	startPortion: DayPortion;
	endPortion: DayPortion;
}

export const interestQuestion = {
	title: 'Are you in?',
	prompt:
		'Are you interested in attending a 3-night, two-full-day atproto builders’ retreat in Southern California, sometime between September 1 – November 15?',
	options: [
		{ value: 'yes', label: 'Yes' },
		{ value: 'maybe', label: 'Maybe' },
		{ value: 'no', label: 'No' }
	] as { value: InterestValue; label: string }[]
} as const;

export const travelQuestion = {
	title: 'Getting here',
	prompt: 'We will be covering the cost of lodging and food. Are you able to afford your travel to the location?',
	options: [
		{ value: 'yes', label: 'Yes, I can cover my travel' },
		{ value: 'partial', label: 'I could afford some, but would need some financial assistance' },
		{ value: 'no', label: 'I can not afford the travel' }
	] as { value: TravelValue; label: string }[]
} as const;

export interface RetreatLocation {
	id: string;
	name: string;
	note?: string;
	/** Path under /media, real photography only (evidence rule). */
	image: string;
}

export const locations: RetreatLocation[] = [
	{ id: 'palm-springs', name: 'Palm Springs', image: '/media/loc-palm-springs.jpg' },
	{ id: 'coachella-valley', name: 'Coachella Valley', image: '/media/loc-coachella-valley.jpg' },
	{ id: 'joshua-tree', name: 'Joshua Tree', image: '/media/loc-joshua-tree.jpg' },
	{ id: 'san-diego', name: 'San Diego', image: '/media/loc-san-diego.jpg' },
	{ id: 'la-metro', name: 'Los Angeles metro', note: 'if possible', image: '/media/loc-la-metro.jpg' }
];

export const datesQuestion = {
	title: 'When are you free?',
	prompt: 'Select the dates you’re available. Tap your first and last day and we’ll fill in the rest — add as many ranges as you like.',
	halfDayHint: 'On the first and last day of a range, you can mark yourself available for only the first or second half of the day.'
} as const;

export const locationQuestion = {
	title: 'Where should it be?',
	prompt: 'Do you have a preference in location? Rank your top three.',
	maxRank: 3,
	noPreference: 'I don’t have a preference — they all sound great'
} as const;

/**
 * Sentinel ranking entry meaning "no location preference". Lives in the same
 * ranking array (and JSON column) as real location ids, always alone.
 */
export const NO_PREFERENCE = 'no-preference';

export const youQuestion = {
	title: 'Who’s coming',
	prompt: 'Tell us who you are — we’ll only use this to plan the retreat.'
} as const;

/**
 * Waitlist copy for uninvited visitors. Warm, two-track, never a wall —
 * the door isn't closed, it's a different door. See the design spec at
 * docs/superpowers/specs/2026-08-11-waitlist-design.md.
 */
export const waitlist = {
	/** Shown under the sign-in CTA before anyone authenticates, so neither
	 *  audience is surprised by where sign-in lands them. */
	twoTrack:
		'Invited builders sign in to answer. Not on the list yet? Sign in to join the waitlist — we’re pulling names as the dates come together.',
	invite: {
		body: 'The first invites went to a small group of builders — but the door isn’t closed. Drop your email and we’ll reach out as the dates firm up and space opens.',
		emailLabel: 'Email',
		cta: 'Join the waitlist',
		mistake: 'Think you should be on the list?'
	},
	member: {
		lead: 'You’re on the waitlist.',
		body: 'We’ll be in touch as the dates lock in and spots open.',
		change: 'Need to change your email or step off?'
	}
} as const;

/** The seven feed items, in order. */
export const feedItems = ['hero', 'you', 'interest', 'travel', 'dates', 'location', 'review'] as const;
export type FeedItemId = (typeof feedItems)[number];

export const itemTitles: Record<FeedItemId, string> = {
	hero: 'Welcome',
	you: 'You',
	interest: 'Interest',
	travel: 'Travel',
	dates: 'Dates',
	location: 'Location',
	review: 'Review'
};
/* ── Registration era (date locked 2026-08-25) ──────────────────────────
 * Spec: docs/superpowers/specs/2026-08-25-registration-design.md
 */

export const retreatDates = {
	start: '2026-12-04',
	end: '2026-12-07',
	display: 'December 4–7, 2026',
	short: 'Dec 4–7',
	nights: 3,
	arrive: 'Friday',
	depart: 'Monday morning'
} as const;

export const retreatLocation = {
	display: 'Near Palm Springs',
	pending: 'Exact address goes to registered attendees',
	explainer: 'The house is booked, a short drive from Palm Springs. Registered attendees get the address and itinerary by email.'
} as const;

/** Copy for the retreat home `/`. Facts come from PRODUCT.md / the spec. */
export const siteHome = {
	fallbackDescription: 'Three nights and two full days with the builders of the Atmosphere — December 4–7, 2026, near Palm Springs.',
	moreSoon: 'More details soon.',
	registerCta: 'Register',
	registeredLine: 'You’re registered',
	editDetails: 'Edit details',
	declinedLine: 'You said you can’t make it',
	changeAnswer: 'Change that',
	closedLine: 'Registration has closed — message Bryan if you still want to come.',
	invitedOnlyLabel: 'For invited builders',
	editInfo: 'Edit retreat info',
	viewAsPublic: 'View as public',
	viewAsInvited: 'View as invited',
	/** The blue-hour region title (display caps; the comp's closing period). */
	whosComing: 'Who’s coming.',
	/** The night region (the posts stream): title, entry labels, the way out. */
	posts: {
		title: 'Posts.',
		update: 'Update',
		bluesky: 'Bluesky',
		viewOnBluesky: 'View on Bluesky'
	},
	backHome: '← Retreat home',
	registerBy: 'Register by',
	registrationOpen: 'Registration is open for you',
	notInvited: 'this retreat is invite-only.',
	/**
	 * The evening clock (design chrome from the approved comp A, "Dusk to
	 * night"): each region opens on a time and a light. Golden-hour
	 * sections share the stretch from the first golden stop to `goldenEnd`
	 * (see `lib/site/evening.ts`); each takes the light of the latest stop
	 * its time has reached.
	 */
	evening: {
		golden: [
			{ time: '4:10 PM', light: 'Golden hour' },
			{ time: '4:31 PM', light: 'Sun on the ridge' },
			{ time: '4:38 PM', light: 'Sunset' }
		],
		goldenEnd: '4:45 PM',
		blue: { time: '4:52 PM', light: 'Blue hour' },
		night: { time: '5:40 PM', light: 'Night' }
	},
	/** The time-of-day nav. */
	nav: {
		label: 'Sections',
		plan: 'The plan',
		story: 'Story',
		who: 'Who’s coming',
		posts: 'Posts'
	}
} as const;

export const dietaryOptions = [
	{ id: 'vegetarian', label: 'Vegetarian' },
	{ id: 'vegan', label: 'Vegan' },
	{ id: 'gluten_free', label: 'Gluten-free' },
	{ id: 'dairy_free', label: 'Dairy-free' },
	{ id: 'kosher', label: 'Kosher' },
	{ id: 'halal', label: 'Halal' },
	{ id: 'nut_allergy', label: 'Nut allergy' },
	{ id: 'shellfish_allergy', label: 'Shellfish allergy' }
] as const;
export type DietaryId = (typeof dietaryOptions)[number]['id'];

export const travelModes = [
	{ id: 'flying', label: 'Flying' },
	{ id: 'driving', label: 'Driving' },
	{ id: 'train', label: 'Train' },
	{ id: 'other', label: 'Other' }
] as const;
export type TravelMode = (typeof travelModes)[number]['id'];

/**
 * Registration-time travel-support level. Mirrors the survey's travel
 * question so a "partial"/"no" answer arrives pre-selected, but is asked
 * again because circumstances move between August and December.
 */
export const supportNeeds = [
	{ id: 'none', label: 'I can cover it' },
	{ id: 'partial', label: 'I can cover some' },
	{ id: 'full', label: 'I can’t cover it' }
] as const;
export type SupportNeed = (typeof supportNeeds)[number]['id'];

/**
 * Agreement texts. Bump `version` when the substance changes so each
 * registration records which text it agreed to.
 */
export const waiver = {
	version: 'v2',
	title: 'Waivers'
	// v1 carried a draft liability waiver inline. v2 is a commitment to sign
	// the real waivers when they're sent, so there's no body to read here.
} as const;

export const codeOfConduct = {
	version: 'v1',
	title: 'Code of conduct',
	body: `The retreat is a small group of builders living and working together for three nights. It only works if everyone feels safe and welcome.

Be kind and generous. Assume good faith. Make room for people quieter than you.

Harassment of any kind isn't tolerated — including unwelcome comments about someone's identity, unwanted physical contact or attention, deliberate intimidation, and photographing or recording people without consent. If someone asks you to stop, stop.

Respect boundaries in shared space: quiet hours, closed doors, other people's food and belongings, and anyone's choice not to drink.

If something happens — to you or to someone else — tell Bryan (@chaosgreml.in) in person, by DM, or by text at the number on the itinerary. Reports are handled discreetly. Anyone asked to leave for violating this code covers their own way home.`
} as const;

export const registration = {
	kicker: 'The date is set',
	ack: ['You helped pick the days.', 'Here they are.'] as [string, string],
	dateLines: ['December', '4–7, 2026.'] as [string, string],
	facts: [
		{ label: 'Near Palm Springs, California', value: '' },
		{ label: 'The house is booked — details on the retreat page', value: '', muted: true },
		{ label: 'Lodging & food covered', value: 'Bluesky' }
	] as { label: string; value: string; muted?: boolean }[],
	registerBy: 'Register by',
	/** Anonymous hero while registration is open: the survey is long closed,
	 *  so the landing state has to point at sign-in → register, not at
	 *  "responses closed". */
	anonOpen: 'Registration is open — sign in to lock your spot.',
	anonTwoTrack:
		'Invited builders sign in to register. Not on the list yet? Sign in to join the waitlist — we’re pulling names as space opens.',
	confirm: 'I’m in',
	decline: 'I can’t make it',
	declinedLead: 'Noted — we’ll miss you.',
	declinedBody: 'If your December opens up, come back here and change your answer.',
	declinedUndo: 'Actually, I can come',
	closedLeadPrefix: 'Registration closed',
	closedBody: 'We’ve locked the headcount to book the house. If you can still make it, DM',
	formKicker: 'Registration',
	formTitle: 'You’re in.',
	formSub: 'December 4–7, near Palm Springs. A few short sections. Travel can wait until you know.',
	sections: {
		contact: { head: 'Contact', name: 'Name', email: 'Email', phone: 'Phone', phoneHint: 'For day-of texts' },
		food: { head: 'Food', hint: 'Pick any', other: 'Anything else about food', otherHint: 'Allergies, strong dislikes, coffee opinions' },
		emergency: { head: 'Emergency contact', name: 'Name', nameHint: 'Who we call', phone: 'Phone', phoneHint: '+1' },
		accessibility: { head: 'Accessibility', hint: 'Optional', label: 'Anything we should plan for', placeholder: 'Mobility, sensory, sleep, medical — whatever helps us set the house up right' },
		notes: { head: 'Anything else', hint: 'Optional', placeholder: 'Notes for the organizers' },
		travel: { head: 'Travel', hint: 'Optional now · update anytime', arriving: 'Arriving', arrivingHint: 'Fri afternoon, PSP', leaving: 'Leaving', leavingHint: 'Mon morning', details: 'Details', detailsHint: 'Flight numbers, rideshare offers' },
		/** Shown to everyone whose survey travel answer wasn't "yes". */
		support: {
			head: 'Travel support',
			hint: 'Sizing a fund with Bluesky',
			lead: 'Lodging and food are covered. If getting here is the hard part, say so — we’re taking real numbers to Bluesky to size a travel fund.',
			need: 'Getting to Palm Springs',
			amount: 'Roughly how much would help?',
			amountHint: 'US dollars — a best guess is fine',
			contingent: 'Does coming depend on it?',
			contingentYes: 'Yes — I can’t come without it',
			contingentNo: 'No — I’ll come either way',
			/** Summary labels. */
			costs: 'Costs',
			asked: 'Asking for',
			contingentRow: 'Contingent',
			contingentTrue: 'Yes — can’t attend without it',
			contingentFalse: 'No — coming either way',
			/** Registered-state nudge when the question was never answered. */
			nudge: 'One more thing: tell us where travel costs land for you.'
		},
		agreements: {
			head: 'Agreements',
			waiver: 'I agree to complete the waivers provided to me in a timely manner to attend the Builders’ Retreat',
			coc: 'I’ll follow the code of conduct',
			read: 'read it'
		}
	},
	submit: 'Register',
	submitHint: 'You can change everything later.',
	saving: 'Saving…',
	registeredTitle: 'You’re registered.',
	registeredSub: 'December 4–7, near Palm Springs. The address and itinerary come by email.',
	travelNudge: 'Update as plans firm up',
	edit: 'Edit',
	declineAfter: 'I can’t make it after all',
	surveyLink: 'Your availability survey answers',
	errors: {
		name: 'Tell us your name',
		email: 'Enter a valid email',
		emergencyName: 'Who should we call?',
		emergencyPhone: 'A phone number for them',
		agreeWaiver: 'Please agree to complete the waivers',
		agreeCoc: 'Please agree to the code of conduct',
		dietary: 'Unknown food option',
		travelMode: 'Unknown travel mode',
		supportNeed: 'Let us know where travel costs land for you',
		supportAmount: 'A rough dollar figure — whole dollars, please',
		supportContingent: 'Tell us whether you can come without it'
	}
} as const;

