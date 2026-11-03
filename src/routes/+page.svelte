<script lang="ts">
	import RegistrationFlow from '$lib/registration/RegistrationFlow.svelte';
	import RetreatHome from '$lib/site/RetreatHome.svelte';
	import SignInSheet from '$lib/auth/SignInSheet.svelte';

	let { data, form } = $props();

	let sheetOpen = $state(false);
</script>

{#if data.registerMode && data.registrationMode}
	<RegistrationFlow {data} {form} />
{:else}
	<div inert={sheetOpen}>
		<RetreatHome {data} {form} onsignin={() => (sheetOpen = true)} />
	</div>
	<SignInSheet open={sheetOpen} onclose={() => (sheetOpen = false)} error={data.authError} knownUser={data.knownUser} />
{/if}
