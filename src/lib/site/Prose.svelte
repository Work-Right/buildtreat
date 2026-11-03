<script lang="ts">
	/**
	 * Organizer-written markdown, rendered server-side by markdown-it with
	 * `html: false` (lib/markdown/render.ts) — safe to inject. Lists are
	 * ledgers: ruled rows, no bullets. `**Label** — value` items are a
	 * label/value pair (`ledger-pair`), `Item — aside` items dim the aside.
	 */
	let { html, measure = '44ch' }: { html: string; measure?: string } = $props();
</script>

{#if html.trim()}
	<div class="prose" style:--measure={measure}>{@html html}</div>
{/if}

<style>
	.prose {
		font-size: 1.0625rem;
		line-height: 1.55;
		color: var(--ink);
		min-width: 0;
	}
	.prose > :global(p),
	.prose > :global(h2),
	.prose > :global(h3),
	.prose > :global(blockquote) {
		max-width: var(--measure);
	}
	/* The lead paragraph speaks; the ones after it are the quieter aside. */
	.prose > :global(p + p) {
		color: var(--ink-70);
	}
	.prose > :global(* + *) {
		margin-top: var(--space-3);
	}
	.prose :global(h2),
	.prose :global(h3) {
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: 0.01em;
		text-transform: uppercase;
		font-size: clamp(1.35rem, 4.2vw, 1.9rem);
		line-height: 1;
		color: var(--ink);
	}
	.prose > :global(h2),
	.prose > :global(h3) {
		margin-top: var(--space-4);
	}
	.prose :global(a) {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--ink-45);
	}
	.prose :global(a:hover) {
		text-decoration-color: var(--ink);
	}
	.prose :global(strong) {
		font-weight: 650;
	}

	/* ── lists are ledgers ── */
	.prose :global(ul),
	.prose :global(ol) {
		list-style: none;
		padding: 0;
		border-bottom: var(--hairline);
		counter-reset: ledger;
		max-width: 46rem;
	}
	.prose :global(li) {
		padding: 0.65rem 0;
		border-top: var(--hairline);
		font-size: 1rem;
		line-height: 1.4;
	}
	.prose :global(li > p) {
		margin: 0;
	}
	.prose :global(li ul),
	.prose :global(li ol) {
		margin-top: 0.65rem;
		border-bottom: 0;
	}
	/* Ordered lists keep their numbers, as quiet tabular figures. */
	.prose :global(ol > li) {
		counter-increment: ledger;
	}
	.prose :global(ol > li::before) {
		content: counter(ledger);
		display: inline-block;
		min-width: 1.6rem;
		color: var(--ink-45);
		font-variant-numeric: tabular-nums;
	}
	/* `**Label** — value`: caps label left, value right (a schedule). */
	.prose :global(li.ledger-pair) {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 500;
	}
	.prose :global(.ledger-pair .ledger-label) {
		flex: none;
	}
	.prose :global(.ledger-pair .ledger-value) {
		color: var(--ink-70);
		text-align: right;
		text-wrap: balance;
	}
	/* `Item — aside`: the aside is the quieter half (a packing list). */
	.prose :global(.ledger-aside .ledger-value) {
		color: var(--ink-70);
	}
	.prose :global(.ledger-aside .ledger-value::before) {
		content: ' — ';
	}
	@media (min-width: 900px) {
		.prose :global(li.ledger-pair) {
			font-size: var(--text-fact);
			letter-spacing: var(--track-fact);
		}
	}
</style>
