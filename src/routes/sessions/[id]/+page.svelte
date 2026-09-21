<script lang="ts">
	import { goto } from '$app/navigation';
	import PitchVisualizer from '$lib/components/PitchVisualizer.svelte';
	import PitchStats from '$lib/components/PitchStats.svelte';
	import { formatDuration, formatHz } from '$lib/audio/utils';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let audioElement: HTMLAudioElement;
	let currentTime = $state(0);
	let deleteError = $state<string | null>(null);

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatTime(date: Date): string {
		return new Date(date).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function handleTimeUpdate() {
		if (audioElement) {
			currentTime = audioElement.currentTime;
		}
	}

	function handleEnded() {
		currentTime = 0;
	}

	async function deleteSession() {
		if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
			return;
		}

		deleteError = null;
		try {
			const response = await fetch(`/api/sessions/${data.session._id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await goto('/sessions');
			} else {
				const body = await response.json().catch(() => null);
				deleteError = body?.message ?? `Failed to delete session (HTTP ${response.status})`;
			}
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Failed to delete session';
		}
	}

	const session = $derived(data.session);
	const exercise = $derived(data.exercise);
	const pitchData = $derived(session.pitchData);
</script>

<svelte:head>
	<title>{session.title} — Voice Training</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<!-- Back link -->
	<a
		href="/sessions"
		class="inline-flex items-center gap-2 text-surface-400 hover:text-surface-200 transition-colors mb-6"
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path
				fill-rule="evenodd"
				d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
				clip-rule="evenodd"
			/>
		</svg>
		Back to Sessions
	</a>

	<!-- Header -->
	<header class="mb-8">
		<h1 class="text-3xl font-bold text-surface-100">{session.title}</h1>
		<p class="text-surface-400 mt-2">
			{formatDate(session.createdAt)} at {formatTime(session.createdAt)}
		</p>
	</header>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Main content -->
		<div class="lg:col-span-2 space-y-6">
			<!-- Audio Player -->
			<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
				<h2 class="text-lg font-semibold text-surface-200 mb-4">Recording</h2>
				<audio
					bind:this={audioElement}
					src="/api/sessions/{session._id}/audio"
					controls
					preload="auto"
					class="w-full"
					ontimeupdate={handleTimeUpdate}
					onended={handleEnded}
				>
					Your browser does not support the audio element.
				</audio>
			</div>

			<!-- Pitch Visualizer -->
			<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
				<h2 class="text-lg font-semibold text-surface-200 mb-4">Pitch Timeline</h2>
				<PitchVisualizer
					mode="playback"
					pitchData={pitchData.points}
					targetRange={session.targetRange}
					{currentTime}
					height={300}
				/>
			</div>

			<!-- Notes -->
			{#if session.notes}
				<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
					<h2 class="text-lg font-semibold text-surface-200 mb-4">Notes</h2>
					<p class="text-surface-300 whitespace-pre-wrap">{session.notes}</p>
				</div>
			{/if}
		</div>

		<!-- Sidebar -->
		<div class="space-y-6">
			<!-- Stats -->
			<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
				<h2 class="text-lg font-semibold text-surface-200 mb-4">Session Stats</h2>
				<PitchStats
					targetRange={session.targetRange}
					avgHz={pitchData.avgPitch}
					minHz={pitchData.minPitch}
					maxHz={pitchData.maxPitch}
					timeInTargetPct={pitchData.timeInTargetPct}
					duration={session.duration}
				/>
			</div>

			<!-- Exercise Info -->
			{#if exercise}
				<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
					<h2 class="text-lg font-semibold text-surface-200 mb-4">Exercise</h2>
					<div class="space-y-3">
						<div>
							<div class="text-sm text-surface-400 uppercase tracking-wider">Title</div>
							<div class="text-surface-200 font-medium">{exercise.title}</div>
						</div>
						<div>
							<div class="text-sm text-surface-400 uppercase tracking-wider">Category</div>
							<div class="text-surface-200 font-medium capitalize">{exercise.category}</div>
						</div>
						<div>
							<div class="text-sm text-surface-400 uppercase tracking-wider">Difficulty</div>
							<div class="text-surface-200 font-medium capitalize">{exercise.difficulty}</div>
						</div>
					</div>
				</div>
			{/if}

			<!-- Target Range -->
			<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
				<h2 class="text-lg font-semibold text-surface-200 mb-4">Target Range</h2>
				<div class="flex items-center justify-between">
					<div class="text-center">
						<div class="text-2xl font-bold text-primary-400">
							{formatHz(session.targetRange.low)}
						</div>
						<div class="text-xs text-surface-400 uppercase tracking-wider">Low</div>
					</div>
					<div class="text-surface-500">—</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-primary-400">
							{formatHz(session.targetRange.high)}
						</div>
						<div class="text-xs text-surface-400 uppercase tracking-wider">High</div>
					</div>
				</div>
			</div>

			<!-- Actions -->
			<div class="bg-surface-900 rounded-xl p-6 border border-surface-800">
				<h2 class="text-lg font-semibold text-surface-200 mb-4">Actions</h2>
				<button
					onclick={deleteSession}
					class="w-full inline-flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 px-4 py-3 rounded-lg font-medium transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
							clip-rule="evenodd"
						/>
					</svg>
					Delete Session
				</button>
				{#if deleteError}
					<p class="mt-3 text-sm text-red-400">{deleteError}</p>
				{/if}
			</div>
		</div>
	</div>
</div>
