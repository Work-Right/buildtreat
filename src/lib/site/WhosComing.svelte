<script lang="ts">
	import type { AttendeeView } from '$lib/server/site/featured';
	import { siteHome } from '$lib/content';
	import EveningRegion from '$lib/site/EveningRegion.svelte';

	/**
	 * Blue hour: the organizer-curated, still-confirmed people (already
	 * filtered server-side). Name and avatar come only from the live Bluesky
	 * profile; the handle is validated against the handle grammar upstream.
	 */
	let { attendees }: { attendees: AttendeeView[] } = $props();

	// Neutral ring fallback: up to two initials from the name, else the handle.
	function initials(a: AttendeeView): string {
		const words = (a.displayName ?? a.handle.split('.')[0]).split(/[\s._-]+/).filter(Boolean);
		return words
			.slice(0, 2)
			.map((w) => [...w][0] ?? '')
			.join('')
			.toUpperCase();
	}
</script>

{#if attendees.length}
	<EveningRegion light="blue" id="who" clock={siteHome.evening.blue} title={siteHome.whosComing}>
		<!-- role="list": list-style none drops list semantics in Safari. -->
		<ul class="people" role="list">
			{#each attendees as a (a.did)}
				<li class="person">
					<span class="ring" aria-hidden="true">
						{#if a.avatar}
							<img src={a.avatar} alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
						{:else}
							{initials(a)}
						{/if}
					</span>
					{#if a.displayName}
						<span class="name">{a.displayName}</span>
						<span class="meta">
							<a class="h" href={`https://bsky.app/profile/${a.handle}`} rel="noopener">@{a.handle}</a>{#if a.blurb}{' · '}{a.blurb}{/if}
						</span>
					{:else}
						<!-- No profile name: the handle is the name (and the link), never twice. -->
						<a class="name h-name" href={`https://bsky.app/profile/${a.handle}`} rel="noopener">@{a.handle}</a>
						<span class="meta">{a.blurb}</span>
					{/if}
				</li>
			{/each}
		</ul>
	</EveningRegion>
{/if}

<style>
	.people {
		list-style: none;
		display: grid;
		grid-template-columns: 1fr;
		column-gap: var(--space-5);
		border-bottom: var(--hairline);
	}
	.person {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.3rem 1rem;
		align-items: center;
		padding: 1rem 0;
		border-top: var(--hairline);
		min-width: 0;
	}
	.ring {
		grid-row: span 2;
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 999px;
		border: 1px solid var(--ink-45);
		overflow: hidden;
		font-size: 0.75rem;
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
		align-self: end;
		font-family: var(--font-display);
		font-weight: 650;
		letter-spacing: 0.01em;
		font-size: clamp(1.35rem, 4.2vw, 1.9rem);
		line-height: 1;
		text-transform: uppercase;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.meta {
		align-self: start;
		font-size: 0.875rem;
		line-height: 1.35;
		color: var(--ink-70);
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.h-name {
		color: var(--ink);
		text-decoration: none;
		text-transform: none;
	}
	.h-name:hover {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.meta:empty {
		display: none;
	}
	.person:has(.meta:empty) .name {
		grid-row: span 2;
		align-self: center;
	}
	.h {
		color: var(--ink-70);
		text-decoration: none;
		transition: color 0.15s var(--ease-out);
	}
	.h:hover {
		color: var(--ink);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	@media (min-width: 900px) {
		.people {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (min-width: 1180px) {
		.people {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>
