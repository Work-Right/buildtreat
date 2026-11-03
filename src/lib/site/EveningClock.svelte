<script lang="ts">
	let { time, light, tag = null }: { time: string; light: string; tag?: string | null } = $props();
</script>

<!-- The evening clock: the ruled line that opens every region of the home. -->
<p class="clock">
	<span class="t">{time}</span>
	<span class="light">{light}</span>
	{#if tag}<span class="tag">{tag}</span>{/if}
</p>

<style>
	.clock {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem 0.9rem;
		padding: 0.65rem 0;
		border-top: var(--hairline);
		border-bottom: var(--hairline);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 500;
	}
	.t {
		font-variant-numeric: tabular-nums;
	}
	.light {
		color: var(--ink-70);
	}
	.tag {
		margin-left: auto;
		font-size: var(--text-kicker);
		letter-spacing: 0.12em;
		color: var(--ink-70);
	}
	@media (min-width: 900px) {
		.clock {
			font-size: var(--text-fact);
			letter-spacing: var(--track-fact);
		}
	}
</style>
