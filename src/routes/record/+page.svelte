<script lang="ts">
	import RecordingStudio from '$lib/components/RecordingStudio.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{m.common_page_title({ page: m.recording_page_title() })}</title>
</svelte:head>

<RecordingStudio targetRange={data.settings.targetRange} />
