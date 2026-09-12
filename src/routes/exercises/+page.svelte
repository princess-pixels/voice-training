<script lang="ts">
	import type { ExerciseCategory, Difficulty } from '$lib/types';
	import { CATEGORY_ORDER, categoryLabel, categoryBadgeClass } from '$lib/categories';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const categories: (ExerciseCategory | 'all')[] = ['all', ...CATEGORY_ORDER];

	const difficulties: (Difficulty | 'all')[] = ['all', 'beginner', 'intermediate', 'advanced'];

	// Track expanded state for each exercise card
	let expandedExercises = $state<Set<string>>(new Set());

	function toggleInstructions(exerciseId: string) {
		const newSet = new Set(expandedExercises);
		if (newSet.has(exerciseId)) {
			newSet.delete(exerciseId);
		} else {
			newSet.add(exerciseId);
		}
		expandedExercises = newSet;
	}

	function getDifficultyColor(difficulty: Difficulty): string {
		switch (difficulty) {
			case 'beginner':
				return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
			case 'intermediate':
				return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
			case 'advanced':
				return 'bg-red-500/20 text-red-400 border-red-500/30';
			default:
				return 'bg-surface-700 text-surface-300 border-surface-600';
		}
	}

	function formatDifficultyLabel(difficulty: string): string {
		return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
	}

	function buildFilterUrl(category: string, difficulty: string): string {
		const params = new URLSearchParams();
		if (category !== 'all') params.set('category', category);
		if (difficulty !== 'all') params.set('difficulty', difficulty);
		const queryString = params.toString();
		return queryString ? `?${queryString}` : '';
	}
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
	<!-- Header -->
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-surface-100">Exercise Library</h1>
		<p class="text-surface-400 mt-2">Browse and practice voice training exercises</p>
	</div>

	<!-- Filter Bar -->
	<div class="mb-8 space-y-4">
		<!-- Category Tabs -->
		<div class="flex flex-wrap gap-2">
			{#each categories as category}
				{@const isActive =
					(category === 'all' && !data.activeCategory) || data.activeCategory === category}
				<a
					href="/exercises{buildFilterUrl(category, data.activeDifficulty || 'all')}"
					class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 {isActive
						? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
						: 'bg-surface-900 text-surface-400 hover:text-surface-200 hover:bg-surface-800 border border-surface-800'}"
				>
					{category === 'all' ? 'All' : categoryLabel(category)}
				</a>
			{/each}
		</div>

		<!-- Difficulty Filter -->
		<div class="flex flex-wrap gap-2 items-center">
			<span class="text-sm text-surface-500 mr-2">Difficulty:</span>
			{#each difficulties as difficulty}
				{@const isActive =
					(difficulty === 'all' && !data.activeDifficulty) || data.activeDifficulty === difficulty}
				<a
					href="/exercises{buildFilterUrl(data.activeCategory || 'all', difficulty)}"
					class="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 {isActive
						? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
						: 'bg-surface-900 text-surface-400 hover:text-surface-200 hover:bg-surface-800 border border-surface-800'}"
				>
					{formatDifficultyLabel(difficulty)}
				</a>
			{/each}
		</div>
	</div>

	<!-- Exercise Grid -->
	{#if data.exercises.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each data.exercises as exercise (exercise._id)}
				<div
					class="group bg-surface-900 border border-surface-800 rounded-xl p-6 transition-all duration-200 hover:border-surface-700 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5"
				>
					<!-- Badges Row -->
					<div class="flex flex-wrap gap-2 mb-4">
						<span
							class="px-2.5 py-1 rounded-full text-xs font-medium border {categoryBadgeClass(
								exercise.category
							)}"
						>
							{categoryLabel(exercise.category)}
						</span>
						<span
							class="px-2.5 py-1 rounded-full text-xs font-medium border {getDifficultyColor(
								exercise.difficulty
							)}"
						>
							{formatDifficultyLabel(exercise.difficulty)}
						</span>
					</div>

					<!-- Title -->
					<h3 class="text-lg font-semibold text-surface-100 mb-2">{exercise.title}</h3>

					<!-- Description -->
					<p class="text-surface-400 text-sm line-clamp-2 mb-4">{exercise.description}</p>

					<!-- Meta Info -->
					<div class="flex items-center gap-4 text-sm text-surface-500 mb-4">
						<div class="flex items-center gap-1.5">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
							<span>{exercise.estimatedMinutes} min</span>
						</div>
						{#if exercise.targetRange}
							<div class="flex items-center gap-1.5">
								<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
									/>
								</svg>
								<span>{exercise.targetRange.low}-{exercise.targetRange.high} Hz</span>
							</div>
						{/if}
					</div>

					<!-- Expandable Instructions -->
					<div class="mb-4">
						<button
							type="button"
							class="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
							onclick={() => toggleInstructions(exercise._id)}
						>
							<span>Instructions</span>
							<svg
								class="w-4 h-4 transition-transform duration-200 {expandedExercises.has(
									exercise._id
								)
									? 'rotate-180'
									: ''}"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 9l-7 7-7-7"
								/>
							</svg>
						</button>
						{#if expandedExercises.has(exercise._id)}
							<div
								class="mt-3 text-sm text-surface-400 leading-relaxed animate-in fade-in slide-in-from-top-2 duration-200"
							>
								{exercise.instructions}
							</div>
						{/if}
					</div>

					<!-- Start Button -->
					<a
						href="/record/{exercise._id}"
						class="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg transition-all duration-200 shadow-lg shadow-primary-500/20 hover:shadow-primary-500/30"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
							/>
						</svg>
						Start Practice
					</a>
				</div>
			{/each}
		</div>
	{:else}
		<!-- Empty State -->
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<div class="w-16 h-16 mb-4 rounded-full bg-surface-900 flex items-center justify-center">
				<svg class="w-8 h-8 text-surface-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<h3 class="text-lg font-medium text-surface-300 mb-2">No exercises found</h3>
			<p class="text-surface-500 max-w-sm">
				No exercises match your current filters. Try adjusting the category or difficulty filters
				above.
			</p>
			<a
				href="/exercises"
				class="mt-4 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors"
			>
				Clear filters
			</a>
		</div>
	{/if}
</div>
