<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { PitchDetector } from '$lib/audio/pitchDetector';
	import { formatHz, noteFromHz, semitonesBetween, percentile } from '$lib/audio/utils';
	import { getMicrophoneStream } from '$lib/audio/mic';
	import { describeMicError } from '$lib/audio/micErrors';
	import { formatDate } from '$lib/format';
	import { errorMessage, request } from '$lib/api';
	import { m } from '$lib/paraglide/messages';
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
	// Roughly a second of sustained tone before a phase can be finished: the
	// detector hops every 25 ms, and only confident voiced frames count.
	const MIN_SAMPLES = 45;

	const MODE_META: Record<
		RangeTestMode,
		{
			label: string;
			short: string;
			blurb: string;
			bar: string;
			dot: string;
			highPrompt: string;
			start: string;
		}
	> = {
		modal: {
			label: m.range_test_mode_modal_label(),
			short: m.range_test_mode_modal_short(),
			blurb: m.range_test_mode_modal_blurb(),
			bar: 'bg-gradient-to-r from-accent-500 to-primary-500',
			dot: 'bg-primary-500',
			highPrompt: m.range_test_mode_modal_high_prompt(),
			start: m.range_test_start_modal()
		},
		full: {
			label: m.range_test_mode_full_label(),
			short: m.range_test_mode_full_short(),
			blurb: m.range_test_mode_full_blurb(),
			bar: 'bg-gradient-to-r from-sky-500 to-accent-500',
			dot: 'bg-sky-500',
			highPrompt: m.range_test_mode_full_high_prompt(),
			start: m.range_test_start_full()
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

	// Signed delta for the comparison line: "+5", "-3", "+0.2".
	function signed(value: number, digits = 0): string {
		const text = digits ? value.toFixed(digits) : String(Math.round(value));
		return value >= 0 ? `+${text}` : text;
	}

	async function start() {
		micError = null;
		saveError = null;
		saved = false;
		lowHz = 0;
		highHz = 0;
		samples = [];

		try {
			stream = await getMicrophoneStream();
		} catch (err) {
			micError = describeMicError(err);
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
			await request<void>('/api/range-tests', {
				method: 'POST',
				body: { mode, lowHz, highHz, notes }
			});

			// `data` is a plain prop object, so mutating data.history would not re-render.
			// Re-run the load instead; it is a single 30-document query.
			await invalidateAll();
			saved = true;
		} catch (err) {
			saveError = errorMessage(err, m.range_test_save_failed());
		} finally {
			isSaving = false;
		}
	}

	async function relabel(test: RangeTest) {
		const next: RangeTestMode = test.mode === 'modal' ? 'full' : 'modal';
		relabelError = null;
		try {
			await request<void>(`/api/range-tests?id=${test._id}`, {
				method: 'PATCH',
				body: { mode: next }
			});
			await invalidateAll();
		} catch (err) {
			relabelError = errorMessage(err, m.range_test_relabel_failed());
		}
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
	<title>{m.common_page_title({ page: m.range_test_title() })}</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8 space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-surface-100">{m.range_test_title()}</h1>
		<p class="text-surface-400 mt-2">
			{m.range_test_intro()}
		</p>
	</div>

	{#if micError}
		<div
			role="alert"
			class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg"
		>
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
						{m.range_test_mode_question()}
					</p>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						{#each ['modal', 'full'] as const as m_ (m_)}
							<button
								type="button"
								onclick={() => (mode = m_)}
								class="text-left p-4 rounded-xl border transition-all {mode === m_
									? 'bg-primary-500/10 border-primary-500/50'
									: 'bg-surface-950/50 border-surface-800 hover:border-surface-700'}"
							>
								<span
									class="block font-medium mb-1 {mode === m_
										? 'text-primary-300'
										: 'text-surface-200'}"
								>
									{MODE_META[m_].label}
								</span>
								<span class="block text-xs text-surface-400 leading-relaxed">
									{MODE_META[m_].blurb}
								</span>
							</button>
						{/each}
					</div>
					<p class="text-xs text-surface-500 mt-3 text-center">
						{m.range_test_mode_separate_note()}
					</p>
				</div>

				<div class="text-center space-y-5 pt-2 border-t border-surface-800">
					<p class="text-surface-300 max-w-lg mx-auto pt-4">
						{m.range_test_steps_ask_a()}
						<strong class="text-surface-100">{m.range_test_steps_lowest()}</strong>
						{m.range_test_steps_ask_b()}
						<strong class="text-surface-100">{m.range_test_steps_highest()}</strong
						>{m.range_test_steps_ask_c()}
					</p>
					<p class="text-surface-500 text-sm max-w-lg mx-auto">
						{m.range_test_warmup_note()}
					</p>
					<button
						onclick={start}
						class="px-8 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary-500/25"
					>
						{MODE_META[mode].start}
					</button>
				</div>
			</div>
		{:else if phase === 'low' || phase === 'high'}
			{@const isLow = phase === 'low'}
			<div class="text-center space-y-6">
				<div>
					<p class="text-sm uppercase tracking-wide text-surface-500 mb-2">
						{m.range_test_step({ label: MODE_META[mode].label, step: isLow ? '1' : '2' })}
					</p>
					<h2 class="text-2xl font-semibold text-surface-100">
						{isLow ? m.range_test_slide_down() : m.range_test_slide_up()}
					</h2>
					<p class="text-surface-400 mt-2 max-w-lg mx-auto">
						{isLow ? m.range_test_low_instructions() : MODE_META[mode].highPrompt}
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
						{enoughSamples ? m.range_test_progress_enough() : m.range_test_progress_keep()}
					</p>
				</div>

				<button
					onclick={isLow ? finishLowPhase : finishHighPhase}
					disabled={!enoughSamples}
					class="px-8 py-3 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-800 disabled:text-surface-400 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
				>
					{isLow ? m.range_test_next_highest() : m.range_test_finish()}
				</button>

				{#if isLow === false && lowHz > 0}
					<p class="text-sm text-surface-500">
						{m.range_test_lowest_recorded()}
						<span class="text-surface-300">{formatHz(lowHz)}</span> ({noteFromHz(lowHz)})
					</p>
				{/if}
			</div>
		{:else}
			<!-- Results -->
			<div class="space-y-6">
				<div class="text-center">
					<h2 class="text-2xl font-semibold text-surface-100">{m.range_test_result_heading()}</h2>
					<p class="text-sm text-surface-500 mt-1">{MODE_META[mode].label}</p>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<div class="bg-surface-950/50 border border-surface-800 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">{m.range_test_lowest()}</p>
						<p class="text-3xl font-bold text-surface-100">{formatHz(lowHz)}</p>
						<p class="text-sm text-surface-500 mt-1">{noteFromHz(lowHz)}</p>
					</div>
					<div class="bg-surface-950/50 border border-surface-800 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">{m.range_test_highest()}</p>
						<p class="text-3xl font-bold text-surface-100">{formatHz(highHz)}</p>
						<p class="text-sm text-surface-500 mt-1">{noteFromHz(highHz)}</p>
					</div>
					<div class="bg-surface-950/50 border border-primary-500/30 rounded-xl p-5 text-center">
						<p class="text-surface-500 text-sm mb-1">{m.range_test_range()}</p>
						<p class="text-3xl font-bold text-primary-400">{semitones.toFixed(1)}</p>
						<p class="text-sm text-surface-500 mt-1">{m.range_test_semitones()}</p>
					</div>
				</div>

				{#if baseline}
					{@const lowDelta = lowHz - baseline.lowHz}
					{@const highDelta = highHz - baseline.highHz}
					{@const rangeDelta = semitones - baseline.semitones}
					<div
						class="bg-surface-950/50 border border-surface-800 rounded-xl p-4 text-sm text-surface-400"
					>
						<p class="mb-1 text-surface-300 font-medium">
							{m.range_test_compared_with_last({
								label: MODE_META[mode].label.toLowerCase(),
								date: formatDate(baseline.createdAt)
							})}
						</p>
						<p>
							{m.range_test_delta({
								low: signed(lowDelta),
								high: signed(highDelta),
								rangeDelta: signed(rangeDelta, 1)
							})}
						</p>
					</div>
				{:else}
					<p class="text-sm text-surface-500 text-center">
						{m.range_test_first_test({ label: MODE_META[mode].label.toLowerCase() })}
					</p>
				{/if}

				{#if !saved}
					<div class="space-y-2">
						<label for="range-notes" class="block text-sm font-medium text-surface-300">
							{m.range_test_notes_label()}
						</label>
						<textarea
							id="range-notes"
							bind:value={notes}
							rows={2}
							placeholder={m.range_test_notes_placeholder()}
							class="w-full px-3 py-2 bg-surface-800 border border-surface-700 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
						></textarea>
					</div>
				{/if}

				{#if saveError}
					<div
						role="alert"
						class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm"
					>
						{saveError}
					</div>
				{/if}

				<div class="flex flex-wrap gap-3">
					{#if saved}
						<p role="status" class="flex-1 text-emerald-400 text-sm self-center">
							{m.range_test_saved()}
						</p>
					{:else}
						<button
							onclick={save}
							disabled={isSaving}
							class="flex-1 min-w-[140px] px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-primary-800 text-white font-medium rounded-lg transition-colors"
						>
							{isSaving ? m.range_test_saving() : m.range_test_save_result()}
						</button>
					{/if}
					<button
						onclick={restart}
						class="px-4 py-2.5 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-lg border border-surface-700 transition-colors"
					>
						{saved ? m.range_test_test_again() : m.range_test_discard_retry()}
					</button>
				</div>
			</div>
		{/if}
	</div>

	<!-- History -->
	<div class="bg-surface-900 border border-surface-800 rounded-2xl p-6">
		<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-surface-100">{m.range_test_history()}</h2>
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
							{filter === 'all' ? m.range_test_filter_all() : MODE_META[filter].short}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if relabelError}
			<div
				role="alert"
				class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-2 rounded-lg text-sm mb-4"
			>
				{relabelError}
			</div>
		{/if}

		{#if data.history.length === 0}
			<p class="text-surface-500 text-sm">
				{m.range_test_history_empty()}
			</p>
		{:else if visibleHistory.length === 0}
			<p class="text-surface-500 text-sm">
				{m.range_test_history_none({
					label: MODE_META[historyFilter as RangeTestMode].label.toLowerCase()
				})}
			</p>
		{:else}
			<div class="space-y-3">
				{#each visibleHistory as test (test._id)}
					<div class="flex items-center gap-3">
						<span class="w-24 shrink-0 text-xs text-surface-500">{formatDate(test.createdAt)}</span>
						<button
							type="button"
							onclick={() => relabel(test)}
							title={test.mode === 'modal'
								? m.range_test_relabel_as_full()
								: m.range_test_relabel_as_modal()}
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
				{m.range_test_scale_note({
					min: String(Math.round(scale.min)),
					max: String(Math.round(scale.max))
				})}
			</p>
		{/if}
	</div>
</div>
