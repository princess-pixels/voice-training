<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import RecordingStudio from '$lib/components/RecordingStudio.svelte';
	import { categoryLabel, categoryBadgeClass } from '$lib/categories';
	import { formatDuration, formatHz } from '$lib/audio/utils';
	import { dayKeysEndingAt, localDayKey } from '$lib/days';
	import type { PracticeDay, PracticeStepStatus, Session } from '$lib/types';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// The day is the source of truth; every action round-trips through the API
	// and replaces it, so a reload or another device sees the same progress.
	// Writable derived: assignments below override it until the loader hands
	// over a different document (the midnight rollover), which wins again.
	let day = $derived<PracticeDay | null>(data.day);
	let saveError = $state<string | null>(null);

	const steps = $derived(day?.steps ?? []);
	const exerciseFor = (exerciseId: string) => data.exercises[exerciseId];

	function firstPending(d: PracticeDay | null): number {
		const i = d?.steps.findIndex((s) => s.status === 'pending') ?? -1;
		return i === -1 ? Math.max(0, (d?.steps.length ?? 1) - 1) : i;
	}

	// Same shape: follows the loaded day until the user moves, then the move wins.
	let currentIndex = $derived(firstPending(data.day));
	/** The take just saved on the current step, shown inline until the step changes. */
	let lastSaved = $state<Session | null>(null);
	/** Bound to the studio: a take is in progress or waiting to be saved. */
	let recording = $state(false);

	const currentStep = $derived(steps[currentIndex]);
	const currentExercise = $derived(currentStep ? exerciseFor(currentStep.exerciseId) : undefined);
	const isLastStep = $derived(currentIndex === steps.length - 1);
	const allDone = $derived(day !== null && day.completedAt !== null);
	const doneCount = $derived(steps.filter((s) => s.status === 'done').length);
	const totalSeconds = $derived(steps.reduce((sum, s) => sum + s.seconds, 0));
	const totalMinutes = $derived(
		steps.reduce((sum, s) => sum + (exerciseFor(s.exerciseId)?.estimatedMinutes ?? 0), 0)
	);
	const targetSeconds = $derived((currentExercise?.estimatedMinutes ?? 0) * 60);

	// Time on a step is simply how long the page has been visible on it. No button
	// to remember. Anchored to the wall clock so a throttled tab stays accurate,
	// paused while the tab is hidden, and one continuous stretch is capped so a
	// page left open on a visible screen does not log an afternoon.
	const MAX_STRETCH_SECONDS = 30 * 60;
	let enteredAt = $state<number | null>(null);
	let banked = $state(0);
	let elapsed = $state(0);
	const progressPct = $derived(
		targetSeconds > 0 ? Math.min(100, (elapsed / targetSeconds) * 100) : 0
	);

	$effect(() => {
		if (enteredAt === null) return;
		const start = enteredAt;
		const tick = () => {
			// A page left open across midnight rolls over on its own.
			if (isStale() && !recording) {
				void rollOver();
				return;
			}
			const stretch = Math.min(MAX_STRETCH_SECONDS, Math.floor((Date.now() - start) / 1000));
			elapsed = banked + stretch;
		};
		tick();
		const id = setInterval(tick, 500);
		return () => clearInterval(id);
	});

	// Start the clock on mount, and keep it in step with tab visibility.
	$effect(() => {
		if (document.visibilityState === 'visible') enteredAt = Date.now();
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				const seconds = drain(false);
				if (seconds > 0) void patchStep(currentIndex, { addSeconds: seconds }, true);
			} else if (isStale() && !recording) {
				// Back after midnight: this page still points at yesterday's document.
				void rollOver();
			} else {
				enteredAt = Date.now();
			}
		};
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	/** Take the seconds on the clock and restart it (or stop it when leaving). */
	function drain(restart = true): number {
		const seconds = elapsed;
		banked = 0;
		elapsed = 0;
		enteredAt = restart && document.visibilityState === 'visible' ? Date.now() : null;
		return seconds;
	}

	/**
	 * Today's key on the server's calendar, which is what the day document is
	 * keyed on. A hosted install in another time zone than the phone would
	 * otherwise think midnight came hours early (or late).
	 */
	function serverToday(): string {
		const skewMs = (data.serverOffsetMinutes - new Date().getTimezoneOffset()) * 60_000;
		return localDayKey(new Date(Date.now() - skewMs));
	}

	/** The server's calendar has moved past the day this page holds. */
	function isStale(): boolean {
		return day !== null && serverToday() !== day._id;
	}

	let rollingOver = false;
	let lastRollOver = 0;
	/** Bank what is on the clock against the old day, then load the new one. */
	async function rollOver() {
		// Once a minute at most: if the server disagrees about the date (a DST
		// edge, say), this must not turn into a reload loop.
		if (rollingOver || Date.now() - lastRollOver < 60_000) return;
		rollingOver = true;
		lastRollOver = Date.now();
		try {
			const seconds = drain(false);
			if (seconds > 0) await patchStep(currentIndex, { addSeconds: seconds });
			// Replaces data.day, so `day` and `currentIndex` follow it again.
			await invalidateAll();
			lastSaved = null;
		} finally {
			rollingOver = false;
			if (document.visibilityState === 'visible') enteredAt = Date.now();
		}
	}

	function revive(raw: PracticeDay): PracticeDay {
		// JSON turns the dates into strings; only completedAt's null-ness is read
		// here, but keep the type honest for anything that looks closer.
		return {
			...raw,
			startedAt: new Date(raw.startedAt),
			updatedAt: new Date(raw.updatedAt),
			completedAt: raw.completedAt ? new Date(raw.completedAt) : null,
			steps: raw.steps.map((s) => ({
				...s,
				completedAt: s.completedAt ? new Date(s.completedAt) : null
			}))
		};
	}

	async function patchStep(
		index: number,
		update: { status?: PracticeStepStatus; addSeconds?: number; sessionId?: string },
		keepalive = false
	) {
		if (!day) return;
		saveError = null;
		try {
			const response = await fetch(`/api/practice/${day._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ step: index, ...update }),
				keepalive
			});
			if (!response.ok) {
				const body = await response.json().catch(() => null);
				throw new Error(body?.message ?? `Save failed (${response.status})`);
			}
			// A keepalive PATCH from before a rollover can land after it; the reply
			// is yesterday's document and must not displace today's.
			const updated = revive(await response.json());
			if (day?._id === updated._id) day = updated;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Could not save progress';
		}
	}

	/** Bank the clock on the step being left, then move. */
	async function goToStep(index: number) {
		if (recording || index === currentIndex) return;
		const seconds = drain();
		if (seconds > 0) await patchStep(currentIndex, { addSeconds: seconds });
		currentIndex = index;
		lastSaved = null;
	}

	async function resolveStep(status: 'done' | 'skipped') {
		const from = currentIndex;
		const seconds = drain();
		await patchStep(from, { status, addSeconds: seconds });
		if (!isLastStep) {
			currentIndex = from + 1;
			lastSaved = null;
		}
	}

	async function reopenStep() {
		await patchStep(currentIndex, { status: 'pending' });
	}

	/** A take saved by the embedded studio: attach it, which marks the step done. */
	async function onSaved(session: Session) {
		lastSaved = session;
		await patchStep(currentIndex, { sessionId: session._id, addSeconds: drain() });
	}

	async function restartRoutine() {
		if (!day) return;
		saveError = null;
		try {
			const response = await fetch(`/api/practice/${day._id}?action=reset`, { method: 'POST' });
			if (!response.ok) throw new Error(`Reset failed (${response.status})`);
			day = revive(await response.json());
			currentIndex = 0;
			lastSaved = null;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Could not reset the routine';
		}
	}

	// Leaving with the clock running: bank the time first. keepalive lets the
	// request outlive the page.
	beforeNavigate(() => {
		const seconds = drain(false);
		if (seconds > 0) void patchStep(currentIndex, { addSeconds: seconds }, true);
	});

	const statusClass: Record<PracticeStepStatus, string> = {
		done: 'bg-emerald-500',
		skipped: 'bg-surface-600',
		pending: 'bg-surface-800 hover:bg-surface-700'
	};

	// History strip: the last two weeks ending on the current day, from the
	// day's own key so it matches the server's calendar, not the browser's.
	const historyByDay = $derived(new Map(data.history.map((h) => [h.day, h])));
	const historyKeys = $derived(day ? dayKeysEndingAt(day._id, 14) : []);
	const historyMinutes = $derived(
		data.history.reduce((sum, h) => sum + h.seconds, 0) > 0
			? Math.round(data.history.reduce((sum, h) => sum + h.seconds, 0) / 60)
			: 0
	);
	const practicedDays = $derived(data.history.filter((h) => h.doneSteps > 0).length);

	function historyClass(key: string): string {
		const h = historyByDay.get(key);
		if (!h || h.doneSteps === 0) return 'bg-surface-800';
		return h.complete ? 'bg-emerald-500' : 'bg-primary-500';
	}

	function historyTitle(key: string): string {
		const h = historyByDay.get(key);
		if (!h || h.doneSteps === 0) return `${key}: no practice`;
		return `${key}: ${h.doneSteps} of ${h.totalSteps} steps, ${formatDuration(h.seconds)}`;
	}
</script>

<svelte:head>
	<title>Today's Practice — Voice Training</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8 space-y-6">
	<div>
		<h1 class="text-3xl font-bold text-surface-100">Today's Practice</h1>
		<p class="text-surface-400 mt-2">
			{#if steps.length > 0}
				{steps.length} steps · about {totalMinutes} minutes. Just follow along.
			{:else}
				No exercises available yet.
			{/if}
		</p>
	</div>

	{#if saveError}
		<div class="bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm">
			{saveError}
		</div>
	{/if}

	{#if !day || steps.length === 0}
		<div class="bg-surface-900 border border-surface-800 rounded-2xl p-8 text-center">
			<p class="text-surface-400">
				The exercise library is empty, so there's no routine to build. Check the startup log for a
				seeding error and restart the app to seed it.
			</p>
		</div>
	{:else}
		<!-- Step rail -->
		<div class="flex gap-2">
			{#each steps as step, index (step.exerciseId)}
				<button
					type="button"
					onclick={() => goToStep(index)}
					disabled={recording}
					title="{step.title}{step.status === 'done'
						? ' (done)'
						: step.status === 'skipped'
							? ' (skipped)'
							: ''}"
					class="flex-1 h-1.5 rounded-full transition-colors disabled:cursor-not-allowed {index ===
						currentIndex && step.status === 'pending'
						? 'bg-primary-500'
						: statusClass[step.status]} {index === currentIndex
						? 'ring-2 ring-primary-500/40 ring-offset-2 ring-offset-surface-950'
						: ''}"
					aria-label="Go to step {index + 1}: {step.title}"
					aria-current={index === currentIndex ? 'step' : undefined}
				></button>
			{/each}
		</div>

		{#if allDone}
			<!-- Completion -->
			<div
				class="bg-surface-900 border border-emerald-500/30 rounded-2xl p-10 text-center space-y-5"
			>
				<div class="text-5xl">🌸</div>
				<h2 class="text-2xl font-semibold text-surface-100">Routine complete</h2>
				<p class="text-surface-400 max-w-md mx-auto">
					{doneCount} of {steps.length} steps done{totalSeconds > 0
						? `, ${formatDuration(totalSeconds)} on the clock`
						: ''}. Showing up on a tired day counts exactly as much as showing up on a good one.
				</p>
				<ul class="text-sm text-left max-w-sm mx-auto space-y-1.5">
					{#each steps as step, index (step.exerciseId)}
						<li class="flex items-center gap-3 text-surface-300">
							<span
								class="w-5 text-center {step.status === 'done'
									? 'text-emerald-400'
									: 'text-surface-500'}"
							>
								{step.status === 'done' ? '✓' : '–'}
							</span>
							<button
								type="button"
								class="flex-1 text-left hover:text-surface-100 transition-colors"
								onclick={() => goToStep(index)}
							>
								{step.title}
							</button>
							{#if step.sessionIds.length > 0}
								<a
									href="/sessions/{step.sessionIds[step.sessionIds.length - 1]}"
									class="text-xs text-primary-400 hover:text-primary-300"
								>
									take
								</a>
							{/if}
							<span class="text-surface-500 tabular-nums">
								{step.seconds > 0 ? formatDuration(step.seconds) : ''}
							</span>
						</li>
					{/each}
				</ul>
				<div class="flex flex-wrap gap-3 justify-center pt-2">
					<a
						href="/range-test"
						class="px-5 py-2.5 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-lg border border-surface-700 transition-colors"
					>
						Take a range test
					</a>
					<button
						onclick={restartRoutine}
						class="px-5 py-2.5 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-lg border border-surface-700 transition-colors"
					>
						Run it again
					</button>
				</div>
			</div>
		{:else if currentStep}
			<!-- Current step -->
			<div class="bg-surface-900 border border-surface-800 rounded-2xl p-6 sm:p-8 space-y-6">
				<div>
					<p class="text-sm text-primary-400 font-medium mb-2">
						Step {currentIndex + 1} of {steps.length} · {currentStep.purpose}
					</p>
					<div class="flex flex-wrap items-center gap-3 mb-3">
						<h2 class="text-2xl font-semibold text-surface-100">{currentStep.title}</h2>
						<span
							class="px-2.5 py-1 rounded-full text-xs font-medium border {categoryBadgeClass(
								currentStep.category
							)}"
						>
							{categoryLabel(currentStep.category)}
						</span>
						{#if currentStep.status === 'done'}
							<span
								class="px-2.5 py-1 rounded-full text-xs font-medium border bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
							>
								Done
							</span>
						{:else if currentStep.status === 'skipped'}
							<span
								class="px-2.5 py-1 rounded-full text-xs font-medium border bg-surface-700 text-surface-300 border-surface-600"
							>
								Skipped
							</span>
						{/if}
					</div>
					{#if currentExercise}
						<p class="text-surface-400">{currentExercise.description}</p>
					{/if}
				</div>

				<!-- Instructions -->
				{#if currentExercise}
					<div class="bg-surface-950/60 border border-surface-800 rounded-xl p-5">
						<p class="text-surface-300 text-sm leading-relaxed whitespace-pre-line">
							{currentExercise.instructions}
						</p>
					</div>
				{:else}
					<div class="bg-surface-950/60 border border-surface-800 rounded-xl p-5">
						<p class="text-surface-500 text-sm">
							This exercise is no longer in the library. Tomorrow's routine will pick another.
						</p>
					</div>
				{/if}

				<!-- Time on this step -->
				<div class="space-y-2">
					<div class="flex items-baseline justify-between">
						<span class="text-2xl font-mono font-semibold text-surface-300 tabular-nums">
							{formatDuration(elapsed)}
						</span>
						<span class="text-sm text-surface-500">
							{#if currentExercise}
								suggested {currentExercise.estimatedMinutes} min
							{/if}
							{#if currentStep.seconds > 0}
								· {formatDuration(currentStep.seconds)} earlier today
							{/if}
						</span>
					</div>
					<div class="h-1.5 bg-surface-800 rounded-full overflow-hidden">
						<div
							class="h-full rounded-full transition-all duration-500 {progressPct >= 100
								? 'bg-emerald-500'
								: 'bg-primary-500'}"
							style="width: {progressPct}%"
						></div>
					</div>
				</div>

				<!-- Recorder: the graph and the take live here, no other page needed -->
				{#if currentExercise}
					{#key currentExercise._id}
						<RecordingStudio
							exercise={currentExercise}
							targetRange={data.settings.targetRange}
							embedded
							{onSaved}
							bind:busy={recording}
						/>
					{/key}
				{/if}

				{#if lastSaved}
					<div
						class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
					>
						<span class="text-emerald-400 font-medium">Take saved ✓</span>
						<span class="text-surface-300">
							avg <span class="font-semibold">{formatHz(lastSaved.pitchData.avgPitch)}</span>
						</span>
						<span class="text-surface-300">
							<span class="font-semibold">{Math.round(lastSaved.pitchData.timeInTargetPct)}%</span>
							in range
						</span>
						<span class="text-surface-300">{formatDuration(lastSaved.duration)}</span>
						<a href="/sessions/{lastSaved._id}" class="text-primary-400 hover:text-primary-300">
							open take
						</a>
					</div>
				{:else if currentStep.sessionIds.length > 0}
					<p class="text-sm text-surface-400">
						Recorded {currentStep.sessionIds.length === 1
							? 'once'
							: `${currentStep.sessionIds.length} times`} today ·
						<a
							href="/sessions/{currentStep.sessionIds[currentStep.sessionIds.length - 1]}"
							class="text-primary-400 hover:text-primary-300"
						>
							latest take
						</a>
					</p>
				{/if}

				<!-- Actions -->
				<div class="flex flex-wrap items-center gap-3 pt-4 border-t border-surface-800">
					{#if currentStep.status === 'pending'}
						<button
							onclick={() => resolveStep('done')}
							disabled={recording}
							title={recording ? 'Finish or discard the take first' : undefined}
							class="flex-1 min-w-[140px] px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-700 disabled:text-surface-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
						>
							{isLastStep ? 'Finish routine' : 'Done — next step'}
						</button>
						{#if !isLastStep}
							<button
								onclick={() => resolveStep('skipped')}
								disabled={recording}
								class="px-4 py-2.5 text-surface-500 hover:text-surface-300 disabled:cursor-not-allowed font-medium transition-colors"
							>
								Skip
							</button>
						{/if}
					{:else}
						{#if !isLastStep}
							<button
								onclick={() => goToStep(currentIndex + 1)}
								disabled={recording}
								class="flex-1 min-w-[140px] px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-700 disabled:text-surface-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
							>
								Next step
							</button>
						{:else}
							<button
								onclick={() => goToStep(firstPending(day))}
								disabled={recording}
								class="flex-1 min-w-[140px] px-4 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:bg-surface-700 disabled:text-surface-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
							>
								Back to an unfinished step
							</button>
						{/if}
						<button
							onclick={reopenStep}
							disabled={recording}
							class="px-4 py-2.5 text-surface-500 hover:text-surface-300 disabled:cursor-not-allowed font-medium transition-colors"
						>
							Mark as not done
						</button>
					{/if}
				</div>
			</div>
		{/if}

		<!-- History strip -->
		<div class="bg-surface-900/60 border border-surface-800 rounded-2xl p-5">
			<div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
				<h2 class="text-sm font-medium text-surface-300">Last two weeks</h2>
				<span class="text-xs text-surface-500">
					{practicedDays}
					{practicedDays === 1 ? 'day' : 'days'} practised{historyMinutes > 0
						? ` · ${historyMinutes} min`
						: ''}
				</span>
			</div>
			<div class="flex gap-1.5">
				{#each historyKeys as key (key)}
					<div
						class="flex-1 h-6 rounded-md {historyClass(key)} {key === day._id
							? 'ring-2 ring-primary-500/40 ring-offset-2 ring-offset-surface-950'
							: ''}"
						title={historyTitle(key)}
						role="img"
						aria-label={historyTitle(key)}
					></div>
				{/each}
			</div>
		</div>
	{/if}
</div>
