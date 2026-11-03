<script lang="ts">
	import { enhance } from '$app/forms';
	import { retreat, retreatDates, siteHome, waitlist } from '$lib/content';

	let {
		signedIn,
		invited,
		handle,
		registrationStatus,
		regClosed,
		regDeadlineDisplay,
		waitlistState,
		waitlistError
	}: {
		signedIn: boolean;
		invited: boolean;
		handle: string | null;
		registrationStatus: 'confirmed' | 'declined' | null;
		regClosed: boolean;
		regDeadlineDisplay: string | null;
		waitlistState: 'none' | 'member';
		waitlistError: string | null;
	} = $props();

	const stay = `${retreatDates.short} · ${retreat.facts.find((f) => f.label === 'What')?.value ?? ''}`;
	let joining = $state(false);
</script>

{#if signedIn}
	<div class="status" role="status">
		<div class="row">
			{#if !invited}
				<p class="lead">Signed in as @{handle ?? 'you'} — {siteHome.notInvited}</p>
				{#if waitlistState === 'member'}
					<p class="muted">{waitlist.member.lead}</p>
				{:else}
					<form
						method="POST"
						action="?/joinWaitlist"
						class="waitlist"
						use:enhance={() => {
							joining = true;
							return async ({ update }) => {
								await update();
								joining = false;
							};
						}}
					>
						<label class="visually-hidden" for="wl-email">{waitlist.invite.emailLabel}</label>
						<input id="wl-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
						<button class="pill" disabled={joining}>{waitlist.invite.cta}</button>
					</form>
					{#if waitlistError}<p class="error" role="alert">{waitlistError}</p>{/if}
				{/if}
			{:else if registrationStatus === 'confirmed'}
				<span class="ring on" aria-hidden="true"></span>
				<p class="lead">{siteHome.registeredLine}</p>
				<p class="muted">{stay}</p>
				<a class="quiet" href="/?register">{siteHome.editDetails} →</a>
			{:else if registrationStatus === 'declined'}
				<span class="ring" aria-hidden="true"></span>
				<p class="lead">{siteHome.declinedLine}</p>
				<a class="quiet" href="/?register">{siteHome.changeAnswer} →</a>
			{:else if regClosed}
				<span class="ring" aria-hidden="true"></span>
				<p class="lead">{siteHome.closedLine}</p>
			{:else}
				<span class="ring" aria-hidden="true"></span>
				<p class="lead">
					{regDeadlineDisplay ? `${siteHome.registerBy} ${regDeadlineDisplay}` : siteHome.registrationOpen}
				</p>
				<p class="muted">{stay}</p>
				<a class="pill cta" href="/?register">{siteHome.registerCta}</a>
			{/if}
		</div>
	</div>
{/if}

<style>
	.status {
		position: relative;
		isolation: isolate;
		background: var(--ground);
		padding: 0 var(--gutter);
	}
	/* Flat ground carries the grain at the flat-surface blend. */
	.status::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		pointer-events: none;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.05;
		mix-blend-mode: screen;
	}
	.row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		padding: 0.95rem 0;
		border-top: var(--hairline);
		border-bottom: var(--hairline);
	}
	.ring {
		flex: none;
		width: 1.15rem;
		height: 1.15rem;
		border-radius: 999px;
		border: 1.75px solid var(--ink);
	}
	.ring.on {
		background: var(--ink);
		box-shadow: inset 0 0 0 3px var(--ground);
	}
	.lead {
		font-weight: 650;
		font-size: 1.0625rem;
	}
	.muted {
		color: var(--ink-70);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 500;
	}
	.quiet {
		margin-left: auto;
		color: var(--ink-70);
		font-size: var(--text-author);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.quiet:hover {
		color: var(--ink);
	}
	.cta {
		width: auto;
		margin-left: auto;
		padding-inline: 2rem;
	}
	.waitlist {
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		flex-wrap: wrap;
		margin-left: auto;
	}
	.waitlist input {
		min-width: min(16rem, 100%);
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--ink-45);
		border-radius: 0;
		font-size: 1.125rem;
		padding: 0.45rem 0;
	}
	.waitlist input::placeholder {
		color: var(--ink-45);
	}
	.waitlist input:focus {
		outline: none;
		border-bottom-color: var(--ink);
	}
	.waitlist .pill {
		width: auto;
	}
	.error {
		flex-basis: 100%;
		color: var(--ink-70);
		font-size: var(--text-author);
	}
	@media (min-width: 900px) {
		.muted {
			font-size: var(--text-fact);
			letter-spacing: var(--track-fact);
		}
	}
	/* Narrow: the ring hangs in its own column; everything else follows the lead. */
	@media (max-width: 899px) {
		.row {
			display: grid;
			grid-template-columns: auto 1fr;
			align-items: start;
			gap: 0.45rem 0.75rem;
		}
		.ring {
			margin-top: 0.2rem;
		}
		.row > :not(.ring) {
			grid-column: 2;
			margin-left: 0;
			justify-self: start;
		}
		.row > .cta,
		.row > .waitlist {
			justify-self: stretch;
		}
		.row:not(:has(.ring)) > * {
			grid-column: 1 / -1;
		}
		.waitlist .pill,
		.waitlist input {
			width: 100%;
		}
	}
</style>
