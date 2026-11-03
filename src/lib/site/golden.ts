import type { SitePhotoView, SiteSectionView } from '$lib/server/site/page';
import { eveningClock, type Clock } from '$lib/site/evening';

/** A run of same-visibility sections laid out two to a row. */
export interface SectionGroup {
	visibility: 'public' | 'invited';
	/** Nav anchor ('plan' | 'story') on the first group of its visibility. */
	anchor: string | null;
	sections: SiteSectionView[];
}

/** The section right after a lead photo, paired with that lead's other photos. */
export interface Feature {
	section: SiteSectionView;
	photos: SitePhotoView[];
	anchor: string | null;
}

export type GoldenBlock =
	/**
	 * A section with photos: its first photo full-bleed, the copy on its lower
	 * edge. `strip` holds its other photos only when no text section follows
	 * to pair them with (otherwise they move to the next region's feature).
	 */
	| { kind: 'lead'; section: SiteSectionView; anchor: string | null; strip: SitePhotoView[]; clock: Clock }
	/** Photo-less sections on the golden light, one clock line for the region. */
	| { kind: 'groups'; feature: Feature | null; groups: SectionGroup[]; clock: Clock };

const ANCHOR = { invited: 'plan', public: 'story' } as const;

/**
 * Lays out the golden hour from the page-ordered sections (invited plan
 * first, then the public story). A section with photos becomes a lead
 * block; consecutive photo-less sections share one golden region, split
 * into groups where visibility changes. A lead's other photos pair with the
 * next text section as that region's feature row (the comp's aerial beside
 * the schedule); with no text section after it, they stay as a strip under
 * the lead. Each block is a region and gets one evening-clock line, spread
 * across the golden stretch in order.
 */
export function goldenBlocks(sections: SiteSectionView[]): GoldenBlock[] {
	type Draft =
		| { kind: 'lead'; section: SiteSectionView; anchor: string | null; strip: SitePhotoView[] }
		| { kind: 'groups'; feature: Feature | null; groups: SectionGroup[] };
	const drafts: Draft[] = [];
	const anchored = new Set<string>();
	const anchorFor = (v: 'public' | 'invited') => {
		const a = ANCHOR[v];
		if (anchored.has(a)) return null;
		anchored.add(a);
		return a;
	};

	for (const section of sections) {
		if (section.photos.length) {
			drafts.push({ kind: 'lead', section, anchor: anchorFor(section.visibility), strip: section.photos.slice(1) });
			continue;
		}
		const last = drafts.at(-1);
		if (last?.kind === 'lead' && last.strip.length) {
			// The lead's other photos move beside this section.
			drafts.push({
				kind: 'groups',
				feature: { section, photos: last.strip, anchor: anchorFor(section.visibility) },
				groups: []
			});
			last.strip = [];
			continue;
		}
		const block = last?.kind === 'groups' ? last : null;
		const target = block ?? { kind: 'groups' as const, feature: null, groups: [] };
		if (!block) drafts.push(target);
		const group = target.groups.at(-1);
		if (group && group.visibility === section.visibility) group.sections.push(section);
		else target.groups.push({ visibility: section.visibility, anchor: anchorFor(section.visibility), sections: [section] });
	}

	return drafts.map((d, i) => ({ ...d, clock: eveningClock(i, drafts.length) }));
}

/** The nav anchors in page order, with the clock of the region each opens in. */
export function goldenAnchors(blocks: GoldenBlock[]): Array<{ anchor: string; clock: Clock }> {
	const out: Array<{ anchor: string; clock: Clock }> = [];
	for (const b of blocks) {
		if (b.kind === 'lead') {
			if (b.anchor) out.push({ anchor: b.anchor, clock: b.clock });
		} else {
			if (b.feature?.anchor) out.push({ anchor: b.feature.anchor, clock: b.clock });
			for (const g of b.groups) if (g.anchor) out.push({ anchor: g.anchor, clock: b.clock });
		}
	}
	return out;
}
