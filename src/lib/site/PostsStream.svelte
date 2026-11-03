<script lang="ts">
	import type { SitePostView } from '$lib/server/site/page';
	import { siteHome } from '$lib/content';
	import BskyPost from '$lib/site/BskyPost.svelte';
	import EveningRegion from '$lib/site/EveningRegion.svelte';
	import PhotoGallery from '$lib/site/PhotoGallery.svelte';
	import Prose from '$lib/site/Prose.svelte';

	/**
	 * Night: the posts stream on the solid ground — organizer updates (already
	 * tier-filtered, markdown rendered server-side) and Bluesky posts, merged
	 * newest first by loadSite. A dated hairline ledger; renders nothing when
	 * there are no posts.
	 */
	let { posts }: { posts: SitePostView[] } = $props();
</script>

{#if posts.length}
	<EveningRegion light="night" id="posts" clock={siteHome.evening.night} title={siteHome.posts.title}>
		<!-- role="list": list-style none drops list semantics in Safari. -->
		<ol class="stream" role="list">
			{#each posts as item (item.key)}
				<li class="entry">
					<p class="when">
						<time class="d" datetime={item.datetime}>{item.dateLabel}</time>
						<span class="k">{item.kind === 'update' ? siteHome.posts.update : siteHome.posts.bluesky}</span>
						{#if item.kind === 'update' && item.update.visibility === 'invited'}
							<span class="k">{siteHome.invitedOnlyLabel}</span>
						{/if}
					</p>
					{#if item.kind === 'update'}
						<article class="update" aria-labelledby={`u-${item.update.id}`}>
							<h3 class="place" id={`u-${item.update.id}`}>{item.update.title}</h3>
							<Prose html={item.update.html} measure="60ch" />
							<PhotoGallery photos={item.update.photos} />
						</article>
					{:else}
						<BskyPost post={item.post} />
					{/if}
				</li>
			{/each}
		</ol>
	</EveningRegion>
{/if}

<style>
	.stream {
		list-style: none;
		max-width: 52rem;
		border-bottom: var(--hairline);
	}
	.entry {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2) var(--space-5);
		padding: var(--space-4) 0;
		border-top: var(--hairline);
	}
	.when {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.9rem;
		align-items: baseline;
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		font-weight: 500;
	}
	.d {
		font-variant-numeric: tabular-nums;
	}
	.k {
		color: var(--ink-45);
	}
	.update {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.place {
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: 0.01em;
		font-size: clamp(1.35rem, 4.2vw, 1.9rem);
		line-height: 1;
		text-transform: uppercase;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}
	@media (min-width: 900px) {
		.entry {
			grid-template-columns: 11rem minmax(0, 1fr);
		}
		.when {
			display: grid;
			gap: 0.3rem;
			align-content: start;
			padding-top: 0.35rem;
		}
	}
</style>
