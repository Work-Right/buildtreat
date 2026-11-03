import { describe, expect, it } from 'vitest';
import { fitWithin } from './downscale';

describe('fitWithin', () => {
	it('keeps small images as they are', () => {
		expect(fitWithin(1200, 800, 2400)).toEqual({ width: 1200, height: 800 });
	});
	it('scales the longest edge down to max, keeping aspect', () => {
		expect(fitWithin(4032, 3024, 2400)).toEqual({ width: 2400, height: 1800 });
		expect(fitWithin(3024, 4032, 2400)).toEqual({ width: 1800, height: 2400 });
	});
	it('never rounds an edge to zero', () => {
		expect(fitWithin(10000, 1, 2400)).toEqual({ width: 2400, height: 1 });
	});
});
