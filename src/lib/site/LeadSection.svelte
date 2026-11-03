<script lang="ts">
	import { page } from '$app/state';
	import type { SitePhotoView, SiteSectionView } from '$lib/server/site/page';
	import { siteHome } from '$lib/content';
	import type { Clock } from '$lib/site/evening';
	import EveningClock from '$lib/site/EveningClock.svelte';
	import PhotoGallery from '$lib/site/PhotoGallery.svelte';
	import Prose from '$lib/site/Prose.svelte';
	import { photoSrc } from '$lib/site/photo-src';

	/**
	 * A section with photos is a region of its own: the first photo full
	 * bleed at the same hour as the hero, the copy settling onto its lower
	 * edge. Its other photos usually pair with the next section (see
	 * golden.ts); `strip` holds them only when nothing follows to pair with. The
	 * top fades in over whatever light came before (like blue hour), and the
	 * bottom meets the next region at the ground's 0.97.
	 */
	let {
		section,
		clock,
		id = undefined,
		strip = [],
		eager = false
	}: { section: SiteSectionView; clock: Clock; id?: string; strip?: SitePhotoView[]; eager?: boolean } = $props();

	const lead = $derived(section.photos[0]);
</script>

<section class="lead" {id} aria-labelledby={`s-${section.id}`}>
	<div class="layer" data-photo>
		<img
			src={photoSrc(lead.src, page.url)}
			alt={lead.alt}
			width={lead.width}
			height={lead.height}
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
		/>
	</div>
	<div class="scrim"></div>
	<div class="over">
		<div class="copy">
			<EveningClock
				time={clock.time}
				light={clock.light}
				tag={section.visibility === 'invited' ? siteHome.invitedOnlyLabel : null}
			/>
			<h2 class="title" id={`s-${section.id}`}>{section.title}</h2>
			<Prose html={section.html} measure="48ch" />
		</div>
		{#if strip.length}
			<PhotoGallery photos={strip} layout="strip" />
		{/if}
	</div>
</section>

<style>
	/* The photograph owns the top --photo-h of the band; the copy rises onto
	   its lower edge (where the scrim has reached the ground) and anything
	   longer, plus the figure strip, continues on the ground below it. */
	.lead {
		--photo-h: 92vh;
		--photo-h: 92svh;
		--overlap: 20rem;
		position: relative;
		isolation: isolate;
		padding: 0 var(--gutter) var(--space-5);
		scroll-margin-top: 4rem;
	}
	.lead::before {
		content: '';
		position: absolute;
		inset: var(--photo-h) 0 0 0;
		background: var(--ground);
		z-index: 0;
	}
	.layer,
	.scrim {
		position: absolute;
		inset: 0 0 auto 0;
		height: var(--photo-h);
		pointer-events: none;
		/* Fade in over the light above: no seam where the regions meet. */
		mask-image: linear-gradient(to bottom, transparent 0, var(--ground) 10rem);
	}
	.layer {
		z-index: 0;
		overflow: hidden;
	}
	.layer img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 45%;
	}
	.layer::after {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.07;
		mix-blend-mode: overlay;
	}
	/* Ground-colored stops (#0b0908 = --ground): clear through the middle,
	   then darkening under the copy to the solid ground at the photo's foot. */
	.scrim {
		z-index: 1;
		background: linear-gradient(
			to bottom,
			rgb(11 9 8 / 0.55) 0%,
			rgb(11 9 8 / 0) 28%,
			rgb(11 9 8 / 0.15) 48%,
			rgb(11 9 8 / 0.7) 66%,
			rgb(11 9 8 / 0.92) 84%,
			var(--ground) 100%
		);
	}
	.over {
		position: relative;
		z-index: 2;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-4);
		padding-top: calc(var(--photo-h) - var(--overlap));
	}
	.copy {
		display: grid;
		gap: var(--space-3);
		max-width: 44rem;
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
	@media (min-width: 1180px) {
		.over {
			padding-right: calc(11.5rem + var(--space-5));
		}
	}
	@media (max-width: 899px) {
		.lead {
			--photo-h: 72vh;
			--photo-h: 72svh;
			--overlap: 13rem;
		}
	}
</style>
