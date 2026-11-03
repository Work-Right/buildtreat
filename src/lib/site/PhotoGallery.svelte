<script lang="ts">
	import { page } from '$app/state';
	import type { SitePhotoView } from '$lib/server/site/page';
	import { photoSrc } from '$lib/site/photo-src';

	/**
	 * Photos as captioned figures — the alt text doubles as a kicker-style
	 * caption (hidden from assistive tech, which reads the alt). `src` is
	 * /media/site/{id}; that route re-checks visibility per request.
	 */
	let { photos, layout = 'pair' }: { photos: SitePhotoView[]; layout?: 'pair' | 'strip' | 'column' } = $props();
</script>

{#if photos.length}
	<div class="figures" class:pair={layout === 'pair' && photos.length > 1} class:strip={layout === 'strip'}>
		{#each photos as p (p.id)}
			<figure>
				<div class="frame">
					<img
						src={photoSrc(p.src, page.url)}
						alt={p.alt}
						width={p.width}
						height={p.height}
						loading="lazy"
						decoding="async"
					/>
				</div>
				<figcaption aria-hidden="true">{p.alt}</figcaption>
			</figure>
		{/each}
	</div>
{/if}

<style>
	.figures {
		display: grid;
		gap: var(--space-4) var(--space-3);
		align-content: start;
	}
	figure {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}
	.frame {
		position: relative;
		overflow: hidden;
	}
	/* Photographs carry the grain at the photographic blend. */
	.frame::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.07;
		mix-blend-mode: overlay;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 16 / 10;
		object-fit: cover;
	}
	figcaption {
		font-size: var(--text-kicker);
		font-weight: 500;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ink-70);
	}
	/* A strip of smaller figures under a lead photograph's copy. */
	.strip {
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		max-width: 52rem;
	}
	@media (min-width: 700px) {
		.strip {
			grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
		}
	}
	@media (min-width: 700px) {
		.pair {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
