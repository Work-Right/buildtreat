<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/ui/Icon.svelte';
	import type { Section } from '$lib/server/site/sections';

	type Row = Section & { photoCount: number };
	let {
		sections,
		updates,
		selected,
		hrefFor
	}: {
		sections: Row[];
		/** Updates, newest publish date first (ordered by date, so no move controls). */
		updates: Row[];
		selected: number | null;
		/** Link to a section — a real href so picking works without JS. */
		hrefFor: (id: number) => string;
	} = $props();

	const badge = { public: 'Public', invited: 'Invited', hidden: 'Hidden' } as const;
	const photoCount = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;
</script>

<section class="list-wrap" aria-labelledby="sections-head">
	<h2 class="kicker head" id="sections-head">Sections</h2>
	{#if sections.length}
		<ol class="list">
			{#each sections as s, i (s.id)}
				<li class:current={s.id === selected}>
					<a
						class="pick"
						href={hrefFor(s.id)}
						aria-current={s.id === selected ? 'true' : undefined}
						data-sveltekit-noscroll
						data-sveltekit-replacestate
					>
						<span class="title">{s.title}</span>
						<span class="meta" class:dim={s.visibility === 'hidden'}>
							{badge[s.visibility]} · {photoCount(s.photoCount)}
						</span>
					</a>
					<form method="POST" action="?/move" use:enhance class="moves">
						<input type="hidden" name="id" value={s.id} />
						<button class="nudge up" name="direction" value="up" disabled={i === 0} aria-label={`Move ${s.title} up`}>
							<Icon name="chevron-down" size={14} />
						</button>
						<button
							class="nudge"
							name="direction"
							value="down"
							disabled={i === sections.length - 1}
							aria-label={`Move ${s.title} down`}
						>
							<Icon name="chevron-down" size={14} />
						</button>
					</form>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="empty">No sections yet.</p>
	{/if}
	<form method="POST" action="?/create" use:enhance>
		<button class="ghost"><Icon name="plus" size={14} /> Add section</button>
	</form>
</section>

<section class="list-wrap" aria-labelledby="updates-head">
	<h2 class="kicker head" id="updates-head">Updates · newest first</h2>
	{#if updates.length}
		<ol class="list">
			{#each updates as u (u.id)}
				<li class:current={u.id === selected}>
					<a
						class="pick"
						href={hrefFor(u.id)}
						aria-current={u.id === selected ? 'true' : undefined}
						data-sveltekit-noscroll
						data-sveltekit-replacestate
					>
						<span class="title">{u.title}</span>
						<span class="meta" class:dim={u.visibility === 'hidden'}>
							<time datetime={u.publishedAt ?? undefined}>{u.publishedAt}</time> · {badge[u.visibility]}{u.photoCount
								? ` · ${photoCount(u.photoCount)}`
								: ''}
						</span>
					</a>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="empty">No updates yet. They show in the Posts stream on the home page, newest first.</p>
	{/if}
	<form method="POST" action="?/create" use:enhance>
		<input type="hidden" name="kind" value="update" />
		<button class="ghost"><Icon name="plus" size={14} /> Add update</button>
	</form>
</section>

<style>
	.list-wrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.head {
		color: var(--ink-45);
	}

	.list {
		list-style: none;
		border-bottom: var(--hairline);
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		border-top: var(--hairline);
		padding: 0.55rem 0;
	}

	.pick {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		color: var(--ink-70);
		text-decoration: none;
		transition: color 0.15s var(--ease-out);
	}

	.pick:hover,
	li.current .pick {
		color: var(--ink);
	}

	.title {
		font-size: 0.9375rem;
		font-weight: 550;
		overflow-wrap: anywhere;
	}

	li.current .title {
		text-decoration: underline;
		text-decoration-thickness: 1px;
		text-underline-offset: 4px;
	}

	.meta {
		font-variant-numeric: tabular-nums;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--ink-70);
	}

	.meta.dim {
		color: var(--ink-45);
	}

	.moves {
		display: flex;
		flex: 0 0 auto;
		gap: 0.25rem;
	}

	.nudge {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		color: var(--ink-70);
		transition: color 0.15s var(--ease-out);
	}

	.nudge.up :global(svg) {
		rotate: 180deg;
	}

	.nudge:hover:not(:disabled) {
		color: var(--ink);
	}

	.nudge:disabled {
		color: var(--ink-35);
		cursor: not-allowed;
	}

	.empty {
		font-size: var(--text-author);
		color: var(--ink-70);
		border-top: var(--hairline);
		border-bottom: var(--hairline);
		padding: 0.55rem 0;
	}

	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: var(--space-1);
		border: 1.5px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: var(--text-author);
		font-weight: 600;
		transition: border-color 0.15s var(--ease-out);
	}

	.ghost:hover {
		border-color: var(--ink);
	}
</style>
