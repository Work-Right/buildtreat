<script lang="ts">
	import { enhance } from '$app/forms';
	import { dietaryOptions, registration as copy, retreat, retreatDates, retreatLocation, supportNeeds, travelModes } from '$lib/content';
	import { needsSupport } from '$lib/registration/registration';
	import type { Registration } from '$lib/server/registration';

	let {
		registration: reg,
		regClosed,
		askSupport = false,
		organizerAvatar = null,
		message = null,
		onedit
	}: {
		registration: Registration;
		regClosed: boolean;
		/** Whether this person is asked about travel support (survey ≠ "yes"). */
		askSupport?: boolean;
		organizerAvatar?: string | null;
		message?: string | null;
		onedit: () => void;
	} = $props();

	const dietaryLabels = $derived(
		reg.dietary.map((id) => dietaryOptions.find((o) => o.id === id)?.label ?? id).join(', ')
	);
	const modeLabel = $derived(reg.travelMode ? (travelModes.find((m) => m.id === reg.travelMode)?.label ?? '') : '');
	const needLabel = $derived(reg.supportNeed ? (supportNeeds.find((n) => n.id === reg.supportNeed)?.label ?? '') : '');
	const asking = $derived(needsSupport(reg.supportNeed));
	const showSupport = $derived(askSupport || reg.supportNeed !== null);
	const dollars = (n: number) => `$${n.toLocaleString('en-US')}`;
	const dash = '—';

	let declining = $state(false);
</script>

<div class="doc">
	<div class="band">
		<img src="/media/hero-portrait.png" alt="" />
		<div class="scrim" aria-hidden="true"></div>
		<div class="grain" aria-hidden="true"></div>
		<p class="kicker band-kicker">{copy.formKicker}</p>
	</div>

	<div class="head">
		<h1 class="display title">{copy.registeredTitle}</h1>
		<p class="sub">{copy.registeredSub}</p>
	</div>

	<div class="body">
		<ul class="ledger facts">
			<li><span class="k">When</span><span>{retreatDates.display}</span></li>
			<li><span class="k">Where</span><span>{retreatLocation.display}</span></li>
			<li class="muted"><span class="k"></span><span>{retreatLocation.pending}</span></li>
		</ul>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.travel.head}</span><span class="hint nudge">{copy.travelNudge}</span></div>
			<ul class="rows">
				<li><span class="k">By</span><span class="v" class:empty={!modeLabel}>{modeLabel || dash}</span></li>
				<li><span class="k">{copy.sections.travel.arriving}</span><span class="v" class:empty={!reg.travelArrival}>{reg.travelArrival || dash}</span></li>
				<li><span class="k">{copy.sections.travel.leaving}</span><span class="v" class:empty={!reg.travelDeparture}>{reg.travelDeparture || dash}</span></li>
				{#if reg.travelDetails}<li><span class="k">{copy.sections.travel.details}</span><span class="v">{reg.travelDetails}</span></li>{/if}
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		{#if showSupport}
			<section>
				<div class="sec-head"><span class="kicker">{copy.sections.support.head}</span>{#if reg.supportNeed === null}<span class="hint nudge">{copy.sections.support.nudge}</span>{/if}</div>
				<ul class="rows">
					<li><span class="k">{copy.sections.support.costs}</span><span class="v" class:empty={!needLabel}>{needLabel || dash}</span></li>
					{#if asking}
						<li><span class="k">{copy.sections.support.asked}</span><span class="v" class:empty={reg.supportAmount === null}>{reg.supportAmount === null ? dash : dollars(reg.supportAmount)}</span></li>
						<li><span class="k">{copy.sections.support.contingentRow}</span><span class="v" class:empty={reg.supportContingent === null}>{reg.supportContingent === null ? dash : reg.supportContingent ? copy.sections.support.contingentTrue : copy.sections.support.contingentFalse}</span></li>
					{/if}
				</ul>
				<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
			</section>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.contact.head}</span></div>
			<ul class="rows">
				<li><span class="k">{copy.sections.contact.name}</span><span class="v">{reg.name}</span></li>
				<li><span class="k">{copy.sections.contact.email}</span><span class="v">{reg.email}</span></li>
				<li><span class="k">{copy.sections.contact.phone}</span><span class="v" class:empty={!reg.phone}>{reg.phone || dash}</span></li>
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.food.head}</span></div>
			<ul class="rows">
				<li><span class="k">Needs</span><span class="v" class:empty={!dietaryLabels}>{dietaryLabels || 'None'}</span></li>
				{#if reg.dietaryOther}<li><span class="k">Notes</span><span class="v">{reg.dietaryOther}</span></li>{/if}
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.emergency.head}</span></div>
			<ul class="rows">
				<li><span class="k">{copy.sections.emergency.name}</span><span class="v">{reg.emergencyName}</span></li>
				<li><span class="k">{copy.sections.emergency.phone}</span><span class="v">{reg.emergencyPhone}</span></li>
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		{#if reg.accessibility || reg.notes}
			<section>
				<div class="sec-head"><span class="kicker">{copy.sections.accessibility.head} · {copy.sections.notes.head}</span></div>
				<ul class="rows">
					{#if reg.accessibility}<li><span class="k">{copy.sections.accessibility.head}</span><span class="v">{reg.accessibility}</span></li>{/if}
					{#if reg.notes}<li><span class="k">{copy.sections.notes.head}</span><span class="v">{reg.notes}</span></li>{/if}
				</ul>
				<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
			</section>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.agreements.head}</span></div>
			<ul class="rows">
				<li><span class="k">Waiver</span><span class="v">{reg.waiverVersion} · agreed {reg.agreedAt ? new Date(reg.agreedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : dash}</span></li>
				<li><span class="k">Conduct</span><span class="v">{reg.cocVersion}</span></li>
			</ul>
			<button class="pill ghost" onclick={onedit}>{copy.edit}</button>
		</section>

		<div class="foot">
			{#if regClosed}<p class="hint">Registration is closed to new sign-ups, but yours stays editable.</p>{/if}
			<form
				method="POST"
				action="?register&/decline"
				use:enhance={() => {
					declining = true;
					return async ({ update }) => {
						await update();
						declining = false;
					};
				}}
			>
				<button class="quiet" type="submit" disabled={declining}>{copy.declineAfter}</button>
			</form>
			{#if message}<p class="error" role="alert">{message}</p>{/if}
		</div>

		<p class="author">
			<span class="avatar" style:background-image={organizerAvatar ? `url(${organizerAvatar})` : undefined}></span>
			<span>{retreat.organizerLead} (<a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a>) {retreat.organizerTail}</span>
		</p>
	</div>
</div>

<style>
	.doc { position: relative; min-height: 100dvh; background: var(--ground); }
	.band { position: relative; height: 34vh; min-height: 300px; overflow: hidden; }
	.band img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
	.band .scrim { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,9,8,0.1) 0%, rgba(11,9,8,0.35) 45%, rgba(11,9,8,1) 100%); }
	.band .grain { position: absolute; inset: 0; background: url('/media/grain.png'); background-size: 340px; opacity: 0.07; mix-blend-mode: overlay; pointer-events: none; }
	.band-kicker { position: absolute; top: calc(var(--space-3) + env(safe-area-inset-top)); left: var(--gutter); }
	.head { padding: 0 var(--gutter); margin-top: -3.2rem; position: relative; }
	.title { font-size: clamp(2.2rem, 7.5vw, 3.6rem); }
	.sub { margin-top: var(--space-2); color: var(--ink-70); font-size: 0.9375rem; line-height: 1.45; max-width: 34ch; }
	.body { padding: var(--space-4) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom)); display: grid; gap: var(--space-5); }
	.facts .muted span { color: var(--ink-70); }
	.k { color: var(--ink-70); }
	section { display: grid; gap: var(--space-3); }
	.sec-head { display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--space-2); border-top: var(--hairline); }
	.hint { font-size: var(--text-author); color: var(--ink-45); }
	.nudge { color: var(--ink-70); }
	.rows { list-style: none; }
	.rows li { display: grid; grid-template-columns: 6.2rem 1fr; gap: var(--space-2); align-items: baseline; padding: 0.6rem 0; border-top: 1px solid rgba(255, 255, 255, 0.14); }
	.rows .k { font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 500; }
	.v { font-size: 1.0625rem; }
	.v.empty { color: var(--ink-45); }
	.pill.ghost { background: transparent; border: 1.5px solid var(--ink); color: var(--ink); width: auto; justify-self: start; padding: 0.55rem 1.25rem; min-height: 2.6rem; }
	.foot { display: grid; gap: var(--space-2); justify-items: center; }
	.foot .hint { color: var(--ink-70); }
	.quiet { font-size: var(--text-author); color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.quiet:disabled { opacity: 0.55; }
	.error { font-size: var(--text-author); color: var(--ink); }
	.author { display: flex; align-items: center; gap: 0.6rem; font-size: var(--text-author); color: var(--ink-70); }
	.avatar { width: 1.9rem; height: 1.9rem; border-radius: 999px; border: 1px solid var(--ink-45); background: var(--ink-12) center/cover no-repeat; }
	.handle { color: var(--ink); font-weight: 550; text-decoration: underline; text-underline-offset: 3px; }
</style>
