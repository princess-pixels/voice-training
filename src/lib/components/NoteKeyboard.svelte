<script lang="ts">
	import { TonePlayer } from '$lib/audio/tone';
	import { centsOff, keysForRange, ON_PITCH_CENTS, type NoteKey } from '$lib/audio/notes';
	import type { PitchRange } from '$lib/types';

	interface Props {
		/** Notes are laid out around this range; the ones inside it are highlighted. */
		targetRange: PitchRange;
		/** The live detected pitch, for the cents readout. 0 when silent. */
		currentHz?: number;
		/**
		 * The chosen note's frequency, or null when none is chosen. Bind to it to
		 * draw the note on the pitch graph.
		 */
		referenceHz?: number | null;
	}

	let { targetRange, currentHz = 0, referenceHz = $bindable(null) }: Props = $props();

	const BLIP_MS = 2000;

	let sustain = $state(false);
	let playing = $state(false);
	let selected = $state<NoteKey | null>(null);
	let strip: HTMLDivElement | undefined = $state();

	const keys = $derived(keysForRange(targetRange));

	// Keep the selection on a real key when the range changes under it, and
	// publish the reference frequency for the graph.
	$effect(() => {
		if (selected && !keys.some((k) => k.midi === selected!.midi)) selected = null;
		referenceHz = selected?.hz ?? null;
	});

	const cents = $derived(selected && currentHz > 0 ? centsOff(currentHz, selected.hz) : null);
	const onPitch = $derived(cents !== null && Math.abs(cents) <= ON_PITCH_CENTS);

	// One player for the component's life; closing the context releases the
	// audio hardware when the studio unmounts.
	const player = new TonePlayer({ onChange: (p) => (playing = p) });
	$effect(() => () => player.destroy());

	function play(key: NoteKey) {
		selected = key;
		void player.play(key.hz, sustain ? null : BLIP_MS);
	}

	function toggle(key: NoteKey) {
		if (sustain && playing && selected?.midi === key.midi) player.stop();
		else play(key);
	}

	function clear() {
		player.stop();
		selected = null;
	}

	function setSustain(on: boolean) {
		sustain = on;
		if (!on && playing) player.stop();
	}

	/** Arrow keys step a semitone and play it; the focused key follows along. */
	function onKeydown(event: KeyboardEvent) {
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		if (keys.length === 0) return;
		event.preventDefault();
		const index = selected ? keys.findIndex((k) => k.midi === selected!.midi) : -1;
		const step = event.key === 'ArrowRight' ? 1 : -1;
		const next =
			index === -1
				? keys.findIndex((k) => k.inRange)
				: Math.min(keys.length - 1, Math.max(0, index + step));
		const key = keys[next === -1 ? 0 : next];
		play(key);
		strip?.querySelector<HTMLButtonElement>(`[data-midi="${key.midi}"]`)?.focus();
	}

	function keyClass(key: NoteKey): string {
		const active = selected?.midi === key.midi;
		if (active && playing)
			return 'bg-accent-500 text-white border-accent-400 shadow-lg shadow-accent-500/40';
		if (active) return 'bg-accent-500/30 text-accent-200 border-accent-400/70';
		if (key.inRange)
			return 'bg-primary-500/15 text-primary-200 border-primary-500/40 hover:bg-primary-500/30';
		return 'bg-surface-800/60 text-surface-400 border-surface-700 hover:bg-surface-700/70';
	}

	function formatCents(value: number): string {
		const rounded = Math.round(value);
		return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}¢`;
	}
</script>

<div class="bg-surface-900/50 border border-surface-800 rounded-lg p-4 space-y-3">
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
		<div class="flex-1 min-w-40">
			<h3 class="text-sm font-semibold text-surface-200">Reference notes</h3>
			<p class="text-xs text-surface-500">Tap a note, then hum it. Arrow keys step a semitone.</p>
		</div>

		<!-- Match readout -->
		<div class="min-w-30 text-right" aria-live="polite">
			{#if selected}
				<div class="text-xs text-surface-400">
					{selected.name} · {Math.round(selected.hz)} Hz
				</div>
				{#if cents !== null}
					<div
						class="text-lg font-bold tabular-nums {onPitch
							? 'text-emerald-400'
							: 'text-surface-200'}"
					>
						{#if onPitch}
							On it ✨
						{:else}
							{formatCents(cents)}
							<span class="text-xs font-medium text-surface-400">
								{cents > 0 ? 'sharp' : 'flat'}
							</span>
						{/if}
					</div>
				{:else}
					<div class="text-sm text-surface-500">hum to compare</div>
				{/if}
			{:else}
				<div class="text-sm text-surface-500">no note chosen</div>
			{/if}
		</div>
	</div>

	<!-- Keys -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		bind:this={strip}
		role="group"
		aria-label="Reference notes"
		class="flex flex-wrap gap-1.5"
		onkeydown={onKeydown}
	>
		{#each keys as key (key.midi)}
			<button
				type="button"
				data-midi={key.midi}
				onclick={() => toggle(key)}
				aria-pressed={selected?.midi === key.midi}
				title="{key.name} · {Math.round(key.hz)} Hz{key.inRange ? '' : ' (outside target range)'}"
				class="min-w-13 px-2 py-1.5 rounded-full border text-center transition-colors {keyClass(
					key
				)}"
			>
				<span class="block text-sm font-semibold leading-tight {key.sharp ? 'opacity-80' : ''}">
					{key.name}
				</span>
				<span class="block text-[10px] leading-tight opacity-70 tabular-nums">
					{Math.round(key.hz)}
				</span>
			</button>
		{/each}
	</div>

	<!-- Options -->
	<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
		<label class="inline-flex items-center gap-2 text-surface-300 cursor-pointer select-none">
			<input
				type="checkbox"
				checked={sustain}
				onchange={(e) => setSustain(e.currentTarget.checked)}
				class="accent-accent-500"
			/>
			Sustain until tapped again
		</label>
		{#if sustain}
			<span class="text-surface-500">Headphones recommended, or the tone ends up in the take.</span>
		{/if}
		{#if selected}
			<button
				type="button"
				onclick={clear}
				class="ml-auto text-surface-400 hover:text-surface-200 underline underline-offset-2"
			>
				Clear note
			</button>
		{/if}
	</div>
</div>
