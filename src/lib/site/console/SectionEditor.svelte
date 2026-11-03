<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Photo } from '$lib/server/site/photos';
	import type { Section } from '$lib/server/site/sections';
	import { renderMarkdown } from '$lib/markdown/render';
	import Prose from '$lib/site/Prose.svelte';
	import PhotoManager from '$lib/site/console/PhotoManager.svelte';

	let {
		section,
		photos,
		mediaConfigured,
		today
	}: { section: Section; photos: Photo[]; mediaConfigured: boolean; today: string } = $props();

	// Local edit buffers. The page keys this component on id + updatedAt, so
	// a successful save (new updatedAt) remounts it from the fresh row, while
	// a failed save keeps what was typed.
	const start = () => ({
		title: section.title,
		body: section.body,
		visibility: section.visibility,
		kind: section.kind,
		publishedAt: section.publishedAt ?? today
	});
	const initial = start();
	let title = $state(initial.title);
	let body = $state(initial.body);
	let visibility = $state(initial.visibility);
	let kind = $state(initial.kind);
	let publishedAt = $state(initial.publishedAt);
	let saving = $state(false);

	// Grow the body with its content so no line ever peeks half-cut. Without
	// JS it stays a 10-row field that scrolls.
	let bodyEl = $state<HTMLTextAreaElement | null>(null);
	$effect(() => {
		void body;
		if (!bodyEl) return;
		bodyEl.style.height = 'auto';
		bodyEl.style.overflowY = 'hidden';
		// scrollHeight excludes the 1px underline; add it back (border-box).
		bodyEl.style.height = `${bodyEl.scrollHeight + 1}px`;
	});

	// renderMarkdown runs markdown-it with html: false (raw HTML escaped,
	// unsafe link schemes dropped) — the same render the public page uses.
	const preview = $derived(renderMarkdown(body));
	const dirty = $derived(
		title !== initial.title ||
			body !== initial.body ||
			visibility !== initial.visibility ||
			kind !== initial.kind ||
			(kind === 'update' && publishedAt !== initial.publishedAt)
	);
	// What the saved row is (the delete copy) vs. what the form will save.
	const noun = $derived(section.kind === 'update' ? 'update' : 'section');
	const saveLabel = $derived(kind === 'update' ? 'Save update' : 'Save section');

	const kinds = [
		{ value: 'section', label: 'Page section', hint: 'Part of the page, in the order of the list' },
		{ value: 'update', label: 'Update', hint: 'Dated, in the Posts stream (newest first)' }
	] as const;

	const options = [
		{ value: 'public', label: 'Public', hint: 'Anyone, signed in or not' },
		{ value: 'invited', label: 'Invited only', hint: 'Signed-in invited builders' },
		{ value: 'hidden', label: 'Hidden', hint: 'Draft — organizers only' }
	] as const;
</script>

<article class="editor" aria-labelledby={`ed-head-${section.id}`}>
	<!-- Stable name from the saved title; the preview shows it visibly. -->
	<h2 class="visually-hidden" id={`ed-head-${section.id}`}>Editing {section.title}</h2>
	<div class="split">
		<form
			method="POST"
			action="?/save"
			class="fields"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<input type="hidden" name="id" value={section.id} />
			<input type="hidden" name="updatedAt" value={section.updatedAt} />

			<label class="field">
				<span class="kicker lbl">Title</span>
				<input id={`title-${section.id}`} class="input title-input" name="title" bind:value={title} maxlength="120" required />
			</label>

			<label class="field">
				<span class="kicker lbl">Body</span>
				<textarea class="input body-input" name="body" bind:value={body} bind:this={bodyEl} rows="10"></textarea>
			</label>
			<p class="hint">
				Markdown: <code>## Heading</code> · <code>- item</code> · <code>1. item</code> · <code>**bold**</code> ·
				<code>_italic_</code> · <code>[label](https://…)</code>
			</p>

			<fieldset class="vis">
				<legend class="kicker lbl">Who can see this</legend>
				<div class="chips">
					{#each options as o (o.value)}
						<label class="chip">
							<input type="radio" name="visibility" value={o.value} bind:group={visibility} />
							<span>{o.label}</span>
						</label>
					{/each}
				</div>
				<p class="hint">{options.find((o) => o.value === visibility)?.hint}</p>
			</fieldset>

			<fieldset class="vis kind">
				<legend class="kicker lbl">Where it shows</legend>
				<div class="chips">
					{#each kinds as k (k.value)}
						<label class="chip">
							<input type="radio" name="kind" value={k.value} bind:group={kind} />
							<span>{k.label}</span>
						</label>
					{/each}
				</div>
				<p class="hint">{kinds.find((k) => k.value === kind)?.hint}</p>
				<!-- Always in the form (prefilled) so it works without JS; CSS hides
				     it for page sections and the server ignores it there. -->
				<label class="field date">
					<span class="kicker lbl">Publish date</span>
					<input class="input date-input" type="date" name="publishedAt" bind:value={publishedAt} />
				</label>
				<p class="hint date-hint">The date is a label — updates appear as soon as they’re saved.</p>
			</fieldset>

			<div class="actions">
				<button class="pill save" disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
				{#if dirty}<span class="hint">Unsaved changes</span>{/if}
			</div>
		</form>

		<section class="preview" aria-labelledby={`preview-${section.id}`}>
			<!-- Marked by the hairline; no eyebrow above the heading (Kicker Exception). -->
			<h3 class="visually-hidden" id={`preview-${section.id}`}>Preview</h3>
			{#if kind === 'update' && publishedAt}
				<p class="hint stamp">Update · {publishedAt}</p>
			{/if}
			<h4 class="preview-title">{title || 'Untitled'}</h4>
			{#if body.trim()}
				<!-- The home's own renderer, so lists read as ledgers here too. -->
				<Prose html={preview} measure="62ch" />
			{:else}
				<p class="hint">The body is empty — only the title will show.</p>
			{/if}
		</section>
	</div>

	<PhotoManager sectionId={section.id} {photos} {mediaConfigured} />

	<details class="danger">
		<summary class="quiet">Delete {noun}…</summary>
		<form method="POST" action="?/delete" use:enhance class="confirm">
			<input type="hidden" name="id" value={section.id} />
			<p class="hint">
				This removes “{section.title}”{photos.length
					? ` and its ${photos.length} photo${photos.length === 1 ? '' : 's'}`
					: ''} for good.
			</p>
			<button class="ghost">Delete “{section.title}”</button>
		</form>
	</details>
</article>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--space-5);
		align-items: start;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.field {
		display: grid;
		gap: 0.35rem;
	}

	.lbl {
		color: var(--ink-70);
	}

	.input {
		width: 100%;
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

	.input:focus {
		outline: none;
		border-bottom-color: var(--ink);
	}

	.title-input {
		font-size: 1.125rem;
		font-weight: 600;
	}

	.body-input {
		resize: vertical;
		line-height: 1.55;
		min-height: 10rem;
		scrollbar-width: thin;
		scrollbar-color: var(--ink-35) transparent;
	}

	.hint {
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--ink-45);
	}

	.hint code {
		white-space: nowrap;
		font-size: 0.75rem;
		color: var(--ink-70);
	}

	.vis {
		border: 0;
		display: grid;
		gap: 0.5rem;
	}

	/* No JS needed: the date only matters for an update. */
	.kind:has(input[value='section']:checked) .date,
	.kind:has(input[value='section']:checked) .date-hint {
		display: none;
	}

	.date {
		max-width: 12rem;
		padding-top: var(--space-1);
	}

	.date-input {
		color-scheme: dark;
		font-variant-numeric: tabular-nums;
	}

	.stamp {
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		font-variant-numeric: tabular-nums;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		position: relative;
		border: 1px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.4rem 0.85rem;
		font-size: var(--text-author);
		color: var(--ink-70);
		cursor: pointer;
		transition:
			background 0.15s var(--ease-out),
			color 0.15s var(--ease-out);
	}

	.chip input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.chip:has(input:checked) {
		background: var(--ink);
		border-color: var(--ink);
		color: var(--on-pill);
		font-weight: 600;
	}

	.chip:has(input:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-top: var(--space-1);
	}

	.save {
		width: auto;
		min-height: 0;
		padding: 0.6rem 1.5rem;
		font-size: 0.9375rem;
	}

	/* The preview sits on the same ground — a ruled column, not a box. */
	.preview {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-top: var(--space-2);
		border-top: var(--hairline);
		min-width: 0;
	}

	.preview-title {
		font-family: var(--font-display);
		/* The documented `place` ramp, as on the organizer's section heads. */
		font-size: clamp(1.35rem, 4.2vw, 1.9rem);
		font-weight: 650;
		line-height: 0.92;
		text-transform: uppercase;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.danger {
		padding-top: var(--space-2);
		border-top: var(--hairline);
	}

	.quiet {
		width: max-content;
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
		list-style: none;
	}

	.quiet::-webkit-details-marker {
		display: none;
	}

	.quiet:hover {
		color: var(--ink);
	}

	.confirm {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding-top: var(--space-2);
	}

	.ghost {
		border: 1.5px solid var(--ink);
		border-radius: 999px;
		padding: 0.45rem 1.1rem;
		font-size: var(--text-author);
		font-weight: 600;
		overflow-wrap: anywhere;
		text-align: left;
	}

	@media (max-width: 1180px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
