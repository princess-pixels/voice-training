<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { recorderStore } from '$lib/stores/recorder.svelte';
	import { formatDuration } from '$lib/audio/utils';
	import type { Exercise, PitchRange, PitchData, Session } from '$lib/types';
	import PitchVisualizer from './PitchVisualizer.svelte';
	import PitchStats from './PitchStats.svelte';
	import NoteKeyboard from './NoteKeyboard.svelte';

	interface Props {
		exercise?: Exercise | null;
		/** The user's saved target range from Settings. An exercise's own range wins over it. */
		targetRange: PitchRange;
		/**
		 * Inside another page: no header or exercise panel, a shorter graph, and a
		 * saved take is handed to `onSaved` instead of navigating to its page.
		 */
		embedded?: boolean;
		onSaved?: (session: Session) => void;
		/** True while a take is in progress or waiting to be saved. Bind to it to block navigation. */
		busy?: boolean;
	}

	let {
		exercise = null,
		targetRange,
		embedded = false,
		onSaved,
		busy = $bindable(false)
	}: Props = $props();

	function defaultTitle(ex: Exercise | null): string {
		const name = ex ? ex.title : 'Practice Session';
		return `${name} - ${new Date().toLocaleDateString()}`;
	}

	// Local UI state. The title is seeded once rather than synced in an effect,
	// so nothing can overwrite what the user typed into the field.
	let title = $state(untrack(() => defaultTitle(exercise)));
	let notes = $state('');
	let showSummary = $state(false);
	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let lastBlob = $state<Blob | null>(null);
	let lastPitchData = $state<PitchData | null>(null);
	/** The note chosen on the reference strip, drawn on the graph while it is chosen. */
	let referenceHz = $state<number | null>(null);
	// Pitch exercises are about hitting notes, so the strip starts open for them.
	let showNotes = $state(untrack(() => exercise?.category === 'pitch'));
	// Keyboard focus is moved by hand at each stage: the primary button stays
	// mounted across Start/Stop, the summary takes focus when it appears, and the
	// button gets it back when the summary goes.
	let recordButton = $state<HTMLButtonElement | null>(null);
	let titleInput = $state<HTMLInputElement | null>(null);

	// Exercise-specific range takes priority, otherwise the user's saved setting.
	// Always set it: the store is a module singleton, so a range left behind by a
	// previous exercise would otherwise leak into a free recording.
	$effect(() => {
		recorderStore.setTargetRange(exercise?.targetRange ?? targetRange);
	});

	// The store outlives this component. Navigating away mid-recording must
	// release the mic, AudioContext and timers rather than leaving them running.
	$effect(() => {
		return () => recorderStore.reset();
	});

	$effect(() => {
		busy = recorderStore.isRecording || showSummary;
	});

	async function handleStart() {
		showSummary = false;
		saveError = null;
		await recorderStore.startRecording();
	}

	async function handleStop() {
		try {
			const result = await recorderStore.stopRecording();
			lastBlob = result.blob;
			lastPitchData = result.pitchData;
			showSummary = true;
			await tick();
			titleInput?.focus();
		} catch (err) {
			// Release the mic and timers so the UI is not stuck in the recording
			// state, then show why. reset() clears error, so set it afterwards.
			recorderStore.reset();
			recorderStore.error = err instanceof Error ? err.message : 'Failed to stop recording';
		}
	}

	function handlePause() {
		recorderStore.pauseRecording();
	}

	function handleResume() {
		recorderStore.resumeRecording();
	}

	async function handleDiscard() {
		recorderStore.reset();
		showSummary = false;
		saveError = null;
		title = defaultTitle(exercise);
		notes = '';
		// The summary (and whichever of its buttons was pressed) is gone now.
		await tick();
		recordButton?.focus();
	}

	function handlePrimary() {
		return recorderStore.isRecording ? handleStop() : handleStart();
	}

	async function handleSave() {
		// stopRecording hands over the complete history and summary; the store
		// itself only keeps the live window after that.
		if (!lastPitchData || lastPitchData.points.length === 0) {
			saveError = 'No recording data to save';
			return;
		}

		isSaving = true;
		saveError = null;

		try {
			const formData = new FormData();
			formData.append('title', title || 'Untitled Session');
			formData.append('notes', notes);
			formData.append('exerciseId', exercise?._id || '');
			formData.append('duration', recorderStore.duration.toString());
			formData.append('targetRange', JSON.stringify(recorderStore.targetRange));
			formData.append('pitchData', JSON.stringify(lastPitchData));

			if (lastBlob) {
				formData.append('audio', lastBlob, 'session.webm');
				// Sent separately: multipart parsers may replace the part's declared
				// type with a guess from the filename (Bun turns this into video/webm).
				formData.append('audioType', lastBlob.type);
			}

			const response = await fetch('/api/sessions', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorData = await response
					.json()
					.catch(() => ({ message: 'Failed to save session' }));
				throw new Error(errorData.message || 'Failed to save session');
			}

			const result = await response.json();

			if (embedded) {
				// The host page shows the result; get ready for the next take.
				onSaved?.(result.session);
				handleDiscard();
				return;
			}

			// Client-side navigation: the unmount effect above releases the store.
			// Takes made from the routine go through the embedded path above.
			await goto(`/sessions/${result.id}`);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save session';
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="max-w-4xl mx-auto space-y-6">
	{#if !embedded}
		<!-- Header -->
		<div class="text-center">
			<h1 class="text-3xl font-bold text-surface-100">Recording Studio</h1>
			<p class="text-surface-400 mt-2">
				{#if exercise}
					Exercise: <span class="text-primary-400">{exercise.title}</span>
				{:else}
					Practice your voice with real-time pitch feedback
				{/if}
			</p>
		</div>

		{#if exercise}
			<!-- Exercise Info Panel -->
			<div class="bg-surface-900/50 border border-surface-800 rounded-lg p-4">
				<div class="flex flex-wrap gap-4 items-start">
					<div class="flex-1 min-w-[200px]">
						<h2 class="text-lg font-semibold text-surface-200">{exercise.title}</h2>
						<p class="text-sm text-surface-400 mt-1">{exercise.description}</p>
					</div>
					<div class="flex gap-2">
						<span
							class="px-2 py-1 bg-accent-500/20 text-accent-400 text-xs rounded-full capitalize"
						>
							{exercise.category}
						</span>
						<span class="px-2 py-1 bg-surface-700 text-surface-300 text-xs rounded-full capitalize">
							{exercise.difficulty}
						</span>
						{#if exercise.targetRange}
							<span class="px-2 py-1 bg-primary-500/20 text-primary-400 text-xs rounded-full">
								Target: {exercise.targetRange.low}-{exercise.targetRange.high} Hz
							</span>
						{/if}
					</div>
				</div>
				{#if exercise.instructions}
					<div class="mt-3 p-3 bg-surface-800/50 rounded text-sm text-surface-300">
						<strong class="text-surface-200">Instructions:</strong>
						{exercise.instructions}
					</div>
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Error Display -->
	{#if recorderStore.error}
		<div
			role="alert"
			class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg"
		>
			<p class="font-medium">Error</p>
			<p class="text-sm">{recorderStore.error}</p>
			<button
				onclick={() => (recorderStore.error = null)}
				class="mt-2 text-sm underline hover:text-red-200"
			>
				Dismiss
			</button>
		</div>
	{/if}

	<!-- Pitch Visualizer -->
	<div class="space-y-2">
		<PitchVisualizer
			mode={showSummary ? 'playback' : 'live'}
			pitchData={showSummary && lastPitchData ? lastPitchData.points : recorderStore.liveWindow}
			targetRange={recorderStore.targetRange}
			currentPitch={recorderStore.currentPitch}
			currentTime={recorderStore.elapsed}
			height={embedded ? 260 : 350}
			{referenceHz}
		/>
	</div>

	<!-- Reference notes -->
	<div class="space-y-2">
		<button
			type="button"
			onclick={() => (showNotes = !showNotes)}
			aria-expanded={showNotes}
			class="text-sm text-surface-400 hover:text-surface-200 inline-flex items-center gap-1.5"
		>
			<span class="inline-block transition-transform {showNotes ? 'rotate-90' : ''}">▸</span>
			Reference notes
			{#if !showNotes && referenceHz}
				<span class="text-accent-400">· {Math.round(referenceHz)} Hz</span>
			{/if}
		</button>
		<!-- Stays mounted while collapsed so the chosen note and a sustained tone survive. -->
		<div hidden={!showNotes}>
			<NoteKeyboard
				targetRange={recorderStore.targetRange}
				currentHz={showSummary ? 0 : recorderStore.currentPitch}
				bind:referenceHz
			/>
		</div>
	</div>

	<!-- Stats -->
	<PitchStats
		targetRange={recorderStore.targetRange}
		currentHz={!showSummary ? recorderStore.currentPitch : undefined}
		avgHz={recorderStore.avgPitch}
		minHz={recorderStore.minPitch}
		maxHz={recorderStore.maxPitch}
		timeInTargetPct={recorderStore.timeInTargetPct}
		duration={recorderStore.duration}
	/>

	<!-- Controls -->
	<div class="flex flex-col items-center gap-4">
		<!-- Timer -->
		<div class="text-4xl font-mono font-bold text-surface-200 tabular-nums">
			{formatDuration(recorderStore.duration)}
		</div>

		<!-- Control Buttons. One primary button toggles Start/Stop so it keeps
		     keyboard focus across the whole take instead of unmounting under it. -->
		<div class="flex items-center gap-4">
			{#if recorderStore.isRecording}
				<!-- Pause/Resume Button -->
				<button
					onclick={recorderStore.isPaused ? handleResume : handlePause}
					class="w-14 h-14 rounded-full bg-surface-700 hover:bg-surface-600 flex items-center justify-center transition-all border border-surface-600"
					aria-label={recorderStore.isPaused ? 'Resume recording' : 'Pause recording'}
				>
					{#if recorderStore.isPaused}
						<!-- Play icon -->
						<svg class="w-6 h-6 text-surface-200 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
							<path d="M8 5v14l11-7z" />
						</svg>
					{:else}
						<!-- Pause icon -->
						<svg class="w-6 h-6 text-surface-200" fill="currentColor" viewBox="0 0 24 24">
							<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
						</svg>
					{/if}
				</button>
			{/if}

			<button
				bind:this={recordButton}
				onclick={handlePrimary}
				disabled={showSummary}
				class="w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg disabled:bg-surface-700 disabled:shadow-none disabled:cursor-not-allowed {recorderStore.isRecording
					? 'bg-surface-700 hover:bg-surface-600 border border-surface-600 shadow-surface-900/30'
					: 'bg-red-500 hover:bg-red-400 shadow-red-500/30 hover:shadow-red-500/50'}"
				aria-label={recorderStore.isRecording ? 'Stop recording' : 'Start recording'}
			>
				{#if recorderStore.isRecording}
					<div class="w-5 h-5 rounded bg-red-400"></div>
				{:else}
					<div class="w-6 h-6 rounded-full bg-white"></div>
				{/if}
			</button>
		</div>

		<!-- Recording Status -->
		{#if recorderStore.isRecording}
			<div role="status" class="flex items-center gap-2 text-sm">
				<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse motion-reduce:animate-none"
				></span>
				<span class="text-surface-400">
					{recorderStore.isPaused ? 'Paused' : 'Recording...'}
				</span>
			</div>
		{/if}
	</div>

	<!-- Post-Recording Summary -->
	{#if showSummary}
		<div class="bg-surface-900/50 border border-surface-800 rounded-lg p-6 space-y-4">
			<h3 class="text-xl font-semibold text-surface-200">Session Summary</h3>

			<!-- Title Input -->
			<div class="space-y-2">
				<label for="session-title" class="block text-sm font-medium text-surface-300">
					Session Title
				</label>
				<input
					id="session-title"
					bind:this={titleInput}
					type="text"
					bind:value={title}
					class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
					placeholder="Enter session title..."
				/>
			</div>

			<!-- Notes Input -->
			<div class="space-y-2">
				<label for="session-notes" class="block text-sm font-medium text-surface-300">
					Notes (optional)
				</label>
				<textarea
					id="session-notes"
					bind:value={notes}
					rows={3}
					class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
					placeholder="Add any notes about this practice session..."></textarea>
			</div>

			<!-- Save Error -->
			{#if saveError}
				<div
					role="alert"
					class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm"
				>
					{saveError}
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex flex-wrap gap-3 pt-2">
				<button
					onclick={handleSave}
					disabled={isSaving}
					class="flex-1 min-w-[120px] px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
				>
					{#if isSaving}
						<svg
							class="w-4 h-4 animate-spin motion-reduce:animate-none"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
						</svg>
						Saving...
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
						Save Session
					{/if}
				</button>
				<button
					onclick={handleDiscard}
					disabled={isSaving}
					class="px-4 py-2 bg-surface-700 hover:bg-surface-600 disabled:opacity-50 disabled:cursor-not-allowed text-surface-200 font-medium rounded-lg transition-colors"
				>
					Discard
				</button>
			</div>
		</div>
	{/if}
</div>
