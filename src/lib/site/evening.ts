import { siteHome } from '$lib/content';

export interface Clock {
	time: string;
	light: string;
}

/** "4:31 PM" → minutes since midnight. */
export function toMinutes(time: string): number {
	const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
	if (!m) throw new Error(`bad clock time: ${time}`);
	const h = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
	return h * 60 + Number(m[2]);
}

/** Minutes since midnight → "4:31 PM". */
export function fromMinutes(total: number): string {
	const h24 = Math.floor(total / 60) % 24;
	const h = h24 % 12 === 0 ? 12 : h24 % 12;
	return `${h}:${String(total % 60).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * The clock for golden-hour section `index` of `count`. Sections share the
 * stretch from the first golden stop to `goldenEnd`, never more than the
 * gap between the first two stops apart (so two sections read exactly as
 * the comp: 4:10 PM Golden hour, 4:31 PM Sun on the ridge). Each takes the
 * light of the latest stop its time has reached.
 */
export function eveningClock(
	index: number,
	count: number,
	stops: readonly Clock[] = siteHome.evening.golden,
	end: string = siteHome.evening.goldenEnd
): Clock {
	const start = toMinutes(stops[0].time);
	const maxStep = stops.length > 1 ? toMinutes(stops[1].time) - start : 0;
	const span = toMinutes(end) - start;
	const step = count > 1 ? Math.min(maxStep, span / (count - 1)) : 0;
	const at = Math.round(start + step * Math.max(0, Math.min(index, count - 1)));
	let light = stops[0].light;
	for (const s of stops) if (toMinutes(s.time) <= at) light = s.light;
	return { time: fromMinutes(at), light };
}
