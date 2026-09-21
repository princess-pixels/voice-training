<script lang="ts">
	import RecordingStudio from '$lib/components/RecordingStudio.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Record — Voice Training</title>
</svelte:head>

<RecordingStudio targetRange={data.settings.targetRange} />
