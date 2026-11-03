<script lang="ts">
	import { enhance } from '$app/forms';
	import AgreementRow from '$lib/registration/AgreementRow.svelte';
	import { codeOfConduct, dietaryOptions, registration as copy, retreat, supportNeeds, travelModes, waiver, type SupportNeed } from '$lib/content';
	import {
		asksSupport,
		emptyRegistration,
		needsSupport,
		supportNeedFromSurvey,
		type RegistrationErrors,
		type RegistrationInput
	} from '$lib/registration/registration';
	import type { PageData, ActionData } from '../../routes/$types';

	let { data, form, oncancel }: { data: PageData; form: ActionData; oncancel: () => void } = $props();

	// Values: a failed submit echoes what was posted; otherwise the stored
	// row (editing) or survey prefill (first time).
	const echoed = $derived(form && 'regValues' in form ? (form.regValues as RegistrationInput) : null);
	const stored = $derived(data.registration);
	const initial = $derived<RegistrationInput>(
		echoed ??
			(stored && stored.status === 'confirmed'
				? {
						name: stored.name,
						email: stored.email,
						phone: stored.phone,
						emergencyName: stored.emergencyName,
						emergencyPhone: stored.emergencyPhone,
						dietary: stored.dietary,
						dietaryOther: stored.dietaryOther,
						accessibility: stored.accessibility,
						notes: stored.notes,
						travelArrival: stored.travelArrival,
						travelDeparture: stored.travelDeparture,
						travelMode: stored.travelMode,
						travelDetails: stored.travelDetails,
						// An older row never answered support: seed it from the survey.
						supportNeed: stored.supportNeed ?? supportNeedFromSurvey(data.surveyTravel),
						supportAmount: stored.supportAmount,
						supportContingent: stored.supportContingent,
						agreeWaiver: stored.agreedAt !== null && stored.waiverVersion === waiver.version,
						agreeCoc: stored.agreedAt !== null && stored.cocVersion === codeOfConduct.version
					}
				: {
						...emptyRegistration(),
						name: data.prefill.name,
						email: data.prefill.email,
						supportNeed: supportNeedFromSurvey(data.surveyTravel)
					})
	);
	// Support is asked of everyone whose survey answer wasn't "I can cover it".
	const askSupport = $derived(asksSupport(data.surveyTravel));
	const errors = $derived<RegistrationErrors>(form && 'regErrors' in form ? (form.regErrors as RegistrationErrors) : {});
	const message = $derived(form && 'regMessage' in form ? (form.regMessage as string) : null);
	const closedRefusal = $derived(form && 'regClosed' in form && form.regClosed);

	let saving = $state(false);
	let mode = $state<string | null>(null);
	let need = $state<string | null>(null);
	let contingent = $state<string | null>(null);
	$effect(() => {
		mode = initial.travelMode;
		need = initial.supportNeed;
		contingent = initial.supportContingent === null ? null : initial.supportContingent ? 'yes' : 'no';
	});
	const supportOpen = $derived(need !== null && needsSupport(need as SupportNeed));
</script>

<div class="doc">
	<div class="band">
		<img src="/media/hero-portrait.png" alt="" />
		<div class="scrim" aria-hidden="true"></div>
		<div class="grain" aria-hidden="true"></div>
		<p class="kicker band-kicker">{copy.formKicker}</p>
	</div>

	<div class="head">
		<h1 class="display title">{copy.formTitle}</h1>
		<p class="sub">{copy.formSub}</p>
	</div>

	<form
		method="POST"
		action="?register&/register"
		class="body"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				await update({ reset: false });
				saving = false;
			};
		}}
	>
		{#if closedRefusal}
			<p class="flash" role="alert"><strong>{copy.closedLeadPrefix} {data.regDeadlineDisplay ?? 'Sept 7'}.</strong> {copy.closedBody} <a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a>.</p>
		{:else if message}
			<p class="flash" role="alert">{message}</p>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.contact.head}</span></div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.name}</span>
				<input class="input" name="name" value={initial.name} autocomplete="name" required aria-invalid={errors.name ? 'true' : undefined} />
				{#if errors.name}<span class="error" role="alert">{errors.name}</span>{/if}
			</label>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.email}</span>
				<input class="input" name="email" type="email" value={initial.email} autocomplete="email" required aria-invalid={errors.email ? 'true' : undefined} />
				{#if errors.email}<span class="error" role="alert">{errors.email}</span>{/if}
			</label>
			<label class="field">
				<span class="kicker lbl">{copy.sections.contact.phone}</span>
				<input class="input" name="phone" type="tel" value={initial.phone} autocomplete="tel" placeholder={copy.sections.contact.phoneHint} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.food.head}</span><span class="hint">{copy.sections.food.hint}</span></div>
			<div class="chips" role="group" aria-label={copy.sections.food.head}>
				{#each dietaryOptions as opt (opt.id)}
					<label class="chip">
						<input type="checkbox" name="dietary" value={opt.id} checked={initial.dietary.includes(opt.id)} />
						<span>{opt.label}</span>
					</label>
				{/each}
			</div>
			{#if errors.dietary}<span class="error" role="alert">{errors.dietary}</span>{/if}
			<label class="field">
				<span class="kicker lbl">{copy.sections.food.other}</span>
				<input class="input" name="dietaryOther" value={initial.dietaryOther} placeholder={copy.sections.food.otherHint} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.emergency.head}</span></div>
			<div class="grid2">
				<label class="field">
					<span class="kicker lbl">{copy.sections.emergency.name}</span>
					<input class="input" name="emergencyName" value={initial.emergencyName} placeholder={copy.sections.emergency.nameHint} required aria-invalid={errors.emergencyName ? 'true' : undefined} />
					{#if errors.emergencyName}<span class="error" role="alert">{errors.emergencyName}</span>{/if}
				</label>
				<label class="field">
					<span class="kicker lbl">{copy.sections.emergency.phone}</span>
					<input class="input" name="emergencyPhone" type="tel" value={initial.emergencyPhone} placeholder={copy.sections.emergency.phoneHint} required aria-invalid={errors.emergencyPhone ? 'true' : undefined} />
					{#if errors.emergencyPhone}<span class="error" role="alert">{errors.emergencyPhone}</span>{/if}
				</label>
			</div>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.accessibility.head}</span><span class="hint">{copy.sections.accessibility.hint}</span></div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.accessibility.label}</span>
				<textarea class="input textarea" name="accessibility" rows="3" placeholder={copy.sections.accessibility.placeholder}>{initial.accessibility}</textarea>
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.notes.head}</span><span class="hint">{copy.sections.notes.hint}</span></div>
			<label class="field">
				<input class="input" name="notes" value={initial.notes} placeholder={copy.sections.notes.placeholder} aria-label={copy.sections.notes.head} />
			</label>
		</section>

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.travel.head}</span><span class="hint">{copy.sections.travel.hint}</span></div>
			<div class="chips" role="radiogroup" aria-label={copy.sections.travel.head}>
				{#each travelModes as m (m.id)}
					<label class="chip">
						<input type="radio" name="travelMode" value={m.id} bind:group={mode} />
						<span>{m.label}</span>
					</label>
				{/each}
			</div>
			{#if errors.travelMode}<span class="error" role="alert">{errors.travelMode}</span>{/if}
			<div class="grid2">
				<label class="field">
					<span class="kicker lbl">{copy.sections.travel.arriving}</span>
					<input class="input" name="travelArrival" value={initial.travelArrival} placeholder={copy.sections.travel.arrivingHint} />
				</label>
				<label class="field">
					<span class="kicker lbl">{copy.sections.travel.leaving}</span>
					<input class="input" name="travelDeparture" value={initial.travelDeparture} placeholder={copy.sections.travel.leavingHint} />
				</label>
			</div>
			<label class="field">
				<span class="kicker lbl">{copy.sections.travel.details}</span>
				<input class="input" name="travelDetails" value={initial.travelDetails} placeholder={copy.sections.travel.detailsHint} />
			</label>
		</section>

		{#if askSupport}
			<section>
				<div class="sec-head"><span class="kicker">{copy.sections.support.head}</span><span class="hint">{copy.sections.support.hint}</span></div>
				<p class="lead">{copy.sections.support.lead}</p>
				<div class="field">
					<span class="kicker lbl" id="support-need-lbl">{copy.sections.support.need}</span>
					<div class="chips" role="radiogroup" aria-labelledby="support-need-lbl">
						{#each supportNeeds as n (n.id)}
							<label class="chip">
								<input type="radio" name="supportNeed" value={n.id} bind:group={need} />
								<span>{n.label}</span>
							</label>
						{/each}
					</div>
					{#if errors.supportNeed}<span class="error" role="alert">{errors.supportNeed}</span>{/if}
				</div>
				{#if supportOpen}
					<label class="field">
						<span class="kicker lbl">{copy.sections.support.amount}</span>
						<span class="money">
							<span class="cur" aria-hidden="true">$</span>
							<input
								class="input"
								name="supportAmount"
								inputmode="numeric"
								autocomplete="off"
								value={initial.supportAmount ?? ''}
								placeholder="600"
								aria-invalid={errors.supportAmount ? 'true' : undefined}
							/>
						</span>
						<span class="hint">{copy.sections.support.amountHint}</span>
						{#if errors.supportAmount}<span class="error" role="alert">{errors.supportAmount}</span>{/if}
					</label>
					<div class="field">
						<span class="kicker lbl" id="support-contingent-lbl">{copy.sections.support.contingent}</span>
						<div class="chips" role="radiogroup" aria-labelledby="support-contingent-lbl">
							<label class="chip">
								<input type="radio" name="supportContingent" value="yes" bind:group={contingent} />
								<span>{copy.sections.support.contingentYes}</span>
							</label>
							<label class="chip">
								<input type="radio" name="supportContingent" value="no" bind:group={contingent} />
								<span>{copy.sections.support.contingentNo}</span>
							</label>
						</div>
						{#if errors.supportContingent}<span class="error" role="alert">{errors.supportContingent}</span>{/if}
					</div>
				{/if}
			</section>
		{/if}

		<section>
			<div class="sec-head"><span class="kicker">{copy.sections.agreements.head}</span></div>
			<ul class="agree">
				<AgreementRow name="agreeWaiver" label={copy.sections.agreements.waiver} version={waiver.version} checked={initial.agreeWaiver} error={errors.agreeWaiver ?? null} />
				<AgreementRow name="agreeCoc" label={copy.sections.agreements.coc} title={codeOfConduct.title} body={codeOfConduct.body} version={codeOfConduct.version} checked={initial.agreeCoc} error={errors.agreeCoc ?? null} />
			</ul>
		</section>

		<div class="submit">
			<button class="pill" type="submit" disabled={saving}>{saving ? copy.saving : copy.submit}</button>
			<p class="hint">{copy.submitHint}</p>
			{#if stored}
				<button type="button" class="quiet" onclick={oncancel}>Cancel</button>
			{/if}
		</div>

		<p class="author">
			<span class="avatar" style:background-image={data.organizer.avatar ? `url(${data.organizer.avatar})` : undefined}></span>
			<span>{retreat.organizerLead} (<a class="handle" href={retreat.organizerLink} target="_blank" rel="noopener">@{retreat.organizerHandle}</a>) {retreat.organizerTail}</span>
		</p>
	</form>
</div>

<style>
	.doc { position: relative; min-height: 100dvh; background: var(--ground); }
	.band { position: relative; height: 34vh; min-height: 300px; overflow: hidden; }
	.band img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 35%; }
	.band .scrim { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(11,9,8,0.1) 0%, rgba(11,9,8,0.35) 45%, rgba(11,9,8,1) 100%); }
	.band .grain { position: absolute; inset: 0; background: url('/media/grain.png'); background-size: 340px; opacity: 0.07; mix-blend-mode: overlay; pointer-events: none; }
	.band-kicker { position: absolute; top: calc(var(--space-3) + env(safe-area-inset-top)); left: var(--gutter); }
	.head { padding: 0 var(--gutter); margin-top: -3.2rem; position: relative; max-width: 42rem; }
	.title { font-size: clamp(2.2rem, 7.5vw, 3.6rem); }
	.sub { margin-top: var(--space-2); color: var(--ink-70); font-size: 0.9375rem; line-height: 1.45; max-width: 34ch; }
	.body { padding: var(--space-4) var(--gutter) calc(var(--space-5) + env(safe-area-inset-bottom)); display: grid; gap: var(--space-5); max-width: 42rem; }
	section { display: grid; gap: var(--space-3); }
	.sec-head { display: flex; justify-content: space-between; align-items: baseline; padding-top: var(--space-2); border-top: var(--hairline); }
	.hint { font-size: var(--text-author); color: var(--ink-45); }
	.field { display: grid; gap: 0.35rem; }
	.lbl { color: var(--ink-70); }
	.input { width: 100%; background: transparent; border: 0; border-bottom: 1px solid var(--ink-45); border-radius: 0; padding: 0.55rem 0; font: inherit; font-size: 1.125rem; color: var(--ink); }
	.input::placeholder { color: var(--ink-45); }
	.input:focus { outline: none; border-bottom-color: var(--ink); }
	.textarea { resize: none; line-height: 1.4; font-size: 1rem; }
	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
	.lead { font-size: 0.9375rem; line-height: 1.5; color: var(--ink-70); max-width: 40ch; }
	.money { display: flex; align-items: baseline; gap: 0.35rem; border-bottom: 1px solid var(--ink-45); }
	.money:focus-within { border-bottom-color: var(--ink); }
	.money .cur { font-size: 1.125rem; color: var(--ink-70); }
	.money .input { border-bottom: 0; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
	.chip { position: relative; border: 1px solid var(--ink-45); border-radius: 999px; padding: 0.45rem 0.85rem; font-size: 0.8125rem; color: var(--ink-70); cursor: pointer; transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out); }
	.chip input { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
	.chip:has(input:checked) { background: var(--ink); color: var(--on-pill); border-color: var(--ink); font-weight: 600; }
	.chip:has(input:focus-visible) { outline: 2px solid var(--ink); outline-offset: 3px; }
	.agree { list-style: none; }
	.error { font-size: var(--text-author); color: var(--ink); }
	.flash { padding: 0.65rem 0; border-top: var(--hairline); border-bottom: var(--hairline); font-size: var(--text-author); line-height: 1.5; color: var(--ink-70); }
	.flash strong, .handle { color: var(--ink); font-weight: 550; }
	.handle { text-decoration: underline; text-underline-offset: 3px; }
	.submit { display: grid; gap: var(--space-2); justify-items: center; }
	.submit .hint { color: var(--ink-70); }
	.quiet { font-size: var(--text-author); color: var(--ink-70); text-decoration: underline; text-underline-offset: 3px; }
	.author { display: flex; align-items: center; gap: 0.6rem; font-size: var(--text-author); color: var(--ink-70); }
	.avatar { width: 1.9rem; height: 1.9rem; border-radius: 999px; border: 1px solid var(--ink-45); background: var(--ink-12) center/cover no-repeat; }
</style>
