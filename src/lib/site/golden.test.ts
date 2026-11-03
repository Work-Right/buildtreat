import { describe, expect, it } from 'vitest';
import type { SiteSectionView } from '$lib/server/site/page';
import { goldenAnchors, goldenBlocks } from './golden';

let n = 0;
const sec = (visibility: 'public' | 'invited', photos = 0): SiteSectionView =>
	({
		id: ++n,
		title: `S${n}`,
		html: '',
		visibility,
		photos: Array.from({ length: photos }, (_, i) => ({ id: `p${n}-${i}`, alt: 'a', width: 1, height: 1, src: '/x' }))
	}) as SiteSectionView;

describe('goldenBlocks', () => {
	it('public story with no photos is one golden region with one clock', () => {
		const blocks = goldenBlocks([sec('public'), sec('public')]);
		expect(blocks).toHaveLength(1);
		expect(blocks[0]).toMatchObject({ kind: 'groups', clock: { time: '4:10 PM', light: 'Golden hour' } });
		if (blocks[0].kind === 'groups') {
			expect(blocks[0].groups).toHaveLength(1);
			expect(blocks[0].groups[0].anchor).toBe('story');
		}
	});

	it('invited view: the lead photo region, then its other photos beside the next section, then pairs', () => {
		const blocks = goldenBlocks([sec('invited', 2), sec('invited'), sec('invited'), sec('invited'), sec('public'), sec('public')]);
		expect(blocks.map((b) => b.kind)).toEqual(['lead', 'groups']);
		expect(blocks[0]).toMatchObject({ kind: 'lead', anchor: 'plan', strip: [], clock: { time: '4:10 PM' } });
		const g = blocks[1];
		expect(g).toMatchObject({ kind: 'groups', clock: { time: '4:31 PM', light: 'Sun on the ridge' } });
		if (g.kind === 'groups') {
			expect(g.feature?.photos).toHaveLength(1);
			expect(g.feature?.anchor).toBeNull();
			expect(g.groups.map((x) => [x.visibility, x.anchor, x.sections.length])).toEqual([
				['invited', null, 2],
				['public', 'story', 2]
			]);
		}
		expect(goldenAnchors(blocks).map((a) => [a.anchor, a.clock.time])).toEqual([
			['plan', '4:10 PM'],
			['story', '4:31 PM']
		]);
	});

	it('a lead with one photo, or with nothing after it, keeps its own photos', () => {
		const one = goldenBlocks([sec('invited', 1), sec('invited')]);
		expect(one[1]).toMatchObject({ kind: 'groups', feature: null });
		const last = goldenBlocks([sec('public'), sec('public', 3)]);
		expect(last[1]).toMatchObject({ kind: 'lead' });
		if (last[1].kind === 'lead') expect(last[1].strip).toHaveLength(2);
	});

	it('a photo section in the middle splits the golden regions around it', () => {
		const blocks = goldenBlocks([sec('public'), sec('public', 1), sec('public')]);
		expect(blocks.map((b) => b.kind)).toEqual(['groups', 'lead', 'groups']);
		expect(new Set(blocks.map((b) => b.clock.time)).size).toBe(3);
		expect(goldenAnchors(blocks).map((a) => a.anchor)).toEqual(['story']);
	});

	it('no sections, no blocks', () => {
		expect(goldenBlocks([])).toEqual([]);
	});
});
