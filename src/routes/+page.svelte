<script lang="ts">
	import PitchTrendChart from '$lib/components/PitchTrendChart.svelte';
	import {
		formatHz,
		formatDuration,
		getPitchCategory,
		getPitchCategoryColor
	} from '$lib/audio/utils';
	import { categoryLabel, categoryFillClass } from '$lib/categories';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const stats = $derived(data.stats);

	const hasSessions = $derived(stats.totalSessions > 0);

	// Calculate average pitch from recent sessions
	const recentAvgPitch = $derived.by(() => {
		if (stats.recentSessions.length === 0) return 0;
		const sum = stats.recentSessions.reduce((acc, s) => acc + s.pitchData.avgPitch, 0);
		return sum / stats.recentSessions.length;
	});

	// Format total practice time
	const formattedTotalTime = $derived.by(() => {
		const hours = Math.floor(stats.totalPracticeTime / 3600);
		const minutes = Math.floor((stats.totalPracticeTime % 3600) / 60);
		if (hours > 0) {
			return `${hours}h ${minutes}m`;
		}
		return `${minutes} min`;
	});

	function startOfLocalDay(d: Date): Date {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}

	// "Today" means the local calendar day, matching the streak logic, not the
	// last 24 hours. Math.round absorbs the hour a DST change adds or removes.
	function formatSessionDate(date: Date): string {
		const d = new Date(date);
		const now = new Date();
		const diffDays = Math.round(
			(startOfLocalDay(now).getTime() - startOfLocalDay(d).getTime()) / (1000 * 60 * 60 * 24)
		);

		if (diffDays === 0) return 'Today';
		if (diffDays === 1) return 'Yesterday';
		if (diffDays < 7) return `${diffDays} days ago`;
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// Get total category count for percentage calculation
	const totalCategoryCount = $derived.by(() => {
		return stats.categoryBreakdown.reduce((sum, c) => sum + c.count, 0);
	});

	// Opening the practice page creates the day; it has "started" once something happened on it.
	const today = $derived(
		stats.todayPractice && (stats.todayPractice.doneSteps > 0 || stats.todayPractice.seconds > 0)
			? stats.todayPractice
			: null
	);
	const todayMinutes = $derived(today ? Math.round(today.seconds / 60) : 0);
</script>

<svelte:head>
	<title>Dashboard — Voice Training</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<!-- Welcome Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-surface-100">Voice Training</h1>
		<p class="text-surface-400 mt-2">Your journey to finding your voice</p>
	</div>

	<!-- Today's practice -->
	<a
		href="/practice"
		class="flex flex-wrap items-center gap-4 mb-8 p-5 rounded-2xl border transition-colors {today?.complete
			? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50'
			: 'bg-surface-900 border-surface-800 hover:border-primary-500/40'}"
	>
		<span class="text-3xl">{today?.complete ? '🌸' : '🎤'}</span>
		<div class="flex-1 min-w-[200px]">
			<p class="font-semibold text-surface-100">
				{#if !today}
					Today's practice hasn't started
				{:else if today.complete}
					Today's practice is done
				{:else}
					Today's practice is under way
				{/if}
			</p>
			<p class="text-sm text-surface-400 mt-0.5">
				{#if !today}
					Four short steps, about fifteen minutes. The app remembers where you were.
				{:else}
					{today.doneSteps} of {today.totalSteps} steps done{todayMinutes > 0
						? ` · ${todayMinutes} min`
						: ''}
				{/if}
			</p>
		</div>
		{#if today && today.totalSteps > 0}
			<div class="flex gap-1.5 w-32" aria-hidden="true">
				{#each { length: today.totalSteps } as _, i}
					<div
						class="flex-1 h-1.5 rounded-full {i < today.doneSteps
							? 'bg-emerald-500'
							: 'bg-surface-700'}"
					></div>
				{/each}
			</div>
		{/if}
		<span
			class="px-4 py-2 rounded-lg text-sm font-medium {today?.complete
				? 'bg-surface-800 text-surface-200'
				: 'bg-primary-500 text-white'}"
		>
			{!today ? 'Start' : today.complete ? 'Have a look' : 'Continue'}
		</span>
	</a>

	{#if !hasSessions}
		<!-- Empty State -->
		<div class="bg-surface-900 border border-surface-800 rounded-2xl p-12 text-center">
			<div
				class="w-20 h-20 mx-auto mb-6 rounded-full bg-primary-500/10 flex items-center justify-center"
			>
				<svg
					class="w-10 h-10 text-primary-400"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
					/>
				</svg>
			</div>
			<h2 class="text-2xl font-semibold text-surface-100 mb-3">Welcome to Voice Training</h2>
			<p class="text-surface-400 max-w-md mx-auto mb-8">
				Get started by recording your first session! Track your pitch, monitor your progress, and
				discover exercises tailored to your goals.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a
					href="/practice"
					class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40"
				>
					<span class="text-lg">🌸</span>
					Start Today's Practice
				</a>
				<a
					href="/exercises"
					class="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-xl border border-surface-700 transition-all duration-200"
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
						/>
					</svg>
					Browse Exercises
				</a>
			</div>
		</div>
	{:else}
		<!-- Stats Cards Row -->
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
			<!-- Total Sessions -->
			<div class="bg-surface-900 rounded-xl border border-surface-800 p-5 relative overflow-hidden">
				<div class="absolute top-0 left-0 w-1 h-full bg-primary-500"></div>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-surface-500 text-sm font-medium mb-1">Total Sessions</p>
						<p class="text-3xl font-bold text-surface-100">{stats.totalSessions}</p>
					</div>
					<div class="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
						<svg
							class="w-5 h-5 text-primary-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
							/>
						</svg>
					</div>
				</div>
			</div>

			<!-- Practice Streak -->
			<div class="bg-surface-900 rounded-xl border border-surface-800 p-5 relative overflow-hidden">
				<div class="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-surface-500 text-sm font-medium mb-1">Practice Streak</p>
						<p class="text-3xl font-bold text-surface-100">
							{stats.practiceStreak} <span class="text-lg font-normal text-surface-400">days</span>
						</p>
					</div>
					<div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
						<svg
							class="w-5 h-5 text-amber-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"
							/>
						</svg>
					</div>
				</div>
			</div>

			<!-- Total Practice Time -->
			<div class="bg-surface-900 rounded-xl border border-surface-800 p-5 relative overflow-hidden">
				<div class="absolute top-0 left-0 w-1 h-full bg-accent-500"></div>
				<div class="flex items-start justify-between">
					<div>
						<p class="text-surface-500 text-sm font-medium mb-1">Total Practice Time</p>
						<p class="text-3xl font-bold text-surface-100">{formattedTotalTime}</p>
					</div>
					<div class="w-10 h-10 rounded-lg bg-accent-500/10 flex items-center justify-center">
						<svg
							class="w-5 h-5 text-accent-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
				</div>
			</div>

			<!-- Avg Pitch -->
			{#if true}
				{@const avgPitch = recentAvgPitch}
				{@const pitchCategory = getPitchCategory(avgPitch)}
				{@const pitchColor = getPitchCategoryColor(pitchCategory)}
				<div
					class="bg-surface-900 rounded-xl border border-surface-800 p-5 relative overflow-hidden"
				>
					<div
						class="absolute top-0 left-0 w-1 h-full"
						style="background-color: {pitchColor}"
					></div>
					<div class="flex items-start justify-between">
						<div>
							<p class="text-surface-500 text-sm font-medium mb-1">Avg Pitch (Recent)</p>
							<p class="text-3xl font-bold text-surface-100">{formatHz(avgPitch)}</p>
							<p class="text-xs mt-1" style="color: {pitchColor}">{pitchCategory}</p>
						</div>
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center"
							style="background-color: {pitchColor}20"
						>
							<svg
								class="w-5 h-5"
								style="color: {pitchColor}"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
								/>
							</svg>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Main Content Grid -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
			<!-- Pitch Trend Chart -->
			<div class="lg:col-span-2 bg-surface-900 rounded-xl border border-surface-800 p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-surface-100">Pitch Trend</h2>
					<span class="text-xs text-surface-500">Last 30 sessions</span>
				</div>
				<PitchTrendChart trendData={stats.pitchTrend} targetRange={data.settings.targetRange} />
			</div>

			<!-- Category Breakdown -->
			<div class="bg-surface-900 rounded-xl border border-surface-800 p-6">
				<h2 class="text-lg font-semibold text-surface-100 mb-4">Category Breakdown</h2>
				{#if stats.categoryBreakdown.length > 0}
					{@const total = totalCategoryCount}
					<div class="space-y-4">
						<!-- Segmented Bar -->
						<div class="h-4 rounded-full overflow-hidden flex">
							{#each stats.categoryBreakdown as item}
								<div
									class="{categoryFillClass(item.category)} h-full"
									style="width: {(item.count / total) * 100}%"
								></div>
							{/each}
						</div>

						<!-- Legend -->
						<div class="space-y-3 pt-2">
							{#each stats.categoryBreakdown as item}
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-2">
										<div class="w-3 h-3 rounded-full {categoryFillClass(item.category)}"></div>
										<span class="text-sm text-surface-300">{categoryLabel(item.category)}</span>
									</div>
									<span class="text-sm font-medium text-surface-200">{item.count}</span>
								</div>
							{/each}
						</div>
					</div>
				{:else}
					<p class="text-surface-500 text-sm">No category data yet</p>
				{/if}
			</div>
		</div>

		<!-- Recent Sessions & Quick Actions -->
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
			<!-- Recent Sessions -->
			<div class="lg:col-span-2 bg-surface-900 rounded-xl border border-surface-800 p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-surface-100">Recent Sessions</h2>
					<a
						href="/sessions"
						class="text-sm text-primary-400 hover:text-primary-300 transition-colors">View All</a
					>
				</div>
				<div class="space-y-3">
					{#each stats.recentSessions as session}
						<div
							class="flex items-center justify-between p-3 rounded-lg bg-surface-950/50 border border-surface-800/50 hover:border-surface-700 transition-colors"
						>
							<div class="flex items-center gap-4">
								<div class="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center">
									<svg
										class="w-5 h-5 text-surface-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
										/>
									</svg>
								</div>
								<div>
									<p class="font-medium text-surface-200">{session.title}</p>
									<p class="text-xs text-surface-500">{formatSessionDate(session.createdAt)}</p>
								</div>
							</div>
							<div class="flex items-center gap-6">
								<div class="text-right hidden sm:block">
									<p class="text-sm text-surface-400">{formatDuration(session.duration)}</p>
								</div>
								<div class="text-right hidden sm:block">
									<p
										class="text-sm font-medium"
										style="color: {getPitchCategoryColor(
											getPitchCategory(session.pitchData.avgPitch)
										)}"
									>
										{formatHz(session.pitchData.avgPitch)}
									</p>
								</div>
								<a
									href="/sessions/{session._id}"
									class="text-sm text-primary-400 hover:text-primary-300 transition-colors px-3 py-1 rounded-lg hover:bg-primary-500/10"
								>
									View
								</a>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Quick Actions -->
			<div class="bg-surface-900 rounded-xl border border-surface-800 p-6">
				<h2 class="text-lg font-semibold text-surface-100 mb-4">Quick Actions</h2>
				<div class="space-y-3">
					<a
						href="/practice"
						class="flex items-center gap-3 w-full p-4 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-all duration-200 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30"
					>
						<span class="text-lg">🌸</span>
						Today's Practice
					</a>
					<a
						href="/record"
						class="flex items-center gap-3 w-full p-4 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-xl border border-surface-700 transition-all duration-200"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
							/>
						</svg>
						Free Recording
					</a>
					<a
						href="/range-test"
						class="flex items-center gap-3 w-full p-4 bg-surface-800 hover:bg-surface-700 text-surface-200 font-medium rounded-xl border border-surface-700 transition-all duration-200"
					>
						<span class="text-lg">📏</span>
						Pitch Range Test
					</a>
				</div>
			</div>
		</div>
	{/if}
</div>
