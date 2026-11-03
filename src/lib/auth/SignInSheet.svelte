<script lang="ts">
	import { login } from '@svelte-atproto/oauth/client';
	import Icon from '$lib/ui/Icon.svelte';
	import HandleTypeahead from './HandleTypeahead.svelte';
	import { retreat } from '$lib/content';
	import type { KnownUser } from '$lib/types';

	let {
		open,
		onclose,
		error,
		knownUser = null
	}: {
		open: boolean;
		/** The sheet asks to close (Escape, backdrop, ×). A callback, not
		 * `bind:open` — a component binding drops the page's SSR <title>. */
		onclose: () => void;
		error?: string | null;
		knownUser?: KnownUser | null;
	} = $props();

	let handle = $state('');
	let busy = $state(false);
	let localError = $state<string | null>(null);
	/** Set instead of localError when the pre-flight invite check says no —
	 * rendered structurally so the organizer mention can be a real link. */
	let deniedHandle = $state<string | null>(null);
	let typeahead = $state<ReturnType<typeof HandleTypeahead> | null>(null);
	/** Mirrored out of the handle field: an open dropdown swallows Escape. */
	let dropdownOpen = $state(false);
	let useDifferent = $state(false);

	const shownError = $derived(localError ?? error ?? null);
	const welcomeBack = $derived(knownUser !== null && !useDifferent);

	/* ── sign-in ── */

	let continueBtn = $state<HTMLButtonElement | null>(null);
	let restoreTo: HTMLElement | null = null;

	$effect(() => {
		if (open) {
			// Modal focus management: remember the trigger, focus the primary
			// control (input, or the Continue button in the welcome-back state).
			restoreTo ??= document.activeElement as HTMLElement | null;
			if (welcomeBack) continueBtn?.focus();
			else typeahead?.focus();
		} else {
			// A stale open dropdown would block window-level Escape forever.
			// (The field itself drops its pending debounce as it unmounts, and
			// its results and highlight go with it.)
			dropdownOpen = false;
			// Fresh state next open: back to welcome-back, no stale errors.
			// The typed handle is deliberately kept — an accidental dismissal
			// shouldn't eat what the visitor typed.
			useDifferent = false;
			deniedHandle = null;
			localError = null;
			restoreTo?.focus();
			restoreTo = null;
		}
	});

	async function go(withHandle?: string) {
		const clean = (withHandle ?? handle).trim().replace(/^@/, '');
		if (!clean || busy) return;
		busy = true;
		localError = null;
		deniedHandle = null;
		typeahead?.invalidateSearch();
		dropdownOpen = false;
		try {
			// Pre-flight invite check: an uninvited handle finds out here, not
			// after the whole PDS auth dance. Any hiccup fails open — the server
			// re-checks after auth regardless.
			try {
				const res = await fetch(`/api/invited?handle=${encodeURIComponent(clean)}`, {
					signal: AbortSignal.timeout(3000)
				});
				if (res.ok) {
					const { invited } = (await res.json()) as { invited: boolean };
					if (!invited) {
						deniedHandle = clean;
						busy = false;
						return;
					}
				}
			} catch {
				// Unreachable check service: proceed to login.
			}
			await login(clean);
		} catch (err) {
			localError = err instanceof Error ? err.message : 'Sign-in failed — try again';
			busy = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape' && !dropdownOpen) onclose();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label="Sign in with Atmosphere">
		<div class="sheet-head">
			<p class="kicker">Sign in with Atmosphere</p>
			<button type="button" class="close" onclick={onclose} aria-label="Close">
				<Icon name="x" size={16} />
			</button>
		</div>

		{#snippet errorNote()}
			{#if deniedHandle}
				<p class="error" role="alert">
					This retreat is invite-only — @{deniedHandle} isn’t on the list.
					<a class="dm" href={retreat.organizerLink} target="_blank" rel="noopener">DM @{retreat.organizerHandle}</a>
					if that seems wrong.
				</p>
			{:else if shownError}
				<p class="error" role="alert">{shownError}</p>
			{/if}
		{/snippet}

		{#if welcomeBack && knownUser}
			<div class="known">
				{#if knownUser.avatar}
					<img class="known-avatar" src={knownUser.avatar} alt="" />
				{:else}
					<span class="known-avatar fallback" aria-hidden="true"><Icon name="person" size={20} /></span>
				{/if}
				<div class="known-who">
					<p class="known-name">{knownUser.displayName ?? `@${knownUser.handle}`}</p>
					<p class="known-handle">Hey, it’s you — @{knownUser.handle}</p>
				</div>
			</div>
			{@render errorNote()}
			<button bind:this={continueBtn} type="button" class="pill" onclick={() => void go(knownUser.handle)} disabled={busy}>
				{busy ? 'Contacting your PDS…' : `Continue as @${knownUser.handle}`}
				<Icon name="butterfly" size={17} />
			</button>
			<button
				type="button"
				class="alt"
				onclick={() => {
					useDifferent = true;
					deniedHandle = null;
					localError = null;
				}}
			>
				Use a different account
			</button>
		{:else}
			<p class="explain">
				Your ATProto account identifies you — we only read your handle and profile. No posting, ever.
			</p>
			<HandleTypeahead
				bind:this={typeahead}
				id="signin-handle"
				bind:value={handle}
				bind:dropdownOpen
				oninput={() => {
					localError = null;
					deniedHandle = null;
				}}
				onsubmit={(h) => void go(h)}
			/>
			{@render errorNote()}
			<button type="button" class="pill" onclick={() => void go()} disabled={!handle.trim() || busy}>
				{busy ? 'Contacting your PDS…' : 'Continue'}
				<Icon name="butterfly" size={17} />
			</button>
		{/if}
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: rgba(11, 9, 8, 0.55);
		backdrop-filter: blur(3px);
	}

	.sheet {
		position: fixed;
		z-index: 50;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4) var(--gutter) calc(env(safe-area-inset-bottom) + var(--space-4));
		background: var(--ground);
		border-top: var(--hairline);
		animation: rise 0.45s var(--ease-out);
	}

	@keyframes rise {
		from {
			translate: 0 30%;
			opacity: 0;
		}
	}

	@media (min-width: 700px) {
		.sheet {
			left: 50%;
			right: auto;
			bottom: 50%;
			translate: -50% 50%;
			width: min(26rem, calc(100vw - 2 * var(--gutter)));
			border: var(--hairline);
			border-radius: 14px;
		}
	}

	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.close {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		border: 1px solid var(--ink-45);
		color: var(--ink);
	}

	.explain {
		font-size: var(--text-author);
		color: var(--ink-70);
		line-height: 1.5;
		max-width: 40ch;
	}

	/* ── welcome back ── */

	.known {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.known-avatar {
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		object-fit: cover;
		border: 1px solid var(--ink-45);
	}

	.known-avatar.fallback {
		display: grid;
		place-items: center;
		color: var(--ink-70);
	}

	.known-name {
		font-weight: 650;
		font-size: 1.0625rem;
	}

	.known-handle {
		font-size: var(--text-author);
		color: var(--ink-70);
	}

	.alt {
		align-self: center;
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.alt:hover {
		color: var(--ink);
	}

	.error {
		font-size: var(--text-author);
		line-height: 1.45;
	}

	.error .dm {
		color: var(--ink);
		font-weight: 550;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
