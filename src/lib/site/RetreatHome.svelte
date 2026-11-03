<script lang="ts">
	import type { ActionData, PageData } from '../../routes/$types';
	import { retreat, siteHome } from '$lib/content';
	import { goldenAnchors, goldenBlocks } from '$lib/site/golden';
	import EveningNav, { type NavEntry } from '$lib/site/EveningNav.svelte';
	import EveningRegion from '$lib/site/EveningRegion.svelte';
	import HomeHero from '$lib/site/HomeHero.svelte';
	import LeadSection from '$lib/site/LeadSection.svelte';
	import PhotoGallery from '$lib/site/PhotoGallery.svelte';
	import PostsStream from '$lib/site/PostsStream.svelte';
	import SiteSection from '$lib/site/SiteSection.svelte';
	import StatusStrip from '$lib/site/StatusStrip.svelte';
	import WhosComing from '$lib/site/WhosComing.svelte';

	let { data, form, onsignin }: { data: PageData; form: ActionData; onsignin: () => void } = $props();

	const site = $derived(data.site);
	const waitlistError = $derived(form && 'waitlistError' in form ? (form.waitlistError as string) : null);
	const reg = $derived(data.registration);
	const status = $derived<'confirmed' | 'declined' | null>(
		reg?.status === 'confirmed' && reg.agreedAt !== null ? 'confirmed' : reg?.status === 'declined' ? 'declined' : null
	);

	// The server already filtered by tier; this only orders the page. The
	// invited view opens on logistics, then the public story.
	const plan = $derived(site.sections.filter((s) => s.visibility === 'invited'));
	const story = $derived(site.sections.filter((s) => s.visibility === 'public'));

	// Golden hour as regions: photo sections lead full-bleed, the rest pair
	// up on the golden light; one evening-clock line per region.
	const blocks = $derived(goldenBlocks([...plan, ...story]));
	const navLabel: Record<string, string> = { plan: siteHome.nav.plan, story: siteHome.nav.story };

	// A region with nothing in it has no entry.
	const entries = $derived.by(() => {
		const list: NavEntry[] = goldenAnchors(blocks).map((a) => ({ id: a.anchor, label: navLabel[a.anchor], ...a.clock }));
		if (site.attendees.length) list.push({ id: 'who', label: siteHome.nav.who, ...siteHome.evening.blue });
		if (site.posts.length) list.push({ id: 'posts', label: siteHome.nav.posts, ...siteHome.evening.night });
		return list;
	});
	// One stop isn't a journey: the nav appears once there are two places to go.
	const showNav = $derived(entries.length >= 2);

	let headH = $state(0);
</script>

<svelte:head>
	<title>{retreat.name}</title>
	<meta name="description" content={site.preview.description} />
	<meta property="og:title" content={site.preview.title} />
	<meta property="og:description" content={site.preview.description} />
	<meta property="og:image" content={site.preview.image} />
	<meta property="og:type" content="website" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="retreat-home" style:--rail-top={headH ? `${headH}px` : null}>
	<div bind:clientHeight={headH}>
		<HomeHero compact={site.tier === 'invited'} showSignIn={!data.user} organizer={site.organizer} {onsignin} />
		<StatusStrip
			signedIn={data.user !== null}
			invited={(site.tier === 'invited' && data.allowed) || site.organizer}
			handle={data.user?.handle ?? null}
			registrationStatus={status}
			regClosed={data.regClosed}
			regDeadlineDisplay={data.regDeadlineDisplay}
			waitlistState={data.waitlistState}
			{waitlistError}
		/>
	</div>

	{#if showNav}
		<EveningNav {entries} place="top" />
		<EveningNav {entries} place="gutter" />
	{/if}

	<main>
		{#each blocks as block, i (i)}
			{#if block.kind === 'lead'}
				<LeadSection section={block.section} clock={block.clock} strip={block.strip} id={block.anchor ?? undefined} eager={i === 0} />
			{:else}
				<!-- Golden runs straight into night only when it is last and there is no blue hour. -->
				<EveningRegion light="golden" clock={block.clock} deepen={i === blocks.length - 1 && !site.attendees.length}>
					{#if block.feature}
						<!-- The lead's other photos beside the section after it (text first on mobile). -->
						<div class="feature" id={block.feature.anchor ?? undefined}>
							<SiteSection section={block.feature.section} />
							<PhotoGallery photos={block.feature.photos} layout="column" />
						</div>
					{/if}
					{#each block.groups as group, g (g)}
						<div class="group" id={group.anchor ?? undefined}>
							{#each group.sections as section, k (section.id)}
								<!-- Pairs, never orphans: an odd last section takes the whole row. -->
								{@const span = k === group.sections.length - 1 && group.sections.length % 2 === 1}
								<div class="cell" class:span><SiteSection {section} {span} /></div>
							{/each}
						</div>
					{/each}
				</EveningRegion>
			{/if}
		{/each}
		{#if site.unavailable || !site.sections.length}
			<EveningRegion light="golden" deepen={!site.attendees.length}>
				<p class="more-soon">{siteHome.moreSoon}</p>
			</EveningRegion>
		{/if}

		<WhosComing attendees={site.attendees} />
		<PostsStream posts={site.posts} />
	</main>

	<!-- The page's contentinfo, outside <main>, standing on the night ground. -->
	<footer class="site-foot">
		<p class="foot">
			{retreat.organizerLead} (<a href={retreat.organizerLink}>@{retreat.organizerHandle}</a>) {retreat.organizerTail}
		</p>
	</footer>
</div>

<style>
	.retreat-home {
		position: relative;
		/* Each region's light runs on under the next; clip it at the page's end.
		   `clip` (not `hidden`) makes no scroll container, so sticky nav works. */
		overflow: clip;
	}
	@media (prefers-reduced-motion: no-preference) {
		:global(html:has(.retreat-home)) {
			scroll-behavior: smooth;
		}
	}
	.group {
		display: grid;
		gap: var(--space-5);
		scroll-margin-top: 4rem;
	}
	.group + .group {
		margin-top: calc(var(--space-5) * 1.6);
	}
	.cell {
		min-width: 0;
	}
	.feature {
		display: grid;
		gap: var(--space-4);
		scroll-margin-top: 4rem;
	}
	.feature + .group {
		margin-top: calc(var(--space-5) * 1.4);
	}
	/* The night ground under the credit: a closing line, not another region.
	   Every region before it already ends at (or near) the ground. */
	.site-foot {
		position: relative;
		isolation: isolate;
		background: var(--ground);
		padding: var(--space-3) var(--gutter) calc(var(--space-4) + env(safe-area-inset-bottom));
	}
	.site-foot::after {
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
	.more-soon {
		color: var(--ink-70);
		padding: var(--space-3) 0;
		border-top: var(--hairline);
		border-bottom: var(--hairline);
		max-width: 44ch;
	}
	.foot {
		padding-top: var(--space-3);
		border-top: var(--hairline);
		font-size: var(--text-author);
		color: var(--ink-70);
	}
	.foot a {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--ink-45);
	}
	.foot a:hover {
		text-decoration-color: var(--ink);
	}
	@media (min-width: 900px) {
		.group {
			grid-template-columns: 1fr 1fr;
			column-gap: calc(var(--space-5) * 1.5);
			row-gap: calc(var(--space-5) * 1.4);
		}
		.cell.span {
			grid-column: 1 / -1;
		}
		.feature {
			grid-template-columns: 1.25fr 1fr;
			column-gap: calc(var(--space-5) * 1.5);
			align-items: start;
		}
	}
	@media (min-width: 1180px) {
		.site-foot .foot {
			margin-right: calc(11.5rem + var(--space-5));
		}
	}
</style>
