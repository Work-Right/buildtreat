<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/ui/Icon.svelte';
	import type { ConsoleAttendeeView } from '$lib/server/site/featured';

	/**
	 * One confirmed registrant in the who's-coming ledger. The registration
	 * name shows here only (organizer surface); the public card uses the
	 * Bluesky profile. `order` is set for rows on the site (move controls).
	 */
	let {
		person,
		blurbMax,
		order = null
	}: {
		person: ConsoleAttendeeView;
		blurbMax: number;
		order?: { first: boolean; last: boolean } | null;
	} = $props();

	// Local buffer; the page keys this row on did + saved blurb, so a save
	// that changes the stored text remounts it from the fresh value.
	const start = () => person.blurb;
	const saved = start();
	let draft = $state(saved);
	let saving = $state(false);
	const dirty = $derived(draft.trim() !== saved);
	// Counted in code points, the same way the server's validateBlurb counts
	// (an HTML maxlength counts UTF-16 units and would disagree on emoji).
	const left = $derived(blurbMax - [...draft.replace(/\s+/g, ' ').trim()].length);
	const over = $derived(left < 0);
	const id = $derived(`blurb-${person.did.replace(/[^a-z0-9]/gi, '')}`);

	// Grow with the text (and with the width, as the row reflows).
	let field = $state<HTMLTextAreaElement | null>(null);
	const fit = () => {
		if (!field) return;
		field.style.height = 'auto';
		field.style.height = `${field.scrollHeight + 1}px`;
	};
	$effect(() => {
		void draft;
		fit();
	});
	$effect(() => {
		if (!field) return;
		const ro = new ResizeObserver(fit);
		ro.observe(field);
		return () => ro.disconnect();
	});
</script>

<!-- One column template for both ledgers: the move column is reserved
     (empty) in Not-shown rows so names and blurbs line up. -->
<li class="row" class:ordered={order}>
	{#if order}
		<form method="POST" action="?/move" use:enhance class="moves">
			<input type="hidden" name="did" value={person.did} />
			<button class="nudge up" name="direction" value="up" disabled={order.first} aria-label={`Move ${person.name} earlier`}>
				<Icon name="chevron-down" size={14} />
			</button>
			<button class="nudge" name="direction" value="down" disabled={order.last} aria-label={`Move ${person.name} later`}>
				<Icon name="chevron-down" size={14} />
			</button>
		</form>
	{:else}
		<span class="moves" aria-hidden="true"></span>
	{/if}

	<div class="who">
		{#if person.avatar}
			<img class="avatar" src={person.avatar} alt="" width="30" height="30" loading="lazy" />
		{:else}
			<span class="avatar fallback" aria-hidden="true"><Icon name="person" size={13} /></span>
		{/if}
		<span class="name">{person.name}</span>
		<span class="handle">{person.handle ? `@${person.handle}` : 'No handle on file'}</span>
		{#if person.shown && !person.handle}
			<!-- The public card needs an appview-verified handle; a person without one is left off the site. -->
			<span class="warn">No Bluesky handle on file — may not appear on the site</span>
		{/if}
	</div>

	<form
		method="POST"
		action="?/blurb"
		class="blurb"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		<input type="hidden" name="did" value={person.did} />
		<label class="visually-hidden" for={id}>What {person.name} is building</label>
		<!-- A textarea so a full 140-character blurb wraps and stays readable
		     on a phone; Enter still saves, as a one-line field would. -->
		<textarea
			{id}
			class="input"
			name="blurb"
			rows="1"
			bind:value={draft}
			bind:this={field}
			aria-invalid={over || undefined}
			aria-describedby={over ? `${id}-count` : undefined}
			placeholder="What they’re building, in one line"
			autocomplete="off"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					e.currentTarget.form?.requestSubmit();
				}
			}}
		></textarea>
		<span class="count" id={`${id}-count`} class:over>{over ? `${-left} over` : left <= 20 ? `${left} left` : ''}</span>
		<button class="ghost" class:idle={!dirty} disabled={saving || over}>{saving ? 'Saving…' : 'Save'}</button>
	</form>

	<form method="POST" action="?/toggle" use:enhance class="toggle">
		<input type="hidden" name="did" value={person.did} />
		<input type="hidden" name="shown" value={person.shown ? '0' : '1'} />
		<span class="toggle-label" aria-hidden="true">{person.shown ? 'Shown' : 'Hidden'}</span>
		<button type="submit" class="switch" role="switch" aria-checked={person.shown} aria-label={`Show ${person.name} on the retreat home`}>
			<span class="knob"></span>
		</button>
	</form>
</li>

<style>
	.row {
		display: grid;
		grid-template-columns: 4rem minmax(11rem, 1fr) minmax(16rem, 2fr) auto;
		gap: var(--space-2) var(--space-4);
		align-items: center;
		padding: 0.8rem 0;
		border-top: var(--hairline);
	}

	.moves {
		display: flex;
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

	/* Avatar beside a two-line name/handle stack. */
	.who {
		display: grid;
		grid-template-columns: 1.9rem minmax(0, 1fr);
		column-gap: var(--space-2);
		row-gap: 0.15rem;
		align-items: center;
		min-width: 0;
	}

	.who > :not(.avatar) {
		grid-column: 2;
	}

	.avatar {
		grid-row: 1 / span 2;
		width: 1.9rem;
		height: 1.9rem;
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid var(--ink-45);
	}

	.avatar.fallback {
		display: grid;
		place-items: center;
		color: var(--ink-70);
	}

	.name {
		font-size: 0.9375rem;
		font-weight: 550;
		overflow-wrap: anywhere;
	}

	.handle {
		font-size: var(--text-author);
		color: var(--ink-70);
		overflow-wrap: anywhere;
	}

	.blurb {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		min-width: 0;
	}

	.input {
		flex: 1;
		min-width: 0;
		display: block;
		resize: none;
		overflow: hidden;
		line-height: 1.4;
		/* No-JS browsers that support it size to content too. */
		field-sizing: content;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--ink-45);
		border-radius: 0;
		padding: 0.45rem 0;
		font: inherit;
		font-size: 0.9375rem;
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

	.count {
		flex: 0 0 auto;
		font-size: var(--text-kicker);
		font-variant-numeric: tabular-nums;
		color: var(--ink-70);
	}

	.count.over {
		color: var(--ink);
		font-weight: 600;
	}

	.warn {
		font-size: var(--text-author);
		color: var(--ink);
	}

	.count:empty {
		display: none;
	}

	.ghost {
		flex: 0 0 auto;
		border: 1.5px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.4rem 1rem;
		font-size: var(--text-author);
		font-weight: 600;
		transition:
			border-color 0.15s var(--ease-out),
			color 0.15s var(--ease-out);
	}

	.ghost:hover:not(:disabled) {
		border-color: var(--ink);
	}

	.ghost.idle {
		color: var(--ink-70);
		border-color: var(--ink-35);
	}

	.ghost:disabled {
		color: var(--ink-45);
		border-color: var(--ink-35);
		cursor: not-allowed;
	}

	.toggle {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-2);
	}

	.toggle-label {
		white-space: nowrap;
		min-width: 3.5rem;
		text-align: right;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--ink-70);
	}

	.switch {
		flex: 0 0 auto;
		width: 2.6rem;
		height: 1.5rem;
		border-radius: 999px;
		border: 1px solid var(--ink-45);
		display: flex;
		align-items: center;
		padding: 0 0.2rem;
		transition: background 0.2s var(--ease-out);
	}

	.switch .knob {
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
		background: var(--ink);
		transition: translate 0.2s var(--ease-out);
	}

	.switch[aria-checked='true'] {
		background: var(--ink);
		border-color: var(--ink);
	}

	.switch[aria-checked='true'] .knob {
		background: var(--ground);
		translate: 1.05rem 0;
	}

	/* Narrow: name line = who · (move arrows) · switch; the blurb line spans
	   the full row in both lists, so every field starts at the same x. */
	@media (max-width: 900px) {
		.row {
			grid-template-columns: minmax(0, 1fr) auto auto;
			grid-template-areas:
				'who moves toggle'
				'blurb blurb blurb';
		}

		.row:not(.ordered) .moves {
			display: none;
		}

		/* The switch's state word is decorative (aria-hidden); drop it so
		   the name line keeps room for names and handles. */
		.toggle-label {
			display: none;
		}

		.row {
			column-gap: var(--space-2);
		}

		.moves {
			grid-area: moves;
		}

		.who {
			grid-area: who;
		}

		.blurb {
			grid-area: blurb;
		}

		.toggle {
			grid-area: toggle;
		}
	}
</style>
