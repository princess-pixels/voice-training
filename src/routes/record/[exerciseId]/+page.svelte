<script lang="ts">
	import RecordingStudio from '$lib/components/RecordingStudio.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title
		>{m.common_page_title({
			page: m.recording_exercise_page_title({ title: data.exercise.title })
		})}</title
	>
</svelte:head>

<RecordingStudio exercise={data.exercise} targetRange={data.settings.targetRange} />
