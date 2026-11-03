<script lang="ts">
	import type { SiteSectionView } from '$lib/server/site/page';
	import Prose from '$lib/site/Prose.svelte';

	/**
	 * A photo-less section on the golden light: title and organizer-written
	 * markdown. The region it sits in carries the evening clock; sections
	 * with photos render as `LeadSection` instead.
	 */
	/** `span`: the section has the whole row to itself — title left, body right. */
	let { section, span = false }: { section: SiteSectionView; span?: boolean } = $props();
</script>

<article class="site-section" class:span aria-labelledby={`s-${section.id}`}>
	<h2 class="title" id={`s-${section.id}`}>{section.title}</h2>
	<Prose html={section.html} />
</article>

<style>
	.site-section {
		display: grid;
		gap: var(--space-3);
		align-content: start;
		min-width: 0;
	}
	.title {
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 0.92;
		text-transform: uppercase;
		letter-spacing: 0.005em;
		font-size: clamp(2.2rem, 7.5vw, 3.6rem);
		text-wrap: balance;
	}
	/* A full row reads as a row: the title holds the left column of the pair
	   grid, the body the right, so nothing sits alone in half the width. */
	@media (min-width: 900px) {
		.span {
			grid-template-columns: 1fr 1fr;
			column-gap: calc(var(--space-5) * 1.5);
		}
	}
</style>
