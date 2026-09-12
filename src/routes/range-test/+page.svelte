<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { PitchDetector } from '$lib/audio/pitchDetector';
	import { formatHz, noteFromHz, semitonesBetween, percentile } from '$lib/audio/utils';
	import { getMicrophoneStream } from '$lib/audio/mic';
	import type { RangeTest, RangeTestMode } from '$lib/types';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	type Phase = 'idle' | 'low' | 'high' | 'done';

	// Only readings this confident count toward the result — the range is the one
	// number we really don't want a noisy frame to distort.
	const MIN_CONFIDENCE = 0.85;
	// Roughly a second of sustained tone at 60fps before a phase can be finished.
	const MIN_SAMPLES = 45;

	const MODE_META: Record<
		RangeTestMode,
		{ label: string; short: string; blurb: string; bar: string; dot: string; highPrompt: string }
	> = {
		modal: {
			label: 'Speaking range',
			short: 'Speaking',
			blurb:
				'Modal voice only — the register you actually talk in. This is the one that tracks usable progress.',
			bar: 'bg-gradient-to-r from-accent-500 to-primary-500',
			dot: 'bg-primary-500',
			highPrompt:
				'Glide upward, but stop before your voice flips or thins out into falsetto. Hold the highest note you can keep in your normal speaking register.'
		},
		full: {
			label: 'Full range',
			short: 'Full',
			blurb:
				'Everything your voice can produce, falsetto and head voice included. Interesting, but not where you speak.',
			bar: 'bg-gradient-to-r from-sky-500 to-accent-500',
			dot: 'bg-sky-500',
			highPrompt:
				'Glide upward. Falsetto is fine — hold the highest note you can sustain without straining. Stop if it hurts.'
		}
	};

	let mode = $state<RangeTestMode>('modal');
	let phase = $state<Phase>('idle');
	let currentHz = $state(0);
	let confidence = $state(0);
	let samples = $state<number[]>([]);
	let lowHz = $state(0);
	let highHz = $state(0);
	let notes = $state('');
	let micError = $state<string | null>(null);
	let saveError = $state<string | null>(null);
	let isSaving = $state(false);
	let saved = $state(false);
	let historyFilter = $state<RangeTestMode | 'all'>('all');
	let relabelError = $state<string | null>(null);

	let detector: PitchDetector | null = null;
	let stream: MediaStream | null = null;

	const enoughSamples = $derived(samples.length >= MIN_SAMPLES);
	const semitones = $derived(lowHz && highHz ? semitonesBetween(lowHz, highHz) : 0);

	// The test this result is compared against. Snapshotted when the test finishes
	// rather than derived from history, so saving (which refreshes history and would
	// otherwise make the new result its own "previous") doesn't change the comparison.
	// Only ever compare against an earlier result of the same mode — a modal test read
	// against a full-range one would look like a huge regression.
	let baseline = $state<RangeTest | null>(null);

	const visibleHistory = $derived(
		historyFilter === 'all' ? data.history : data.history.filter((t) => t.mode === historyFilter)
	);

	function teardown() {
		detector?.destroy();
		detector = null;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
	}

	onDestroy(teardown);

	async function start() {
		micError = null;
		saveError = null;
		saved = false;
		lowHz = 0;
		highHz = 0;
		samples = [];

		try {
			stream = await getMicrophoneStream();
		} catch {
			micError =
				'Could not access the microphone. Check that permission is granted in your browser address bar.';
			return;
		}

		detector = new PitchDetector(stream);
		detector.onPitch(({ hz, confidence: c }) => {
			currentHz = hz;
			confidence = c;
			if (hz > 0 && c >= MIN_CONFIDENCE) {
				samples.push(hz);
			}
		});
		detector.start();
		phase = 'low';
	}

	function finishLowPhase() {
		// 5th percentile rather than the outright minimum: an octave-halving error
		// on one frame shouldn't become your recorded low note.
		lowHz = percentile(samples, 0.05);
		samples = [];
		phase = 'high';
	}

	function finishHighPhase() {
		highHz = percentile(samples, 0.95);
		baseline = data.history.find((t) => t.mode === mode) ?? null;
		samples = [];
		teardown();
		currentHz = 0;
		confidence = 0;
		phase = 'done';
	}

	function restart() {
		teardown();
		phase = 'idle';
		currentHz = 0;
		confidence = 0;
		samples = [];
		lowHz = 0;
		highHz = 0;
		notes = '';
		saved = false;
		saveError = null;
		baseline = null;
	}

	async function save() {
		isSaving = true;
		saveError = null;
		try {
			const response = await fetch('/api/range-tests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode, lowHz, highHz, notes })
			});
			if (!response.ok) throw new Error(await response.text());

			// `data` is a plain prop object, so mutating data.history would not re-render.
			// Re-run the load instead; it is a single 30-document query.
			await invalidateAll();
			saved = true;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save range test';
		} finally {
			isSaving = false;
		}
	}

	async function relabel(test: RangeTest) {
		const next: RangeTestMode = test.mode === 'modal' ? 'full' : 'modal';
		relabelError = null;
		try {
			const response = await fetch(`/api/range-tests?id=${test._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode: next })
			});
			if (!response.ok) throw new Error(await response.text());

			await invalidateAll();
		} catch (err) {
			relabelError = err instanceof Error ? err.message : 'Failed to relabel test';
		}
	}

	function formatDate(date: Date | string): string {
		return new Date(date).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	// Shared Hz scale for the history bars, padded a little at both ends.
	const scale = $derived.by(() => {
		if (visibleHistory.length === 0) return { min: 80, max: 400 };
		const lows = visibleHistory.map((t) => t.lowHz);
		const highs = visibleHistory.map((t) => t.highHz);
		return {
			min: Math.min(...lows) - 10,
			max: Math.max(...highs) + 10
		};
	});

	function barStyle(test: RangeTest): string {
		const span = scale.max - scale.min;
		const left = ((test.lowHz - scale.min) / span) * 100;
		const width = ((test.highHz - test.lowHz) / span) * 100;
		return `left: ${left}%; width: ${width}%`;
	}
</script>

<svelte:head>
	<title>Pitch Range Test — Voice Training</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8 space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-surface-100">Pitch Range Test</h1>
		<p class="text-surface-400 mt-2">
			Measure your lowest and highest comfortable pitch, and watch the range shift over time.
		</p>
	</div>

	{#if micError}
		<div class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg">
			{micError}
		</div>
	{/if}

	<!-- Test panel -->
	<div class="bg-surface-900 border border-surface-800 rounded-2xl p-8">
		{#if phase === 'idle'}
			<div class="space-y-6">
				<!-- Mode selector -->
				<div>
					<p class="text-sm font-medium text-surface-300 mb-3 text-center">
						What are you measuring?
					</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{#each ['modal', 'full'] as const as m}
							<button
								type="button"
								onclick={() => (mode = m)}
								class="text-left p-4 rounded-xl border transition-all {mode === m
									? 'bg-primary-500/10 border-primary-500/50'
									: 'bg-surface-950/50 border-surface-800 hover:border-surface-700'}"
							>
								<span
									class="block font-medium mb-1 {mode === m
										? 'text-primary-300'
										: 'text-surface-200'}"
								>
									{MODE_META[m].label}
								</span>
								<span class="block text-xs text-surface-400 leading-relaxed">
									{MODE_META[m].blurb}
								</span>
							</button>
						{/each}
					</div>
					<p class="text-xs text-surface-500 mt-3 text-center">
						These are tracked as separate series — falsetto reads far higher than modal voice, so
						mixing them into one trend would be meaningless.
					</p>
				</div>

				<div class="text-center space-y-5 pt-2 border-t border-surface-800">
					<p class="text-surface-300 max-w-lg mx-auto pt-4">
						You'll be asked for your <strong class="text-surface-100">lowest</strong> comfortable
						note, then your <strong class="text-surface-100">highest</strong>. Comfortable means no
						straining, no pushing — if it hurts or feels forced, it doesn't count.
					</p>
					<p class="text-surface-500 text-sm max-w-lg mx-auto">
						Warm up first if you haven't. A cold voice will read lower and narrower than your real
						range, and you'll only be comparing against yourself later.
					</p>
					<button
						onclick={start}
						class="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary-500/25"
					>
						Start {MODE_META[mode].label} Test
					</button>
				</div>
			</div>
		{:else if phase === 'low' || phase === 'high'}
			{@const isLow = phase === 'low'}
			<div class="text-center space-y-6">
				<div>
					<p class="text-sm uppercase tracking-wide text-surface-500 mb-2">
						{MODE_META[mode].label} · Step {isLow ? '1' : '2'} of 2
					</p>
					<h2 class="text-2xl font-semibold text-surface-100">
						{isLow
							? 'Slide down to your lowest comfortable note'
							: 'Slide up to your highest comfortable note'}
					</h2>
					<p class="text-surface-400 mt-2 max-w-lg mx-auto">
						{isLow
							? 'Hum or sing "ah", gliding downward. When you reach the lowest note you can hold steadily without it turning into a rattle, hold it there.'
							: MODE_META[mode].highPrompt}
					</p>
				</div>

				<!-- Live pitch readout -->
				<div class="py-6">
					<div
						class="text-6xl font-mono font-bold tabular-nums transition-colors"
						class:text-surface-700={currentHz === 0}
						class:text-primary-400={currentHz > 0}
					>
						{formatHz(currentHz)}
					</div>
					<div class="text-2xl text-surface-500 mt-1">{noteFromHz(currentHz)}</div>
				</div>

				<!-- Sample progress -->
				<div class="max-w-xs mx-auto space-y-2">
					<div class="h-2 bg-surface-800 rounded-full overflow-hidden">
						<div
							class="h-full bg-primary-500 transition-all duration-150"
							style="width: {Math.min(100, (samples.length / MIN_SAMPLES) * 100)}%"
						></div>
					</div>
					<p class="text-xs text-surface-500">
						{enoughSamples
							? 'Got enough — keep going, or move on when ready'
							: 'Keep sounding until the bar fills'}
					</p>
				</div>

				<button
					onclick={isLow ? finishLowPhase : finishHighPhase}
					disabled={!enoughSamples}
					class="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-800 disabled:text-surface-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
				>
					{isLow ? 'Next: highest note' : 'Finish test'}
				</button>

				{#if isLow === false && lowHz > 0}
					<p class="text-sm text-surface-500">
						Lowest recorded: <span class="text-surface-300">{formatHz(lowHz)}</span> ({noteFromHz(
							lowHz
						)})
					</p>
				{/if}
			</div>
		{:else}
			<!-- Results -->
			<div class="space-y-6">
				<div class="text-center">
					<h2 class="text-2xl font-semibold text-surface-100">Your range</h2>
					<p class="text-sm text-surface-500 mt-1">{MODE_META[mode].label}</p>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div class="bg-surface-950/50 border border-surface-800 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">Lowest</p>
						<p class="text-3xl font-bold text-surface-100">{formatHz(lowHz)}</p>
						<p class="text-sm text-surface-500 mt-1">{noteFromHz(lowHz)}</p>
					</div>
					<div class="bg-surface-950/50 border border-surface-800 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">Highest</p>
						<p class="text-3xl font-bold text-surface-100">{formatHz(highHz)}</p>
						<p class="text-sm text-surface-500 mt-1">{noteFromHz(highHz)}</p>
					</div>
					<div class="bg-surface-950/50 border border-primary-500/30 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">Range</p>
						<p class="text-3xl font-bold text-primary-400">{semitones.toFixed(1)}</p>
						<p class="text-sm text-surface-500 mt-1">semitones</p>
					</div>
				</div>

				{#if baseline}
					{@const lowDelta = lowHz - baseline.lowHz}
					{@const highDelta = highHz - baseline.highHz}
					<div
						class="bg-surface-950/50 border border-surface-800 rounded-xl p-4 text-sm text-surface-400"
					>
						<p class="mb-1 text-surface-300 font-medium">
							Compared with your last {MODE_META[mode].label.toLowerCase()} test ({formatDate(
								baseline.createdAt
							)})
						</p>
						<p>
							Low {lowDelta >= 0 ? '+' : ''}{Math.round(lowDelta)} Hz &middot; High
							{highDelta >= 0 ? '+' : ''}{Math.round(highDelta)} Hz &middot; Range
							{semitones - baseline.semitones >= 0 ? '+' : ''}{(
								semitones - baseline.semitones
							).toFixed(1)}
							semitones
						</p>
					</div>
				{:else}
					<p class="text-sm text-surface-500 text-center">
						This is your first {MODE_META[mode].label.toLowerCase()} test — it becomes the baseline everything
						later compares against.
					</p>
				{/if}

				{#if !saved}
					<div class="space-y-2">
						<label for="range-notes" class="block text-sm font-medium text-surface-300">
							Notes (optional)
						</label>
						<textarea
							id="range-notes"
							bind:value={notes}
							rows={2}
							placeholder="Warmed up first? Tired? Anything worth remembering when you compare later."
							class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
						></textarea>
					</div>
				{/if}

				{#if saveError}
					<div
						class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm"
					>
						{saveError}
					</div>
				{/if}

				<div class="flex flex-wrap gap-3">
					{#if saved}
						<p class="flex-1 text-emerald-400 text-sm self-center">Saved ✨</p>
					{:else}
						<button
							onclick={save}
							disabled={isSaving}
							class="flex-1 min-w-[140px] px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 text-white font-medium rounded-lg transition-colors"
						>
							{isSaving ? 'Saving…' : 'Save result'}
						</button>
					{/if}
					<button
						onclick={restart}
						class="px-4 py-2.5 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-lg border border-surface-700 transition-colors"
					>
						{saved ? 'Test again' : 'Discard and retry'}
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- History -->
	<div class="bg-surface-900 border border-surface-800 rounded-2xl p-6">
		<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-surface-100">History</h2>
			{#if data.history.length > 0}
				<div class="flex gap-1.5">
					{#each ['all', 'modal', 'full'] as const as filter}
						<button
							type="button"
							onclick={() => (historyFilter = filter)}
							class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors {historyFilter ===
							filter
								? 'bg-primary-500 text-white'
								: 'bg-surface-800 text-surface-400 hover:text-surface-200'}"
						>
							{filter === 'all' ? 'All' : MODE_META[filter].short}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if relabelError}
			<div
				class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2 rounded-lg text-sm mb-4"
			>
				{relabelError}
			</div>
		{/if}

		{#if data.history.length === 0}
			<p class="text-surface-500 text-sm">
				No range tests yet. Take one now and it becomes your baseline.
			</p>
		{:else if visibleHistory.length === 0}
			<p class="text-surface-500 text-sm">
				No {MODE_META[historyFilter as RangeTestMode].label.toLowerCase()} tests yet.
			</p>
		{:else}
			<div class="space-y-3">
				{#each visibleHistory as test (test._id)}
					<div class="flex items-center gap-3">
						<span class="w-24 shrink-0 text-xs text-surface-500">{formatDate(test.createdAt)}</span>
						<button
							type="button"
							onclick={() => relabel(test)}
							title="Click to relabel as {test.mode === 'modal' ? 'Full range' : 'Speaking range'}"
							class="w-20 shrink-0 flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
						>
							<span class="w-2 h-2 rounded-full shrink-0 {MODE_META[test.mode].dot}"></span>
							{MODE_META[test.mode].short}
						</button>
						<div class="relative flex-1 h-6 bg-surface-950 rounded-full overflow-hidden">
							<div
								class="absolute top-1 bottom-1 rounded-full {MODE_META[test.mode].bar}"
								style={barStyle(test)}
							></div>
						</div>
						<span class="w-40 shrink-0 text-right text-xs text-surface-400 tabular-nums">
							{Math.round(test.lowHz)}–{Math.round(test.highHz)} Hz
							<span class="text-surface-600">·</span>
							{test.semitones.toFixed(1)} st
						</span>
					</div>
				{/each}
			</div>
			<p class="text-xs text-surface-500 mt-4">
				Bars are drawn on a shared {Math.round(scale.min)}–{Math.round(scale.max)} Hz scale. Click a mode
				label to relabel a test.
			</p>
		{/if}
	</div>
</div>
