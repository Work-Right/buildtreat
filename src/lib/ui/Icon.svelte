<script lang="ts">
	export type IconName =
		| 'person'
		| 'heart'
		| 'plane'
		| 'calendar'
		| 'pin'
		| 'check'
		| 'butterfly'
		| 'chevron-down'
		| 'arrow-left'
		| 'arrow-right'
		| 'plus'
		| 'x';

	let { name, size = 22, label }: { name: IconName; size?: number; label?: string } = $props();
</script>

<!-- One icon system: 1.75 stroke, round joins, 24 grid. Butterfly is the
     Bluesky mark (filled) and intentionally outside the stroke system. -->
<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke={name === 'butterfly' ? 'none' : 'currentColor'}
	stroke-width="1.75"
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : 'presentation'}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if name === 'person'}
		<circle cx="12" cy="8" r="3.6" />
		<path d="M5.2 20c.9-3.4 3.6-5.2 6.8-5.2s5.9 1.8 6.8 5.2" />
	{:else if name === 'heart'}
		<path
			d="M12 20.2 4.9 13a4.6 4.6 0 0 1 0-6.4 4.4 4.4 0 0 1 6.3 0l.8.8.8-.8a4.4 4.4 0 0 1 6.3 0 4.6 4.6 0 0 1 0 6.4Z"
		/>
	{:else if name === 'plane'}
		<path d="M21 3 3.6 10.3l6 2.6L21 3Zm0 0-5.4 17.4-3-8.5" />
	{:else if name === 'calendar'}
		<rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
		<path d="M3.5 9.6h17M8 2.8V6m8-3.2V6" />
	{:else if name === 'pin'}
		<path d="M12 21s-6.8-6.1-6.8-10.8a6.8 6.8 0 0 1 13.6 0C18.8 14.9 12 21 12 21Z" />
		<circle cx="12" cy="10" r="2.4" />
	{:else if name === 'check'}
		<path d="m5 12.8 4.6 4.6L19 7.6" />
	{:else if name === 'chevron-down'}
		<path d="m6 9.5 6 6 6-6" />
	{:else if name === 'arrow-left'}
		<path d="M19 12H5m6-6-6 6 6 6" />
	{:else if name === 'arrow-right'}
		<path d="M5 12h14m-6-6 6 6-6 6" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'x'}
		<path d="m6 6 12 12M18 6 6 18" />
	{:else if name === 'butterfly'}
		<path
			fill="currentColor"
			d="M12 10.8c-.9-1.9-3.4-5.5-5.7-7.1C4.1 2.1 3.2 2.4 2.6 2.7c-.7.3-.8 1.4-.8 2 0 .7.4 5.5.6 6.3.8 2.6 3.4 3.5 5.8 3.2-3.5.5-6.6 1.8-2.5 6.3 4.5 4.7 6.2-1 6.3-2.3 0 1.3 1.8 7 6.3 2.3 4.1-4.5 1-5.8-2.5-6.3 2.4.3 5-.6 5.8-3.2.2-.8.6-5.6.6-6.3 0-.6-.1-1.7-.8-2-.6-.3-1.5-.6-3.7 1-2.3 1.6-4.8 5.2-5.7 7.1Z"
		/>
	{/if}
</svg>
