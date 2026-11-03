import { describe, expect, it } from 'vitest';
import { eveningClock, fromMinutes, toMinutes } from './evening';

describe('evening clock', () => {
	it('round-trips times', () => {
		expect(toMinutes('4:10 PM')).toBe(16 * 60 + 10);
		expect(fromMinutes(16 * 60 + 5)).toBe('4:05 PM');
		expect(fromMinutes(12 * 60)).toBe('12:00 PM');
	});

	it('matches the comp for two sections', () => {
		expect(eveningClock(0, 2)).toEqual({ time: '4:10 PM', light: 'Golden hour' });
		expect(eveningClock(1, 2)).toEqual({ time: '4:31 PM', light: 'Sun on the ridge' });
	});

	it('moves forward through the evening for many sections, ending before blue hour', () => {
		const clocks = Array.from({ length: 5 }, (_, i) => eveningClock(i, 5));
		const mins = clocks.map((c) => toMinutes(c.time));
		expect(mins).toEqual([...mins].sort((a, b) => a - b));
		expect(new Set(mins).size).toBe(5);
		expect(clocks[4]).toEqual({ time: '4:45 PM', light: 'Sunset' });
	});

	it('handles a single section and out-of-range indexes', () => {
		expect(eveningClock(0, 1).time).toBe('4:10 PM');
		expect(eveningClock(9, 2).time).toBe('4:31 PM');
	});
});
