<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/ui/Icon.svelte';
	import type { Photo } from '$lib/server/site/photos';
	import { downscale } from '$lib/site/console/downscale';

	let { sectionId, photos, mediaConfigured }: { sectionId: number; photos: Photo[]; mediaConfigured: boolean } =
		$props();

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	/** How many files are picked — our own status line replaces the browser's "No file chosen". */
	let pickedCount = $state(0);
	/** Thumbnails that failed to load (gone from R2, or dev preview ids). */
	let broken = $state<Record<string, boolean>>({});
</script>

<section class="photos" aria-labelledby={`photos-${sectionId}`}>
	<h3 class="kicker head" id={`photos-${sectionId}`}>Photos</h3>

	{#if !mediaConfigured}
		<p class="strip" role="alert">
			Photo storage isn’t set up yet — create the <code>buildtreat-site-media</code> R2 bucket and bind it as
			<code>SITE_MEDIA</code>.
		</p>
	{:else}
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			class="upload"
			use:enhance={async ({ formData, cancel }) => {
				uploadError = null;
				const picked = formData.getAll('photo').filter((f): f is File => f instanceof File && f.size > 0);
				if (!picked.length) {
					cancel();
					uploadError = 'Pick at least one photo';
					return;
				}
				uploading = true;
				// Re-encode each pick in the browser (drops metadata, bakes in
				// orientation); the server reads the real size from the bytes and
				// strips metadata again, so only the files themselves are posted.
				formData.delete('photo');
				for (const file of picked) {
					try {
						formData.append('photo', await downscale(file));
					} catch {
						formData.append('photo', file);
					}
				}
				return async ({ update }) => {
					try {
						await update();
					} finally {
						uploading = false;
						pickedCount = 0;
					}
				};
			}}
		>
			<input type="hidden" name="id" value={sectionId} />
			<div class="upload-row">
				<!-- The native control is visually hidden; the label is the pill,
				     and focus on the input rings the pill. -->
				<label class="pick">
					<input
						class="visually-hidden"
						type="file"
						name="photo"
						accept="image/jpeg,image/png,image/webp,image/heic"
						multiple
						onchange={(e) => (pickedCount = e.currentTarget.files?.length ?? 0)}
					/>
					<Icon name="plus" size={14} /> Choose photos
				</label>
				<button class="ghost" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
				<span class="picked" aria-live="polite">{pickedCount ? `${pickedCount} photo${pickedCount === 1 ? '' : 's'} selected` : ''}</span>
			</div>
			<p class="hint">JPEG, PNG or WebP, up to 6 photos (24 MB) at a time. Large photos shrink to 2400 px before they upload.</p>
			{#if uploadError}<p class="strip" role="alert">{uploadError}</p>{/if}
		</form>
	{/if}

	{#if photos.length}
		<ul class="thumbs">
			{#each photos as p, i (p.id)}
				{@const name = `photo ${i + 1}`}
				<li>
					<div class="frame">
						{#if broken[p.id]}
							<span class="frame-note">{p.alt || 'Preview unavailable'}</span>
						{:else}
							<img
								src={`/media/site/${p.id}`}
								alt={p.alt || 'No alt text yet'}
								width={p.width}
								height={p.height}
								loading="lazy"
								onerror={() => (broken = { ...broken, [p.id]: true })}
							/>
						{/if}
					</div>
					<form
						method="POST"
						action="?/photoAlt"
						class="alt"
						use:enhance={() =>
							async ({ update }) =>
								update({ reset: false })}
					>
						<input type="hidden" name="id" value={sectionId} />
						<input type="hidden" name="photo" value={p.id} />
						<label class="kicker lbl" for={`alt-${p.id}`}>Alt text<span class="visually-hidden"> for photo {i + 1}</span></label>
						<div class="alt-row">
							<input
								id={`alt-${p.id}`}
								class="input"
								name="alt"
								value={p.alt}
								maxlength="300"
								placeholder="Describe the photo"
							/>
							<button class="quiet">Save<span class="visually-hidden"> alt text for photo {i + 1}</span></button>
						</div>
					</form>
					{#if !p.alt}<p class="hint flag">Hidden on the site until it has alt text.</p>{/if}
					<div class="row">
						<form method="POST" action="?/photoMove" use:enhance class="moves">
							<input type="hidden" name="id" value={sectionId} />
							<input type="hidden" name="photo" value={p.id} />
							<button class="nudge up" name="direction" value="up" disabled={i === 0} aria-label={`Move ${name} earlier`}>
								<Icon name="chevron-down" size={14} />
							</button>
							<button
								class="nudge"
								name="direction"
								value="down"
								disabled={i === photos.length - 1}
								aria-label={`Move ${name} later`}
							>
								<Icon name="chevron-down" size={14} />
							</button>
						</form>
					</div>
					<details class="danger">
						<summary class="quiet">Delete photo<span class="visually-hidden"> {i + 1}</span>…</summary>
						<form method="POST" action="?/photoDelete" use:enhance class="confirm">
							<input type="hidden" name="id" value={sectionId} />
							<input type="hidden" name="photo" value={p.id} />
							<button class="ghost danger-btn">Delete {name}</button>
						</form>
					</details>
				</li>
			{/each}
		</ul>
	{:else if mediaConfigured}
		<p class="hint">No photos in this section yet.</p>
	{/if}
</section>

<style>
	.photos {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-2);
		border-top: var(--hairline);
	}

	.head,
	.lbl {
		color: var(--ink-70);
	}

	.upload {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.upload-row,
	.alt-row,
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.pick {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1.5px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.45rem 1.1rem;
		font-size: var(--text-author);
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s var(--ease-out);
	}

	.pick:hover {
		border-color: var(--ink);
	}

	.pick:has(input:focus-visible) {
		outline: 2px solid var(--ink);
		outline-offset: 3px;
	}

	.picked {
		font-size: var(--text-author);
		color: var(--ink-70);
	}

	.ghost {
		border: 1.5px solid var(--ink-45);
		border-radius: 999px;
		padding: 0.45rem 1.1rem;
		font-size: var(--text-author);
		font-weight: 600;
		transition: border-color 0.15s var(--ease-out);
	}

	.ghost:hover:not(:disabled) {
		border-color: var(--ink);
	}

	.ghost:disabled {
		opacity: 0.55;
		cursor: progress;
	}

	.hint {
		font-size: 0.75rem;
		line-height: 1.45;
		color: var(--ink-45);
	}

	.hint.flag {
		color: var(--ink-70);
	}

	.strip {
		font-size: var(--text-author);
		line-height: 1.5;
		border-top: var(--hairline);
		border-bottom: var(--hairline);
		padding: 0.55rem 0;
	}

	.strip code {
		font-size: 0.75rem;
		color: var(--ink-70);
	}

	.thumbs {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--space-4) var(--space-3);
	}

	.thumbs li {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
	}

	.frame {
		display: grid;
		place-items: center;
		/* One crop for every thumbnail keeps the grid's rows even. */
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 10px;
		background: var(--ink-12);
	}

	.frame img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.frame-note {
		padding: var(--space-2);
		font-size: 0.75rem;
		line-height: 1.4;
		text-align: center;
		color: var(--ink-70);
	}

	.alt {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.input {
		flex: 1 1 8rem;
		min-width: 0;
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--ink-45);
		border-radius: 0;
		padding: 0.35rem 0;
		font-size: 0.875rem;
	}

	.input::placeholder {
		color: var(--ink-45);
	}

	.input:focus {
		outline: none;
		border-bottom-color: var(--ink);
	}

	.row {
		justify-content: space-between;
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

	.quiet {
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.quiet:hover {
		color: var(--ink);
	}

	summary.quiet {
		width: max-content;
		cursor: pointer;
		list-style: none;
	}

	summary.quiet::-webkit-details-marker {
		display: none;
	}

	.confirm {
		padding-top: var(--space-2);
	}

	.danger-btn {
		border-color: var(--ink);
		text-align: left;
		overflow-wrap: anywhere;
	}
</style>
