<script lang="ts">
	import type { BskyPostView } from '$lib/server/site/bsky-posts';
	import { siteHome } from '$lib/content';
	import Icon from '$lib/ui/Icon.svelte';

	/**
	 * One Bluesky post, rendered natively in the world's ink: author ring,
	 * name, handle, text, thumbnails, the way out. No embed script, no card.
	 * Everything here came from the public appview and was validated
	 * server-side (handle grammar, https avatars/thumbs, http(s) facet links).
	 */
	let { post }: { post: BskyPostView } = $props();

	const author = $derived(post.author);
	// The handle is appview-verified; without one, the DID is still a valid profile path.
	const profileHref = $derived(`https://bsky.app/profile/${author.handle ?? author.did}`);
	const name = $derived(author.displayName ?? (author.handle ? `@${author.handle}` : author.did));
	const initials = $derived(
		(author.displayName ?? author.handle?.split('.')[0] ?? '')
			.split(/[\s._-]+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => [...w][0] ?? '')
			.join('')
			.toUpperCase()
	);
	const hasText = $derived(post.segments.some((s) => s.text.trim()));
</script>

<div class="bsky">
	<p class="who">
		<span class="ring" aria-hidden="true">
			{#if author.avatar}
				<img src={author.avatar} alt="" width="36" height="36" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
			{:else}
				{initials}
			{/if}
		</span>
		<a class="name" href={profileHref} rel="noopener noreferrer">{name}</a>
		{#if author.displayName && author.handle}
			<span class="h">@{author.handle}</span>
		{/if}
		<span class="mark"><Icon name="butterfly" size={16} /></span>
	</p>
	{#if hasText}
		<!-- Text nodes only: Svelte escapes each segment; links are http(s) facets. -->
		<p class="text">{#each post.segments as seg, i (i)}{#if seg.href}<a href={seg.href} rel="noopener noreferrer">{seg.text}</a>{:else}{seg.text}{/if}{/each}</p>
	{/if}
	{#if post.images.length}
		<ul class="images" class:single={post.images.length === 1} role="list">
			{#each post.images as img, i (i)}
				<li>
					<img
						src={img.thumb}
						alt={img.alt}
						width={img.width ?? undefined}
						height={img.height ?? undefined}
						loading="lazy"
						decoding="async"
						referrerpolicy="no-referrer"
					/>
				</li>
			{/each}
		</ul>
	{/if}
	<a class="out" href={post.url} rel="noopener noreferrer">{siteHome.posts.viewOnBluesky} <Icon name="arrow-right" size={13} /></a>
</div>

<style>
	.bsky {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.who {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.25rem 0.7rem;
		font-size: 0.875rem;
		min-width: 0;
	}
	.ring {
		display: grid;
		place-items: center;
		flex: none;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 999px;
		border: 1px solid var(--ink-45);
		overflow: hidden;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--ink-70);
	}
	.ring img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.name {
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.name:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.h {
		color: var(--ink-70);
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.mark {
		display: grid;
		margin-left: auto;
		color: var(--ink-45);
	}
	.text {
		font-size: 1.125rem;
		line-height: 1.45;
		max-width: 40ch;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.text a {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--ink-45);
	}
	.text a:hover {
		text-decoration-color: var(--ink);
	}
	.images {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-1);
		max-width: 34rem;
	}
	.images li {
		min-width: 0;
	}
	.images img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
		background: var(--ink-12);
	}
	.images.single {
		grid-template-columns: minmax(0, 1fr);
		max-width: 28rem;
	}
	.images.single img {
		aspect-ratio: auto;
		max-height: 26rem;
	}
	.out {
		justify-self: start;
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		font-size: var(--text-author);
		color: var(--ink-70);
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color 0.15s var(--ease-out);
	}
	.out:hover {
		color: var(--ink);
	}
	@media (max-width: 899px) {
		.text {
			font-size: 1.0625rem;
		}
	}
</style>
