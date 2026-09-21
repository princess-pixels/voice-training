<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { formatDuration, getPitchCategoryClass } from '$lib/audio/utils';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let deleteError = $state<string | null>(null);

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('en-US', {
			month: 'short',
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

	async function deleteSession(id: string) {
		if (!confirm('Are you sure you want to delete this session?')) {
			return;
		}

		deleteError = null;
		try {
			const response = await fetch(`/api/sessions/${id}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				await invalidate('app:sessions');
			} else {
				const body = await response.json().catch(() => null);
				deleteError = body?.message ?? `Failed to delete session (HTTP ${response.status})`;
			}
		} catch (err) {
			deleteError = err instanceof Error ? err.message : 'Failed to delete session';
		}
	}
</script>

<svelte:head>
	<title>Sessions — Voice Training</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<header class="mb-8">
		<h1 class="text-3xl font-bold text-surface-100">Session History</h1>
		<p class="text-surface-400 mt-2">Review your past practice sessions</p>
	</header>

	{#if deleteError}
		<div
			class="mb-6 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-4"
		>
			<span>{deleteError}</span>
			<button onclick={() => (deleteError = null)} class="underline hover:text-red-200"
				>Dismiss</button
			>
		</div>
	{/if}

	{#if data.sessions.length === 0}
		<div class="bg-surface-900 rounded-xl p-12 text-center border border-surface-800">
			<div class="text-6xl mb-4">🎙️</div>
			<h2 class="text-xl font-semibold text-surface-200 mb-2">No sessions yet</h2>
			<p class="text-surface-400 mb-6">
				Start recording your voice training sessions to track your progress
			</p>
			<a
				href="/record"
				class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
			>
				Start Recording
			</a>
		</div>
	{:else}
		<div class="bg-surface-900 rounded-xl border border-surface-800 overflow-hidden">
			<table class="w-full">
				<thead>
					<tr class="border-b border-surface-800 bg-surface-900/50">
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Date</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Title</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Duration</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Avg Pitch</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Target Time</th
						>
						<th
							class="text-right py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>Actions</th
						>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-800">
					{#each data.sessions as session}
						<tr class="hover:bg-surface-800/50 transition-colors">
							<td class="py-4 px-6">
								<div class="text-surface-200 font-medium">{formatDate(session.createdAt)}</div>
								<div class="text-surface-500 text-sm">{formatTime(session.createdAt)}</div>
							</td>
							<td class="py-4 px-6">
								<div class="text-surface-200 font-medium">{session.title}</div>
							</td>
							<td class="py-4 px-6">
								<span class="text-surface-300">{formatDuration(session.duration)}</span>
							</td>
							<td class="py-4 px-6">
								<span class="font-semibold {getPitchCategoryClass(session.pitchData.avgPitch)}">
									{Math.round(session.pitchData.avgPitch)} Hz
								</span>
							</td>
							<td class="py-4 px-6">
								<div class="flex items-center gap-2">
									<span class="text-primary-400 font-semibold"
										>{Math.round(session.pitchData.timeInTargetPct)}%</span
									>
									<div class="w-16 h-1.5 bg-surface-700 rounded-full overflow-hidden">
										<div
											class="h-full bg-primary-500 rounded-full"
											style="width: {Math.min(
												100,
												Math.max(0, session.pitchData.timeInTargetPct)
											)}%"
										></div>
									</div>
								</div>
							</td>
							<td class="py-4 px-6">
								<div class="flex items-center justify-end gap-2">
									<a
										href="/sessions/{session._id}"
										class="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 font-medium transition-colors"
									>
										View
									</a>
									<button
										onclick={() => deleteSession(session._id)}
										aria-label="Delete session {session.title}"
										class="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-red-400 font-medium transition-colors ml-3"
									>
										Delete
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.totalPages > 1}
			<nav aria-label="Pagination" class="flex items-center justify-between mt-6">
				<a
					href="?page={Math.max(1, data.page - 1)}"
					aria-disabled={data.page <= 1}
					tabindex={data.page <= 1 ? -1 : undefined}
					class="inline-flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors {data.page <=
					1
						? 'opacity-50 pointer-events-none'
						: ''}"
				>
					← Previous
				</a>
				<span class="text-surface-400 text-sm">
					Page {data.page} of {data.totalPages}
				</span>
				<a
					href="?page={Math.min(data.totalPages, data.page + 1)}"
					aria-disabled={data.page >= data.totalPages}
					tabindex={data.page >= data.totalPages ? -1 : undefined}
					class="inline-flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors {data.page >=
					data.totalPages
						? 'opacity-50 pointer-events-none'
						: ''}"
				>
					Next →
				</a>
			</nav>
		{/if}
	{/if}
</div>
