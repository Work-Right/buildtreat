<script lang="ts">
	import Icon from '$lib/ui/Icon.svelte';
	import { retreat, siteHome } from '$lib/content';

	let {
		compact,
		showSignIn,
		organizer,
		onsignin
	}: { compact: boolean; showSignIn: boolean; organizer: boolean; onsignin: () => void } = $props();

	const fact = (label: string) => retreat.facts.find((f) => f.label === label)?.value ?? '';
</script>

<!-- Golden hour: the photograph at full strength, settling into the ground. -->
<header class="hero" class:compact id="top">
	<div class="layer">
		<picture>
			<source media="(min-width: 700px)" srcset="/media/hero-landscape.png" />
			<img src="/media/hero-portrait.png" alt="" fetchpriority="high" />
		</picture>
	</div>
	<div class="scrim"></div>
	<div class="hero-top over">
		<p class="kicker">{retreat.kicker}</p>
		{#if organizer}
			<p class="tools">
				<a href="/organizer/retreat">{siteHome.editInfo}</a>
				<a href="/?as=public">{siteHome.viewAsPublic}</a>
				<a href="/?as=invited">{siteHome.viewAsInvited}</a>
			</p>
		{/if}
	</div>
	<div class="breathe"></div>
	<div class="hero-body over">
		<h1 class="display"><span class="l1">{retreat.nameLines[0]}</span><span class="l2">{retreat.nameLines[1]}</span></h1>
		{#if !compact}
			<ul class="ledger">
				<li><span>{fact('When')}</span><span class="muted">{fact('What')}</span></li>
				<li><span>{fact('Where')}</span></li>
				<li><span>{fact('Your Costs')}</span></li>
			</ul>
		{/if}
		{#if showSignIn}
			<div class="pill-wrap">
				<button class="pill" onclick={onsignin}><Icon name="butterfly" size={17} />{retreat.signIn}</button>
			</div>
		{/if}
	</div>
</header>

<style>
	.hero {
		position: relative;
		isolation: isolate;
		min-height: 100vh;
		min-height: 100svh;
		display: flex;
		flex-direction: column;
		padding: calc(var(--space-3) + env(safe-area-inset-top)) var(--gutter) var(--space-5);
	}
	.hero.compact {
		min-height: 64vh;
		min-height: 64svh;
		padding-bottom: var(--space-4);
	}
	.layer {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.layer img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 50% 40%;
	}
	.layer::after {
		content: '';
		position: absolute;
		inset: 0;
		background: url('/media/grain.png');
		background-size: 340px;
		opacity: 0.07;
		mix-blend-mode: overlay;
	}
	/* Ground-colored stops (#0b0908 = --ground) at stepped alpha. */
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 1;
		pointer-events: none;
		background: linear-gradient(
			to bottom,
			rgb(11 9 8 / 0.35) 0%,
			rgb(11 9 8 / 0) 16%,
			rgb(11 9 8 / 0) 34%,
			rgb(11 9 8 / 0.55) 52%,
			rgb(11 9 8 / 0.88) 70%,
			rgb(11 9 8 / 0.97) 100%
		);
	}
	.over {
		position: relative;
		z-index: 2;
	}
	.hero-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--space-2) var(--space-3);
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 1rem;
		font-size: var(--text-author);
	}
	.tools a {
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.tools a:hover {
		color: var(--ink);
	}
	.breathe {
		flex: 1 1 auto;
		min-height: 12vh;
	}
	.hero-body {
		display: grid;
		gap: var(--space-4);
		max-width: 34rem;
	}
	.l1,
	.l2 {
		display: block;
	}
	.l1 {
		font-size: var(--display-l1);
	}
	.l2 {
		font-size: var(--display-l2);
	}
	.compact .l1 {
		font-size: clamp(2.6rem, 9vw, 4.2rem);
	}
	.compact .l2 {
		font-size: clamp(2.2rem, 7.5vw, 3.6rem);
	}
	.ledger .muted {
		color: var(--ink-70);
		text-align: right;
	}
	.pill-wrap {
		max-width: 22rem;
	}
	@media (max-width: 899px) {
		.hero-top {
			flex-direction: column;
		}
		.pill-wrap {
			max-width: none;
		}
	}
</style>
