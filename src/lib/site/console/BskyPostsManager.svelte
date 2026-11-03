<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/ui/Icon.svelte';
	import type { BskyConsoleItem } from '$lib/server/site/bsky-posts';

	/**
	 * Bluesky posts in the Posts stream: paste a bsky.app post link to add,
	 * remove from the list. The server resolves the link via the public
	 * appview only and refuses posts it can't load. A post that stops
	 * loading stays listed here (so it can be removed) but is hidden on the site.
	 */
	let {
		posts,
		message,
		note = null
	}: { posts: BskyConsoleItem[]; message: string | null; /** Scope line under the head. */ note?: string | null } =
		$props();

	let adding = $state(false);
</script>

<section class="list-wrap" aria-labelledby="bsky-head">
	<h2 class="kicker head" id="bsky-head">Bluesky posts</h2>
	{#if note}<p class="note">{note}</p>{/if}
	<form
		method="POST"
		action="?/bskyAdd"
		class="add"
		use:enhance={() => {
			adding = true;
			return async ({ update }) => {
				await update();
				adding = false;
			};
		}}
	>
		<label class="visually-hidden" for="bsky-url">Bluesky post link</label>
		<input
			id="bsky-url"
			class="input"
			name="url"
			type="url"
			inputmode="url"
			autocomplete="off"
			required
			placeholder="https://bsky.app/profile/…/post/…"
		/>
		<button class="ghost" disabled={adding}><Icon name="plus" size={14} /> {adding ? 'Adding…' : 'Add post'}</button>
	</form>
	<p class="status" role="status">{message ?? ''}</p>
	{#if posts.length}
		<ul class="list" role="list">
			{#each posts as p, i (p.uri)}
				<li>
					<div class="body">
						{#if p.excerpt !== null}
							<span class="who">{p.author}</span>
							<span class="excerpt">{p.excerpt || 'No text — images only'}</span>
							{#if p.url}
								<a class="quiet" href={p.url} target="_blank" rel="noopener noreferrer">Open on Bluesky <Icon name="arrow-right" size={13} /></a>
							{/if}
						{:else}
							<span class="excerpt">Not loading from Bluesky right now — hidden on the site.</span>
						{/if}
					</div>
					<form method="POST" action="?/bskyRemove" use:enhance>
						<input type="hidden" name="uri" value={p.uri} />
						<button class="nudge" aria-label={`Remove ${p.author ? `${p.author}’s post` : `post ${i + 1}`} from the stream`}>
							<Icon name="x" size={14} />
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No Bluesky posts yet. Paste a post link to show it in the Posts stream.</p>
	{/if}
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

	.note {
		font-size: var(--text-author);
		color: var(--ink-70);
	}

	/* URL field spans the column; Add sits at its end, or below when narrow. */
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2) var(--space-3);
	}

	.add .input {
		flex: 1 1 18rem;
		width: auto;
		min-width: 0;
	}

	.input {
		width: 100%;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--ink-45);
		border-radius: 0;
		padding: 0.45rem 0;
		font: inherit;
		font-size: var(--text-author);
		color: var(--ink);
		caret-color: var(--ink);
	}

	.input::placeholder {
		color: var(--ink-45);
	}

	.input:focus {
		outline: none;
		border-bottom-color: var(--ink);
	}

	.status {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--ink-70);
	}

	.status:empty {
		display: none;
	}

	.list {
		list-style: none;
		border-bottom: var(--hairline);
	}

	li {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-2);
		border-top: var(--hairline);
		padding: 0.55rem 0;
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.who {
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--ink-70);
		overflow-wrap: anywhere;
	}

	.excerpt {
		font-size: var(--text-author);
		line-height: 1.45;
		color: var(--ink);
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.quiet {
		width: max-content;
		font-size: 0.75rem;
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.quiet:hover {
		color: var(--ink);
	}

	.nudge {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 999px;
		color: var(--ink-70);
		transition: color 0.15s var(--ease-out);
	}

	.nudge:hover {
		color: var(--ink);
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
		border: 1.5px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.45rem 1rem;
		font-size: var(--text-author);
		font-weight: 600;
		transition: border-color 0.15s var(--ease-out);
	}

	.ghost:hover:not(:disabled) {
		border-color: var(--ink);
	}

	.ghost:disabled {
		color: var(--ink-45);
		cursor: progress;
	}
</style>
