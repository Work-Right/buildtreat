<script lang="ts">
	import FeedItem from '$lib/ui/FeedItem.svelte';
	import AnnouncementItem from '$lib/registration/AnnouncementItem.svelte';
	import RegistrationForm from '$lib/registration/RegistrationForm.svelte';
	import RegisteredSummary from '$lib/registration/RegisteredSummary.svelte';
	import { siteHome } from '$lib/content';
	import { asksSupport } from '$lib/registration/registration';
	import type { PageData, ActionData } from '../../routes/$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Which document (if any) sits under the announcement. `editing` is the
	// user's explicit choice to open the form from a registered state.
	let editing = $state(false);
	const reg = $derived(data.registration);
	const registered = $derived(reg?.status === 'confirmed' && reg.agreedAt !== null);
	const declined = $derived(reg?.status === 'declined');
	const closedForNew = $derived(data.regClosed && !registered);

	const mode = $derived<'announce' | 'form' | 'registered'>(
		editing ? 'form' : registered ? 'registered' : 'announce'
	);

	// The ?/decline action can fail(*, { regMessage }) from either the
	// announcement or the registered-summary decline form.
	const regMessage = $derived(form && 'regMessage' in form ? (form.regMessage as string) : null);

	// A successful save closes the form; the load re-runs with the new row.
	$effect(() => {
		if (form && 'registered' in form && form.registered) editing = false;
	});
</script>

{#if mode === 'announce'}
	<a class="back-home" href="/">{siteHome.backHome}</a>
	<main class="reg-feed">
		<FeedItem id="announce" media="/media/hero-portrait.png" mediaWide="/media/hero-landscape.png" eager labelledby="ann-title">
			<AnnouncementItem
				state={closedForNew ? 'closed' : declined ? 'declined' : 'open'}
				deadlineDisplay={data.regDeadlineDisplay}
				organizerAvatar={data.organizer.avatar}
				message={regMessage}
				onconfirm={() => (editing = true)}
			/>
		</FeedItem>
	</main>
{:else if mode === 'form'}
	<a class="back-home" href="/">{siteHome.backHome}</a>
	<RegistrationForm {data} {form} oncancel={() => (editing = false)} />
{:else}
	<a class="back-home" href="/">{siteHome.backHome}</a>
	<RegisteredSummary
		registration={reg!}
		regClosed={data.regClosed}
		askSupport={asksSupport(data.surveyTravel)}
		organizerAvatar={data.organizer.avatar}
		message={regMessage}
		onedit={() => (editing = true)}
	/>
{/if}

<style>
	/* Narrow: one line under the views' kicker row, in the open sky. Wide:
	   top-left, in the margin outside the content frame. */
	.back-home {
		/* Absolute, not fixed: it scrolls away with the summary and the form. */
		position: absolute;
		top: calc(var(--space-3) + env(safe-area-inset-top) + 2.6rem);
		left: var(--gutter);
		z-index: 5;
		font-size: var(--text-author);
		color: var(--ink);
		text-underline-offset: 3px;
	}
	@media (min-width: 1320px) {
		.back-home {
			top: var(--space-3);
			left: var(--space-3);
		}
	}
	.reg-feed {
		height: 100dvh;
		overflow: hidden;
	}
</style>
