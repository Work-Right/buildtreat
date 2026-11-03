<script lang="ts">
	import AttendeeRow from '$lib/site/console/AttendeeRow.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// The server lists shown rows first, in site order, then the rest by name.
	const shown = $derived(data.attendees.filter((a) => a.shown));
	const rest = $derived(data.attendees.filter((a) => !a.shown));
	const message = $derived(form && 'message' in form && typeof form.message === 'string' ? form.message : null);
</script>

<svelte:head>
	<title>Who’s coming — Organizer</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page">
	<aside class="rail">
		<div class="rail-top">
			<a class="quiet back" href={data.preview ? '/organizer/retreat?preview' : '/organizer/retreat'}><Icon name="arrow-left" size={13} /> Retreat info</a>
			<h1 class="display rail-title"><span>Who’s</span><span>coming.</span></h1>
			{#if data.preview}
				<p class="preview-flag">Synthetic preview data</p>
			{/if}
			<ul class="stats" aria-label="Attendee counts">
				<li><span class="stat-num">{shown.length}</span><span class="stat-label">On the site</span></li>
				<li><span class="stat-num">{data.attendees.length}</span><span class="stat-label">Confirmed</span></li>
			</ul>
			<p class="note">
				Confirmed registrants only. People you switch on appear on the retreat home in this order, with their
				Bluesky name and avatar and your one-line blurb. Their registration details never leave this page.
			</p>
		</div>

		<div class="rail-end">
			<a class="quiet" href="/?as=public#who" target="_blank" rel="noopener">View as public <Icon name="arrow-right" size={13} /></a>
		</div>
	</aside>

	<main class="content">
		<p class:flash={message} class="flash-slot" role="status">{message ?? ''}</p>

		{#if !data.attendees.length}
			<p class="empty">No confirmed registrations yet. Everyone who completes registration shows up here.</p>
		{:else}
			<section class="group" aria-labelledby="on-site">
				<h2 class="kicker group-head" id="on-site">On the site</h2>
				{#if shown.length}
					<ol class="people" role="list">
						{#each shown as person, i (`${person.did}:${person.blurb}`)}
							<AttendeeRow {person} blurbMax={data.blurbMax} order={{ first: i === 0, last: i === shown.length - 1 }} />
						{/each}
					</ol>
				{:else}
					<p class="empty">Nobody yet. Switch someone on below; the who’s-coming section appears once one person is on.</p>
				{/if}
			</section>

			{#if rest.length}
				<section class="group" aria-labelledby="not-shown">
					<h2 class="kicker group-head" id="not-shown">Not shown</h2>
					<ul class="people" role="list">
						{#each rest as person (`${person.did}:${person.blurb}`)}
							<AttendeeRow {person} blurbMax={data.blurbMax} />
						{/each}
					</ul>
				</section>
			{/if}
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
	   sized to the whole document so tall pages carry it to the bottom. */
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
	.stats {
		list-style: none;
		margin-top: var(--space-1);
	}

	.stats li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: 0.45rem 0;
		border-top: var(--hairline);
	}

	.stats li:last-child {
		border-bottom: var(--hairline);
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

	.note {
		font-size: var(--text-author);
		line-height: 1.5;
		color: var(--ink-70);
		max-width: 34ch;
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
		flex-direction: column;
		gap: var(--space-2);
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
		gap: var(--space-5);
		padding: var(--space-4) var(--gutter) var(--space-5);
		min-width: 0;
	}

	/* Empty: out of the layout (no stray gap) but still in the a11y tree. */
	.flash-slot:not(.flash) {
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

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.group-head {
		color: var(--ink-70);
	}

	.people {
		list-style: none;
		border-bottom: var(--hairline);
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
