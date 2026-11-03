<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import SectionList from '$lib/site/console/SectionList.svelte';
	import SectionEditor from '$lib/site/console/SectionEditor.svelte';
	import BskyPostsManager from '$lib/site/console/BskyPostsManager.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Selection lives in the URL (?section=id) so picking a section works
	// without JS; an action that names its section (create/save/upload…)
	// wins, so a new section opens straight away.
	const fromForm = $derived(form && 'sectionId' in form && typeof form.sectionId === 'number' ? form.sectionId : null);
	const fromUrl = $derived(Number(page.url.searchParams.get('section')) || null);
	// Sections and updates share one id space (one table), so one lookup.
	const all = $derived([...data.sections, ...data.updates]);
	const current = $derived(
		all.find((s) => s.id === fromForm) ?? all.find((s) => s.id === fromUrl) ?? all[0] ?? null
	);
	// Bluesky add/remove results report in their own panel, not the editor's flash.
	const fromBsky = $derived(Boolean(form && 'bsky' in form && form.bsky));
	const formMessage = $derived(form && 'message' in form && typeof form.message === 'string' ? form.message : null);
	const message = $derived(fromBsky ? null : formMessage);
	const bskyMessage = $derived(fromBsky ? formMessage : null);
	const withCount = <T extends { photos: unknown[] }>(rows: T[]) => rows.map((s) => ({ ...s, photoCount: s.photos.length }));
	const listed = $derived(withCount(data.sections));
	const listedUpdates = $derived(withCount(data.updates));
	const counts = $derived({
		public: data.sections.filter((s) => s.visibility === 'public').length,
		invited: data.sections.filter((s) => s.visibility === 'invited').length,
		hidden: data.sections.filter((s) => s.visibility === 'hidden').length
	});

	// A successful save bumps updatedAt and remounts the editor, dropping
	// focus; hand it to the status line so keyboard and screen-reader users
	// land on "Saved" instead of the top of the page.
	let flashEl = $state<HTMLElement | null>(null);
	let lastKey = '';
	$effect(() => {
		const key = current ? `${current.id}:${current.updatedAt}` : '';
		const sameSection = current && lastKey.startsWith(`${current.id}:`);
		if (sameSection && key !== lastKey) tick().then(() => flashEl?.focus());
		lastKey = key;
	});

	function hrefFor(id: number): string {
		return data.preview ? `?preview&section=${id}` : `?section=${id}`;
	}
</script>

<svelte:head>
	<title>Retreat info — Organizer</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<aside class="rail">
		<div class="rail-top">
			<a class="quiet back" href="/organizer"><Icon name="arrow-left" size={13} /> Console</a>
			<h1 class="display rail-title"><span>Retreat</span><span>info.</span></h1>
			{#if data.preview}
				<p class="preview-flag">Synthetic preview data</p>
			{/if}
		</div>

		<ul class="stats" aria-label="Retreat info counts">
			<li><span class="stat-num">{counts.public}</span><span class="stat-label">Public</span></li>
			<li><span class="stat-num">{counts.invited}</span><span class="stat-label">Invited</span></li>
			<li><span class="stat-num">{counts.hidden}</span><span class="stat-label">Hidden</span></li>
			<li><span class="stat-num">{data.updates.length}</span><span class="stat-label">Updates</span></li>
			<li><span class="stat-num">{data.bskyPosts.length}</span><span class="stat-label">Bluesky posts</span></li>
		</ul>

		<SectionList sections={listed} updates={listedUpdates} selected={current?.id ?? null} {hrefFor} />

		<div class="rail-end">
			<a class="quiet" href={data.preview ? '/organizer/retreat/attendees?preview' : '/organizer/retreat/attendees'}>Who’s coming <Icon name="arrow-right" size={13} /></a>
			<a class="quiet" href="/?as=public" target="_blank" rel="noopener">View as public <Icon name="arrow-right" size={13} /></a>
			<a class="quiet" href="/?as=invited" target="_blank" rel="noopener">View as invited <Icon name="arrow-right" size={13} /></a>
		</div>
	</aside>

	<main class="content">
		<!-- Site-wide, so it sits above the per-section editor as its own band. -->
		<div class="bsky">
			<BskyPostsManager posts={data.bskyPosts} message={bskyMessage} note="Picked posts appear in the Posts stream." />
		</div>

		<!-- Focus target (no role) wrapping an always-present live region, so
		     the message is announced and focus lands next to it after a save. -->
		<div class="flash-slot" tabindex="-1" bind:this={flashEl}>
			<p class:flash={message} role="status">{message ?? ''}</p>
		</div>
		{#if current}
			{#key `${current.id}:${current.updatedAt}`}
				<SectionEditor
					section={current}
					photos={current.photos}
					mediaConfigured={data.mediaConfigured}
					today={data.today}
				/>
			{/key}
		{:else}
			<header class="section-head">
				<h2 class="display section-title">No sections yet</h2>
			</header>
			<p class="empty">
				Add a section from the list. New sections start hidden, so nothing reaches the site until you choose who
				can see it.
			</p>
		{/if}

	</main>
</div>

<style>
	.page {
		position: relative;
		min-height: 100dvh;
		background: var(--ground);
		display: grid;
		grid-template-columns: clamp(16rem, 22vw, 20rem) 1fr;
	}

	/* Screen-blend grain at the flat-ground strength the organizer uses,
	   sized to the whole document (not the viewport) so tall pages and
	   full-page captures carry it to the bottom. */
	.page::after {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.05;
		mix-blend-mode: screen;
		pointer-events: none;
		z-index: 5;
	}

	.rail {
		position: sticky;
		top: 0;
		align-self: start;
		height: 100dvh;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--ink-35) transparent;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4) var(--space-4) 0 var(--gutter);
		border-right: var(--hairline);
	}

	.rail-top {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rail-title {
		display: flex;
		flex-direction: column;
		font-size: clamp(1.9rem, 2.6vw, 2.6rem);
	}

	/* The organizer rail's stat ledger: Stat-ramp numerals beside kicker labels. */
	/* Two ledger columns keep the rail short enough that the section and
	   update lists stay in reach above the sticky footer. */
	.stats {
		list-style: none;
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: var(--space-3);
		border-bottom: var(--hairline);
	}

	.stats li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0.45rem 0;
		border-top: var(--hairline);
	}

	/* An odd last count spans both columns so the ledger closes square. */
	.stats li:last-child:nth-child(odd) {
		grid-column: 1 / -1;
	}

	.stat-num {
		min-width: 1.6ch;
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 3.2vh, 3.6rem);
		font-weight: 700;
		line-height: 0.92;
		font-variant-numeric: tabular-nums;
	}

	.stat-label {
		font-size: var(--text-kicker);
		font-weight: 500;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
		color: var(--ink-70);
	}

	/* Its own band above the editor: full column width; the list's closing
	   rule brightens to Ink 45 to end the band (one rule, not two). */
	.bsky {
		padding-bottom: var(--space-3);
	}

	.bsky :global(.list),
	.bsky :global(.empty) {
		border-bottom-color: var(--ink-45);
	}


	.preview-flag {
		width: max-content;
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--ink-45);
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: var(--track-caps);
		text-transform: uppercase;
	}

	.rail-end {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) 0 calc(env(safe-area-inset-bottom) + var(--space-2));
		background: var(--ground);
		border-top: var(--hairline);
	}

	.quiet {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		width: max-content;
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.quiet:hover {
		color: var(--ink);
	}

	.content {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-4) var(--gutter) var(--space-5);
		min-width: 0;
	}

	.flash-slot:focus {
		outline: none;
	}

	/* Empty: out of the layout (no stray gap) but still in the a11y tree. */
	.flash-slot:not(:has(.flash)) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	.flash,
	.empty {
		font-size: var(--text-author);
		line-height: 1.5;
		border-top: var(--hairline);
		border-bottom: var(--hairline);
		padding: 0.55rem 0;
	}

	.empty {
		max-width: 60ch;
		color: var(--ink-70);
	}

	.section-title {
		font-size: clamp(1.35rem, 4.2vw, 1.9rem);
		font-weight: 650;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	@media (max-width: 900px) {
		.page {
			grid-template-columns: 1fr;
		}

		.rail {
			position: static;
			height: auto;
			overflow: visible;
			border-right: none;
			border-bottom: var(--hairline);
			padding: var(--space-4) var(--gutter) 0;
		}

		.rail-end {
			position: static;
			margin-top: 0;
		}
	}
</style>
