<script lang="ts">
	import type { PageData } from './$types';
	import type { PitchRange } from '$lib/types';
	import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';

	let { data }: { data: PageData } = $props();

	// Target pitch range state - initialize from server data
	// Using untrack to suppress the warning about capturing initial value
	import { untrack } from 'svelte';
	let lowHz = $state(untrack(() => data.settings.targetRange.low));
	let highHz = $state(untrack(() => data.settings.targetRange.high));

	// Microphone state
	let audioDevices = $state<MediaDeviceInfo[]>([]);
	let selectedDeviceId = $state<string>('');
	let isTestingMic = $state(false);
	let micLevel = $state(0);
	let micError = $state<string | null>(null);
	let micPermissionGranted = $state(false);

	// Save state
	let saveStatus = $state<'idle' | 'saving' | 'success' | 'error'>('idle');
	let saveError = $state<string | null>(null);

	// Presets
	const PRESETS = {
		feminine: { label: 'Feminine', ...DEFAULT_TARGET_RANGE },
		androgynous: { label: 'Androgynous', low: 150, high: 220 },
		custom: { label: 'Custom', low: null, high: null }
	} as const;

	const activePreset = $derived.by(() => {
		if (lowHz === PRESETS.feminine.low && highHz === PRESETS.feminine.high) return 'feminine';
		if (lowHz === PRESETS.androgynous.low && highHz === PRESETS.androgynous.high)
			return 'androgynous';
		return 'custom';
	});

	// Frequency bar segments (for visual scale)
	const MIN_FREQ = 80;
	const MAX_FREQ = 400;
	const SEGMENTS = 32;

	// List devices on mount without prompting for the mic. Until permission has
	// been granted (here, or earlier in the studio) the browser returns devices
	// with empty labels; Test Microphone asks for permission and refreshes them.
	$effect(() => {
		enumerateDevices();
	});

	async function enumerateDevices(requestPermission = false) {
		try {
			if (requestPermission) {
				const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				stream.getTracks().forEach((track) => track.stop());
			}

			const devices = await navigator.mediaDevices.enumerateDevices();
			audioDevices = devices.filter((d) => d.kind === 'audioinput');
			// Labels are only populated once permission exists.
			micPermissionGranted = audioDevices.some((d) => d.label !== '');
			micError = null;

			if (audioDevices.length > 0 && !selectedDeviceId) {
				selectedDeviceId = audioDevices[0].deviceId;
			}
		} catch (err) {
			micPermissionGranted = false;
			micError = 'Microphone permission denied. Please allow access to select devices.';
		}
	}

	function applyPreset(preset: keyof typeof PRESETS) {
		if (preset === 'feminine') {
			lowHz = PRESETS.feminine.low;
			highHz = PRESETS.feminine.high;
		} else if (preset === 'androgynous') {
			lowHz = PRESETS.androgynous.low;
			highHz = PRESETS.androgynous.high;
		}
	}

	function getSegmentStyle(index: number): string {
		const segmentFreq = MIN_FREQ + (index / (SEGMENTS - 1)) * (MAX_FREQ - MIN_FREQ);
		const isInRange = segmentFreq >= lowHz && segmentFreq <= highHz;
		const opacity = isInRange ? 1 : 0.2;
		const color = isInRange ? 'var(--color-primary-500)' : 'var(--color-surface-600)';
		return `background-color: ${color}; opacity: ${opacity};`;
	}

	async function testMicrophone() {
		if (isTestingMic) return;

		isTestingMic = true;
		micLevel = 0;
		micError = null;

		try {
			const constraints: MediaStreamConstraints = {
				audio: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : true
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			if (!micPermissionGranted) {
				// First grant: refresh the list so the device names fill in.
				await enumerateDevices();
			}
			const audioContext = new AudioContext();
			const source = audioContext.createMediaStreamSource(stream);
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			source.connect(analyser);

			const dataArray = new Uint8Array(analyser.frequencyBinCount);

			// Monitor for 3 seconds
			const startTime = Date.now();
			const duration = 3000;

			const updateLevel = () => {
				if (Date.now() - startTime > duration) {
					stream.getTracks().forEach((track) => track.stop());
					audioContext.close();
					isTestingMic = false;
					micLevel = 0;
					return;
				}

				analyser.getByteFrequencyData(dataArray);
				const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
				micLevel = Math.min(100, (average / 128) * 100);
				requestAnimationFrame(updateLevel);
			};

			updateLevel();
		} catch (err) {
			isTestingMic = false;
			micError = err instanceof Error ? err.message : 'Failed to test microphone';
		}
	}

	async function saveSettings() {
		saveStatus = 'saving';
		saveError = null;

		try {
			const targetRange: PitchRange = {
				low: Math.min(lowHz, highHz),
				high: Math.max(lowHz, highHz)
			};

			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ targetRange })
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
				throw new Error(errorData.message || `HTTP ${response.status}`);
			}

			saveStatus = 'success';
			setTimeout(() => {
				saveStatus = 'idle';
			}, 2000);
		} catch (err) {
			saveStatus = 'error';
			saveError = err instanceof Error ? err.message : 'Failed to save settings';
		}
	}
</script>

<div class="max-w-2xl mx-auto px-4 py-8">
	<h1
		class="text-3xl font-bold mb-8 bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent"
	>
		Settings
	</h1>

	<!-- Target Pitch Range Section -->
	<section class="bg-surface-900 rounded-2xl p-6 mb-6 border border-surface-800">
		<h2 class="text-xl font-semibold mb-6 text-surface-100">Target Pitch Range</h2>

		<!-- Preset Buttons -->
		<div class="flex flex-wrap gap-3 mb-8">
			{#each Object.entries(PRESETS) as [key, preset]}
				<button
					onclick={() => applyPreset(key as keyof typeof PRESETS)}
					class="px-4 py-2 rounded-lg font-medium transition-all duration-200 {activePreset === key
						? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
						: 'bg-surface-800 text-surface-300 hover:bg-surface-700 hover:text-surface-100'}"
					disabled={key === 'custom'}
				>
					{preset.label}
					{#if key !== 'custom'}
						<span class="text-xs opacity-75 ml-1">({preset.low}-{preset.high} Hz)</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Visual Frequency Bar -->
		<div class="mb-8">
			<div class="flex gap-1 h-12 rounded-lg overflow-hidden mb-3">
				{#each Array(SEGMENTS) as _, i}
					<div
						class="flex-1 rounded-sm transition-all duration-150"
						style={getSegmentStyle(i)}
					></div>
				{/each}
			</div>
			<div class="flex justify-between text-xs text-surface-500">
				<span>{MIN_FREQ} Hz</span>
				<span>{Math.round((MIN_FREQ + MAX_FREQ) / 2)} Hz</span>
				<span>{MAX_FREQ} Hz</span>
			</div>
		</div>

		<!-- Range Sliders -->
		<div class="space-y-6">
			<!-- Low Hz Slider -->
			<div>
				<div class="flex justify-between items-center mb-2">
					<label for="low-hz" class="text-sm font-medium text-surface-300">Low Frequency</label>
					<span class="text-lg font-semibold text-primary-400">{lowHz} Hz</span>
				</div>
				<input
					id="low-hz"
					type="range"
					min={MIN_FREQ}
					max={MAX_FREQ}
					bind:value={lowHz}
					class="w-full h-2 bg-surface-800 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:accent-primary-400 transition-all"
				/>
			</div>

			<!-- High Hz Slider -->
			<div>
				<div class="flex justify-between items-center mb-2">
					<label for="high-hz" class="text-sm font-medium text-surface-300">High Frequency</label>
					<span class="text-lg font-semibold text-primary-400">{highHz} Hz</span>
				</div>
				<input
					id="high-hz"
					type="range"
					min={MIN_FREQ}
					max={MAX_FREQ}
					bind:value={highHz}
					class="w-full h-2 bg-surface-800 rounded-lg appearance-none cursor-pointer accent-primary-500 hover:accent-primary-400 transition-all"
				/>
			</div>
		</div>

		<!-- Current Range Display -->
		<div class="mt-6 p-4 bg-surface-950/50 rounded-xl border border-surface-800">
			<div class="flex items-center justify-between">
				<span class="text-surface-400">Current Range</span>
				<span class="text-2xl font-bold text-surface-100">
					{Math.min(lowHz, highHz)} - {Math.max(lowHz, highHz)} Hz
				</span>
			</div>
		</div>
	</section>

	<!-- Microphone Section -->
	<section class="bg-surface-900 rounded-2xl p-6 mb-6 border border-surface-800">
		<h2 class="text-xl font-semibold mb-6 text-surface-100">Microphone</h2>

		<!-- Device Selection -->
		<div class="mb-6">
			<label for="mic-device" class="block text-sm font-medium text-surface-300 mb-2">
				Input Device
			</label>
			{#if audioDevices.length > 0}
				<select
					id="mic-device"
					bind:value={selectedDeviceId}
					class="w-full px-4 py-3 bg-surface-950 border border-surface-800 rounded-xl text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
				>
					{#each audioDevices as device}
						<option value={device.deviceId}>
							{device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
						</option>
					{/each}
				</select>
				{#if !micPermissionGranted}
					<p class="mt-2 text-xs text-surface-400">
						Device names appear after microphone access is granted. Test Microphone asks for it.
					</p>
				{/if}
			{:else if micError}
				<div class="p-4 bg-red-950/30 border border-red-900/50 rounded-xl">
					<p class="text-red-400 text-sm">{micError}</p>
					<button
						onclick={() => enumerateDevices(true)}
						class="mt-2 text-sm text-red-400 hover:text-red-300 underline"
					>
						Try Again
					</button>
				</div>
			{:else}
				<div class="p-4 bg-surface-950 border border-surface-800 rounded-xl">
					<p class="text-surface-500 text-sm">Loading devices...</p>
				</div>
			{/if}
		</div>

		<!-- Test Microphone -->
		<div>
			<button
				onclick={testMicrophone}
				disabled={isTestingMic}
				class="w-full sm:w-auto px-6 py-3 bg-accent-600 hover:bg-accent-500 disabled:bg-surface-800 disabled:text-surface-600 text-white font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
			>
				{#if isTestingMic}
					<svg
						class="animate-spin h-5 w-5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>Testing...</span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>Test Microphone</span>
				{/if}
			</button>

			<!-- Level Meter -->
			{#if isTestingMic || micLevel > 0}
				<div class="mt-4">
					<div class="flex items-center gap-3">
						<span class="text-sm text-surface-400 w-12">Level</span>
						<div
							class="flex-1 h-4 bg-surface-950 rounded-full overflow-hidden border border-surface-800"
						>
							<div
								class="h-full bg-gradient-to-r from-primary-500 to-accent-500 transition-all duration-75"
								style="width: {micLevel}%"
							></div>
						</div>
						<span class="text-sm text-surface-400 w-12 text-right">{Math.round(micLevel)}%</span>
					</div>
				</div>
			{/if}

			{#if micError && isTestingMic === false}
				<p class="mt-3 text-sm text-red-400">{micError}</p>
			{/if}
		</div>
	</section>

	<!-- Export Section -->
	<div class="bg-surface-900 rounded-2xl p-6 sm:p-8 border border-surface-800 mb-8">
		<h2 class="text-xl font-semibold mb-2 text-surface-100">Export</h2>
		<p class="text-sm text-surface-400 mb-6">
			Download every session, recording, range test and these settings as one archive. Your data
			should not live only in this app's database; keep a copy somewhere else now and then. Large
			libraries take a moment to pack before the download starts.
		</p>
		<a
			href="/api/export"
			download
			class="inline-flex items-center gap-2 px-6 py-3 bg-surface-800 hover:bg-surface-700 text-surface-100 font-medium rounded-xl border border-surface-700 transition-colors"
		>
			<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4"
				/>
			</svg>
			Download everything (.tar.gz)
		</a>
	</div>

	<!-- Save Section -->
	<section class="bg-surface-900 rounded-2xl p-6 border border-surface-800">
		<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
			<div>
				<h2 class="text-xl font-semibold text-surface-100">Save Changes</h2>
				{#if saveStatus === 'success'}
					<p class="text-sm text-green-400 mt-1">Settings saved successfully!</p>
				{:else if saveStatus === 'error'}
					<p class="text-sm text-red-400 mt-1">{saveError || 'Failed to save settings'}</p>
				{:else}
					<p class="text-sm text-surface-400 mt-1">Update your voice training preferences</p>
				{/if}
			</div>
			<button
				onclick={saveSettings}
				disabled={saveStatus === 'saving'}
				class="px-8 py-3 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-800 disabled:text-surface-600 text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg shadow-primary-600/20"
			>
				{#if saveStatus === 'saving'}
					<svg
						class="animate-spin h-5 w-5"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					<span>Saving...</span>
				{:else if saveStatus === 'success'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>Saved!</span>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						viewBox="0 0 20 20"
						fill="currentColor"
					>
						<path
							fill-rule="evenodd"
							d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>Save Settings</span>
				{/if}
			</button>
		</div>
	</section>
</div>
