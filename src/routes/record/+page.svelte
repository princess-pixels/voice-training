<script lang="ts">
	import RecordingStudio from '$lib/components/RecordingStudio.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<RecordingStudio targetRange={data.settings.targetRange} />
