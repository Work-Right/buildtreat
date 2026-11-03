<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/ui/Icon.svelte';
	import { locationTallies } from '$lib/organizer/aggregate';
	import { locations } from '$lib/content';
	import type { LatePass, OrganizerResponse } from '$lib/server/organizer/admin';

	let {
		responses,
		filtered,
		latePasses,
		reopened,
		deadlinePassed,
		deadlineLine,
		preview
	}: {
		/** Every response — the stat stack is a total, never filtered. */
		responses: OrganizerResponse[];
		/** Responses under the content column's all/yes filter — the location
		    tally follows that toggle, so it reads the narrowed set. */
		filtered: OrganizerResponse[];
		latePasses: LatePass[];
		reopened: boolean;
		deadlinePassed: boolean;
		/** Rendered deadline status line, composed by the page. */
		deadlineLine: string;
		/** True only for the dev ?preview fixture state — rendered on-surface. */
		preview: boolean;
	} = $props();

	const stats = $derived({
		total: responses.length,
		yes: responses.filter((r) => r.interest === 'yes').length,
		maybe: responses.filter((r) => r.interest === 'maybe').length,
		no: responses.filter((r) => r.interest === 'no').length,
		travelHelp: responses.filter((r) => r.travel === 'partial' || r.travel === 'no').length
	});

	const tallies = $derived(locationTallies(filtered.map((r) => r.ranking)));
	const maxPoints = $derived(Math.max(1, ...tallies.tallies.map((t) => t.points)));

	const locationName = new Map(locations.map((l) => [l.id, l.name]));

	let latePassesOpen = $state(false);
</script>

<aside class="rail">
	<div class="rail-top">
		<h1 class="display rail-title"><span>Atmospheric</span><span>Organizer.</span></h1>
		<p class="deadline" class:reopened>{deadlineLine}</p>
		{#if preview}
			<p class="preview-flag">Synthetic preview data</p>
		{/if}
	</div>

	<ul class="stats" aria-label="Response counts">
		<li><span class="stat-num">{stats.total}</span><span class="stat-label">Responses</span></li>
		<li><span class="stat-num">{stats.yes}</span><span class="stat-label">Yes</span></li>
		<li><span class="stat-num">{stats.maybe}</span><span class="stat-label">Maybe</span></li>
		<li><span class="stat-num">{stats.no}</span><span class="stat-label">No</span></li>
		<li><span class="stat-num">{stats.travelHelp}</span><span class="stat-label">Need travel help</span></li>
	</ul>

	<section class="rail-section" aria-labelledby="loc-head">
		<h2 class="kicker rail-head" id="loc-head">Locations</h2>
		{#if tallies.tallies.length > 0}
			<ol class="loc-list">
				{#each tallies.tallies as t, i (t.id)}
					<li>
						<span class="loc-rank">{i + 1}</span>
						<span class="loc-name">{locationName.get(t.id) ?? t.id}</span>
						<span class="loc-bar" style="scale: {(t.points / maxPoints).toFixed(3)} 1"></span>
						<span class="loc-pts">{t.points}</span>
					</li>
				{/each}
			</ol>
			{#if tallies.noPreference > 0}
				<p class="loc-nopref">{tallies.noPreference} no preference</p>
			{/if}
		{:else}
			<p class="loc-nopref">No rankings yet</p>
		{/if}
	</section>

	<section class="rail-section" aria-labelledby="override-head">
		<h2 class="kicker rail-head" id="override-head">Deadline</h2>
		<form method="POST" action="?/setReopen" use:enhance class="toggle-row">
			<input type="hidden" name="on" value={reopened ? '0' : '1'} />
			<span class="toggle-label">
				Reopen survey
				{#if !deadlinePassed && !reopened}
					<span class="toggle-hint">for when the deadline passes</span>
				{/if}
			</span>
			<button type="submit" class="switch" role="switch" aria-checked={reopened} aria-label="Reopen survey">
				<span class="knob"></span>
			</button>
		</form>

		<div class="toggle-row passes-row">
			<button class="toggle-label passes-btn" onclick={() => (latePassesOpen = !latePassesOpen)} aria-expanded={latePassesOpen}>
				Late passes · {latePasses.length}
				<Icon name="chevron-down" size={13} />
			</button>
		</div>
		{#if latePassesOpen}
			<div class="passes">
				{#if latePasses.length > 0}
					<ul class="pass-list">
						{#each latePasses as p (p.handle)}
							<li>
								<span class="pass-handle">@{p.handle}</span>
								<form method="POST" action="?/revokePass" use:enhance>
									<input type="hidden" name="handle" value={p.handle} />
									<button class="chip-x" aria-label="Revoke late pass for @{p.handle}"><Icon name="x" size={12} /></button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
				<form method="POST" action="?/grantPass" use:enhance class="pass-add">
					<label class="visually-hidden" for="pass-handle">Handle to grant a late pass</label>
					<input id="pass-handle" type="text" name="handle" placeholder="handle.bsky.social" autocapitalize="none" spellcheck="false" />
					<button class="chip-add" aria-label="Grant late pass"><Icon name="plus" size={14} /></button>
				</form>
				<p class="passes-hint">A late pass lets one person answer the survey — or register — after the deadline.</p>
			</div>
		{/if}
	</section>

	<div class="rail-end">
		<a class="pill export" href="/organizer/responses.csv" download>Export CSV</a>
		<a class="quiet-link" href="/organizer/availability.csv" download>availability ranges →</a>
		<a class="quiet-link" href="/organizer/retreat">retreat info →</a>
		<a class="quiet-link" href="/">← the retreat site</a>
	</div>
</aside>

<style>
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
		gap: var(--space-2);
		padding: var(--space-4) var(--space-4) 0 var(--gutter);
		border-right: var(--hairline);
	}

	.rail-title {
		display: flex;
		flex-direction: column;
		font-size: clamp(1.9rem, 2.6vw, 2.6rem);
	}

	.deadline {
		margin-top: var(--space-2);
		font-size: var(--text-author);
		color: var(--ink-70);
	}

	.deadline.reopened {
		color: var(--ink);
	}

	.preview-flag {
		display: inline-block;
		width: max-content;
		margin-top: var(--space-2);
		padding: 0.25rem 0.7rem;
		border: 1px solid var(--ink-45);
		border-radius: 999px;
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.stats {
		list-style: none;
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
		/* The comp's rail numerals are condensed display digits — the
		   documented title ramp's endpoints, interpolated by viewport HEIGHT
		   so the whole rail (overrides included) fits the first viewport. */
		min-width: 1.6ch;
		font-family: var(--font-display);
		font-size: clamp(2.2rem, 3.2vh, 3.6rem);
		font-weight: 700;
		line-height: 0.92;
		font-variant-numeric: tabular-nums;
	}

	.stat-label {
		font-size: 0.6875rem;
		font-weight: 500;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--ink-70);
	}

	.rail-section {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.rail-head {
		color: var(--ink-45);
	}

	.loc-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* The comp's ledger geometry: rank, name, tally, count share one
	   baseline; the bar runs the slack between name and count. */
	.loc-list li {
		display: grid;
		grid-template-columns: 1.1rem auto minmax(1.5rem, 1fr) auto;
		grid-template-areas: 'rank name bar pts';
		align-items: center;
		column-gap: 0.5rem;
	}

	.loc-rank {
		grid-area: rank;
		font-size: 0.75rem;
		color: var(--ink-45);
		font-variant-numeric: tabular-nums;
	}

	.loc-name {
		grid-area: name;
		font-size: 0.9375rem;
	}

	.loc-bar {
		grid-area: bar;
		width: 100%;
		height: 2px;
		background: var(--ink);
		opacity: 0.75;
		border-radius: 999px;
		transform-origin: left center;
		transition: scale 0.3s var(--ease-out);
	}

	.loc-pts {
		grid-area: pts;
		font-size: 0.8125rem;
		color: var(--ink-70);
		font-variant-numeric: tabular-nums;
	}

	.loc-nopref {
		font-size: 0.8125rem;
		color: var(--ink-45);
	}

	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		padding: 0.45rem 0;
		border-top: var(--hairline);
	}

	.toggle-label {
		display: flex;
		flex-direction: column;
		font-size: 0.9375rem;
		color: var(--ink);
		text-align: left;
	}

	.toggle-hint {
		font-size: 0.75rem;
		color: var(--ink-45);
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

	.passes-row {
		border-bottom: var(--hairline);
	}

	.passes-btn {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		color: var(--ink);
	}

	.passes-btn[aria-expanded='true'] :global(svg) {
		rotate: 180deg;
	}

	.passes {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding-bottom: 0.55rem;
		border-bottom: var(--hairline);
	}

	.pass-list {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.pass-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.pass-handle {
		font-size: 0.875rem;
	}

	.pass-add {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pass-add input {
		flex: 1 1 auto;
		min-width: 0;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--ink-45);
		border-radius: 0;
		padding: 0.3rem 0;
		font-size: 0.9375rem;
	}

	.pass-add input:focus {
		outline: none;
		border-bottom-color: var(--ink);
	}

	.passes-hint {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--ink-45);
	}

	/* Docked action footer: sticks to the rail's bottom even when the rail
	   scrolls, so Export never leaves reach on short screens. */
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

	.export {
		text-decoration: none;
	}

	.quiet-link {
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.quiet-link:hover {
		color: var(--ink);
	}

	.chip-x,
	.chip-add {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 999px;
		color: var(--ink-45);
		transition: color 0.15s var(--ease-out);
	}

	.chip-add {
		border: 1px solid var(--ink-45);
		width: 2rem;
		height: 2rem;
		color: var(--ink);
	}

	.chip-x:hover {
		color: var(--ink);
	}

	/* ── mobile: the rail folds into a header ── */

	@media (max-width: 900px) {
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
