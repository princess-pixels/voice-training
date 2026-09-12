<script lang="ts">
	import {
		formatHz,
		formatDuration,
		getPitchCategory,
		getPitchCategoryClass
	} from '$lib/audio/utils';

	interface Props {
		currentHz?: number;
		avgHz: number;
		minHz: number;
		maxHz: number;
		timeInTargetPct: number;
		duration?: number;
	}

	let { currentHz, avgHz, minHz, maxHz, timeInTargetPct, duration }: Props = $props();

	function getCategoryBg(hz: number): string {
		const category = getPitchCategory(hz);
		switch (category) {
			case 'feminine':
				return 'bg-primary-500/20 border-primary-500/30';
			case 'androgynous':
				return 'bg-accent-500/20 border-accent-500/30';
			case 'masculine':
				return 'bg-indigo-500/20 border-indigo-500/30';
			default:
				return 'bg-surface-700/50 border-surface-600/50';
		}
	}
</script>

<div class="flex flex-wrap gap-3">
	{#if currentHz !== undefined}
		<div
			class="flex-1 min-w-[100px] bg-surface-800/50 rounded-lg p-3 border border-surface-700/50 {getCategoryBg(
				currentHz
			)}"
		>
			<div class="text-xs text-surface-400 uppercase tracking-wider mb-1">Current</div>
			<div class="text-2xl font-bold {getPitchCategoryClass(currentHz)}">
				{formatHz(currentHz)}
			</div>
		</div>
	{/if}

	<div class="flex-1 min-w-[100px] bg-surface-800/50 rounded-lg p-3 border border-surface-700/50">
		<div class="text-xs text-surface-400 uppercase tracking-wider mb-1">Average</div>
		<div class="text-2xl font-bold text-surface-200">
			{formatHz(avgHz)}
		</div>
	</div>

	<div class="flex-1 min-w-[100px] bg-surface-800/50 rounded-lg p-3 border border-surface-700/50">
		<div class="text-xs text-surface-400 uppercase tracking-wider mb-1">Range</div>
		<div class="text-xl font-bold text-surface-200">
			{#if minHz > 0 && maxHz > 0}
				{Math.round(minHz)} - {Math.round(maxHz)} <span class="text-sm text-surface-400">Hz</span>
			{:else}
				<span class="text-surface-500">—</span>
			{/if}
		</div>
	</div>

	<div class="flex-1 min-w-[100px] bg-surface-800/50 rounded-lg p-3 border border-surface-700/50">
		<div class="text-xs text-surface-400 uppercase tracking-wider mb-1">Time in Target</div>
		<div class="flex items-center gap-2">
			<div class="text-2xl font-bold text-primary-400">
				{Math.round(timeInTargetPct)}%
			</div>
		</div>
		<div class="mt-2 h-1.5 bg-surface-700 rounded-full overflow-hidden">
			<div
				class="h-full bg-primary-500 rounded-full transition-all duration-300"
				style="width: {Math.min(100, Math.max(0, timeInTargetPct))}%"
			></div>
		</div>
	</div>

	{#if duration !== undefined}
		<div class="flex-1 min-w-[100px] bg-surface-800/50 rounded-lg p-3 border border-surface-700/50">
			<div class="text-xs text-surface-400 uppercase tracking-wider mb-1">Duration</div>
			<div class="text-2xl font-bold text-surface-200">
				{formatDuration(duration)}
			</div>
		</div>
	{/if}
</div>
