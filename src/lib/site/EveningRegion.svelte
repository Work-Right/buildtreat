<script lang="ts">
	import type { Snippet } from 'svelte';
	import EveningClock from '$lib/site/EveningClock.svelte';

	/**
	 * One stretch of the evening. Regions stack in DOM order (each isolates
	 * its own stacking context), so a later region paints over the tail of
	 * the one before it: golden's blurred light runs on 16rem under the next
	 * region, which fades in over it — the light changes with no seam.
	 */
	let {
		light,
		id = undefined,
		clock = null,
		title = null,
		deepen = false,
		children
	}: {
		light: 'golden' | 'blue' | 'night';
		id?: string;
		clock?: { time: string; light: string } | null;
		title?: string | null;
		/** Golden running straight into night: let the light go out on the way. */
		deepen?: boolean;
		children?: Snippet;
	} = $props();
</script>

<section class="region {light}" class:deepen {id} aria-labelledby={title && id ? `${id}-title` : undefined}>
	{#if light !== 'night'}
		<div class="layer" aria-hidden="true">
			<img src={light === 'golden' ? '/media/hero-landscape.png' : '/media/item-dates.png'} alt="" loading="lazy" decoding="async" />
		</div>
		<div class="scrim"></div>
	{/if}
	<div class="over">
		{#if clock}
			<div class="head" class:bare={!title}>
				<EveningClock time={clock.time} light={clock.light} />
				{#if title}<h2 class="title" id={id ? `${id}-title` : undefined}>{title}</h2>{/if}
			</div>
		{/if}
		{@render children?.()}
	</div>
</section>

<style>
	.region {
		position: relative;
		isolation: isolate;
		padding: var(--space-5) var(--gutter);
	}
	.layer,
	.scrim {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.layer {
		z-index: 0;
		overflow: hidden;
	}
	.layer img {
		width: 100%;
		height: 100%;
		object-fit: cover;
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
	.scrim {
		z-index: 1;
	}
	.over {
		position: relative;
		z-index: 2;
	}

	/* ── golden: the hero's light, blurred and inverted, still warm ── */
	.golden {
		padding-bottom: calc(var(--space-5) * 2.4);
	}
	.golden .layer img {
		transform: scaleY(-1) scale(1.25);
		filter: blur(42px) saturate(1.1);
	}
	/* Ground-colored stops (#0b0908 = --ground); 0.97 meets the hero's last stop. */
	.golden .scrim {
		background: linear-gradient(
			to bottom,
			rgb(11 9 8 / 0.97) 0%,
			rgb(11 9 8 / 0.86) 22%,
			rgb(11 9 8 / 0.74) 70%,
			rgb(11 9 8 / 0.62) 100%
		);
	}
	.golden.deepen .scrim {
		background: linear-gradient(
			to bottom,
			rgb(11 9 8 / 0.97) 0%,
			rgb(11 9 8 / 0.86) 22%,
			rgb(11 9 8 / 0.76) 60%,
			rgb(11 9 8 / 0.9) 100%
		);
	}
	/* The light runs on under the next region; only the photograph fades,
	   so the scrim keeps deepening it instead of leaving a bright band. */
	.golden .layer,
	.golden .scrim {
		bottom: -16rem;
	}
	.golden .layer {
		mask-image: linear-gradient(to top, transparent 0, var(--ground) 16rem);
	}

	/* ── blue: the lights coming on ── */
	.blue {
		padding-top: calc(var(--space-5) * 1.6);
		padding-bottom: calc(var(--space-5) * 2.6);
	}
	.blue .layer img {
		transform: scaleY(-1);
		object-position: 50% 100%;
	}
	.blue .scrim {
		background: linear-gradient(
			to bottom,
			rgb(11 9 8 / 0.62) 0%,
			rgb(11 9 8 / 0.5) 12%,
			rgb(11 9 8 / 0.62) 40%,
			rgb(11 9 8 / 0.84) 72%,
			var(--ground) 100%
		);
	}
	.blue .layer,
	.blue .scrim {
		mask-image: linear-gradient(to bottom, transparent 0, var(--ground) 16rem);
	}

	/* ── night: the solid ground, fading in over whatever light came before ── */
	.night {
		min-height: 16rem;
		display: flex;
		flex-direction: column;
		padding-top: calc(var(--space-5) * 1.4);
		background: linear-gradient(to bottom, transparent 0, var(--ground) 16rem);
	}
	.night::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.05;
		mix-blend-mode: screen;
		mask-image: linear-gradient(to bottom, transparent 0, var(--ground) 12rem);
	}
	.night .over {
		flex: 1;
		display: flex;
		flex-direction: column;
	}

	.head {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	/* A clock with no title opens the region; the sections below carry titles. */
	.head.bare {
		margin-bottom: var(--space-5);
	}
	.title {
		font-family: var(--font-display);
		font-weight: 700;
		line-height: 0.92;
		text-transform: uppercase;
		letter-spacing: 0.005em;
		font-size: clamp(2.2rem, 7.5vw, 3.6rem);
	}

	@media (min-width: 1180px) {
		/* The content column keeps the nav's gutter clear at every width. */
		.over {
			padding-right: calc(11.5rem + var(--space-5));
		}
	}
</style>
