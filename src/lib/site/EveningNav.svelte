<script lang="ts" module>
	export interface NavEntry {
		id: string;
		label: string;
		time: string;
		light: string;
	}
</script>

<script lang="ts">
	import { siteHome } from '$lib/content';

	/**
	 * The time-of-day nav. `place` picks the variant: the slim sticky ledger
	 * in the right gutter (desktop, from the end of the hero down) or the
	 * sticky rail under the hero (narrower screens). Each variant shows only
	 * at its own widths, so both can be mounted.
	 */
	let { entries, place }: { entries: NavEntry[]; place: 'gutter' | 'top' } = $props();

	let active = $state(0);
	/** Gutter variant: the rail sits over a full-bleed photograph right now. */
	let overPhoto = $state(false);
	let rail = $state<HTMLElement | null>(null);

	$effect(() => {
		const targets = entries.map((e) => document.getElementById(e.id));
		const update = () => {
			const mid = innerHeight * 0.5;
			let idx = 0;
			targets.forEach((el, i) => {
				if (el && el.getBoundingClientRect().top < mid) idx = i;
			});
			active = idx;
			// Labels never sit on a photograph: step aside while a lead
			// photo (`[data-photo]`) passes under the rail.
			if (rail) {
				const r = rail.getBoundingClientRect();
				overPhoto = [...document.querySelectorAll('[data-photo]')].some((el) => {
					const p = el.getBoundingClientRect();
					return p.top < r.bottom && p.bottom > r.top;
				});
			}
		};
		update();
		addEventListener('scroll', update, { passive: true });
		addEventListener('resize', update);
		return () => {
			removeEventListener('scroll', update);
			removeEventListener('resize', update);
		};
	});
</script>

{#if place === 'gutter'}
	<div class="track">
		<nav class="rail" class:aside={overPhoto} aria-label={siteHome.nav.label} bind:this={rail}>
			<p class="sky">{entries[active]?.light}</p>
			<ol>
				{#each entries as e, i (e.id)}
					<li>
						<a href={`#${e.id}`} class:on={i === active} class:past={i < active} aria-current={i === active ? 'location' : undefined}>
							<span class="dot"></span><span>{e.label}</span><span class="t">{e.time}</span>
						</a>
					</li>
				{/each}
			</ol>
		</nav>
	</div>
{:else}
	<nav class="mrail" aria-label={siteHome.nav.label}>
		{#each entries as e, i (e.id)}
			<a href={`#${e.id}`} class:on={i === active} aria-current={i === active ? 'location' : undefined}>
				<span class="t">{e.time}</span><span>{e.label}</span>
			</a>
		{/each}
	</nav>
{/if}

<style>
	/* ── narrow: sticky under the hero ── */
	.mrail {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		padding: 0 var(--gutter);
		/* Ground (#0b0908) at near-full alpha so the light still reads through. */
		background: linear-gradient(to bottom, rgb(11 9 8 / 0.97), rgb(11 9 8 / 0.9));
		border-bottom: var(--hairline);
		backdrop-filter: blur(10px);
		isolation: isolate;
	}
	/* Flat ground carries the grain at the flat-surface blend. */
	.mrail::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.05;
		mix-blend-mode: screen;
	}
	.mrail a {
		flex: 1;
		position: relative;
		display: grid;
		gap: 0.15rem;
		padding: 0.6rem 0 0.55rem;
		font-size: var(--text-kicker);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 500;
		color: var(--ink-45);
		text-decoration: none;
		transition: color 0.3s var(--ease-out);
	}
	.mrail a.on {
		color: var(--ink);
	}
	.mrail a.on::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0.75rem;
		bottom: -1px;
		height: 1px;
		background: var(--ink);
	}
	.t {
		font-variant-numeric: tabular-nums;
	}

	/* ── wide: the slim ledger in the right gutter ── */
	.track {
		display: none;
	}

	@media (min-width: 1180px) {
		.mrail {
			display: none;
		}
		.track {
			display: block;
			position: absolute;
			top: var(--rail-top, 100vh);
			bottom: 0;
			padding-top: var(--space-5);
			right: var(--gutter);
			width: 11.5rem;
			z-index: 20;
			pointer-events: none;
		}
		.rail {
			position: sticky;
			top: calc(50vh - 7rem);
			pointer-events: auto;
			transition: opacity 0.35s var(--ease-out);
		}
		/* Over a photograph the rail steps aside (keyboard focus brings it back). */
		.rail.aside:not(:focus-within) {
			opacity: 0;
			pointer-events: none;
		}
		ol {
			list-style: none;
		}
		li {
			border-top: var(--hairline);
		}
		li:last-child {
			border-bottom: var(--hairline);
		}
		.rail a {
			display: grid;
			grid-template-columns: 0.75rem 1fr;
			gap: 0.15rem 0.5rem;
			padding: 0.65rem 0;
			color: var(--ink-45);
			text-decoration: none;
			font-size: 0.75rem;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			font-weight: 500;
			transition: color 0.3s var(--ease-out);
		}
		.rail a:hover {
			color: var(--ink);
		}
		.dot {
			grid-row: span 2;
			align-self: center;
			width: 5px;
			height: 5px;
			border-radius: 999px;
			background: currentColor;
			opacity: 0;
			transition: opacity 0.3s var(--ease-out);
		}
		.rail .t {
			grid-column: 2;
			font-size: var(--text-kicker);
			letter-spacing: 0.12em;
		}
		.rail a.on {
			color: var(--ink);
		}
		.rail a.on .dot {
			opacity: 1;
		}
		.rail a.past {
			color: var(--ink-70);
		}
		.sky {
			font-size: var(--text-kicker);
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: var(--ink-45);
			padding: 0 0 0.6rem 1.25rem;
		}
	}
</style>
