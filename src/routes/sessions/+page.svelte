<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { tick } from 'svelte';
	import { formatDuration, pitchBandClass } from '$lib/audio/utils';
	import { formatDate, formatTime } from '$lib/format';
	import { deleteSession as apiDeleteSession, errorMessage } from '$lib/api';
	import { m } from '$lib/paraglide/messages';
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let deleteError = $state<string | null>(null);
	let heading = $state<HTMLHeadingElement | null>(null);

	async function deleteSession(id: string) {
		if (!confirm(m.common_confirm_delete_session())) return;

		deleteError = null;
		try {
			await apiDeleteSession(id);
			await invalidate('app:sessions');
			// The button that was pressed is gone with its row; land on the heading
			// rather than on <body>.
			await tick();
			heading?.focus();
		} catch (err) {
			deleteError = errorMessage(err, m.sessions_delete_failed());
		}
	}
</script>

<svelte:head>
	<title>{m.common_page_title({ page: m.common_nav_sessions() })}</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<header class="mb-8">
		<h1 bind:this={heading} tabindex="-1" class="text-3xl font-bold text-surface-100 outline-none">
			{m.sessions_heading()}
		</h1>
		<p class="text-surface-400 mt-2">{m.sessions_subtitle()}</p>
	</header>

	{#if deleteError}
		<div
			class="mb-6 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start justify-between gap-4"
		>
			<span>{deleteError}</span>
			<button onclick={() => (deleteError = null)} class="underline hover:text-red-200"
				>{m.sessions_dismiss()}</button
			>
		</div>
	{/if}

	{#if data.sessions.length === 0}
		<div class="bg-surface-900 rounded-xl p-12 text-center border border-surface-800">
			<div class="text-6xl mb-4">🎙️</div>
			<h2 class="text-xl font-semibold text-surface-200 mb-2">{m.sessions_empty_title()}</h2>
			<p class="text-surface-400 mb-6">
				{m.sessions_empty_text()}
			</p>
			<a
				href="/record"
				class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
			>
				{m.sessions_start_recording()}
			</a>
		</div>
	{:else}
		<!-- Narrow screens: one card per session. A six-column table cannot shrink
		     below its content, so on a phone it clipped the actions off the right edge. -->
		<ul
			class="md:hidden bg-surface-900 rounded-xl border border-surface-800 divide-y divide-surface-800"
		>
			{#each data.sessions as session}
				<li class="p-4 space-y-3">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<div class="text-surface-200 font-medium truncate">{session.title}</div>
							<div class="text-surface-500 text-sm">
								{formatDate(session.createdAt)} · {formatTime(session.createdAt)}
							</div>
						</div>
						<span
							class="font-semibold shrink-0 {pitchBandClass(
								session.pitchData.medianPitch,
								session.targetRange
							)}"
						>
							{Math.round(session.pitchData.medianPitch)} Hz
						</span>
					</div>
					<div class="flex items-center justify-between gap-3 text-sm">
						<div class="flex items-center gap-3 text-surface-400">
							<span>{formatDuration(session.duration)}</span>
							<span class="text-primary-400 font-semibold"
								>{m.sessions_in_target({
									pct: Math.round(session.pitchData.timeInTargetPct)
								})}</span
							>
						</div>
						<div class="flex items-center gap-4">
							<a
								href="/sessions/{session._id}"
								class="py-2 text-primary-400 hover:text-primary-300 font-medium transition-colors"
							>
								{m.sessions_view()}
							</a>
							<button
								onclick={() => deleteSession(session._id)}
								aria-label={m.sessions_delete_label({ title: session.title })}
								class="py-2 text-surface-500 hover:text-red-400 font-medium transition-colors"
							>
								{m.sessions_delete()}
							</button>
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<div
			class="hidden md:block bg-surface-900 rounded-xl border border-surface-800 overflow-x-auto"
		>
			<table class="w-full">
				<thead>
					<tr class="border-b border-surface-800 bg-surface-900/50">
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_column_date()}</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_label_title()}</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_column_duration()}</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_column_avg_pitch()}</th
						>
						<th
							class="text-left py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_column_target_time()}</th
						>
						<th
							class="text-right py-4 px-6 text-sm font-medium text-surface-400 uppercase tracking-wider"
							>{m.sessions_column_actions()}</th
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
								<span
									class="font-semibold {pitchBandClass(
										session.pitchData.medianPitch,
										session.targetRange
									)}"
								>
									{Math.round(session.pitchData.medianPitch)} Hz
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
										{m.sessions_view()}
									</a>
									<button
										onclick={() => deleteSession(session._id)}
										aria-label={m.sessions_delete_label({ title: session.title })}
										class="inline-flex items-center gap-1 text-sm text-surface-500 hover:text-red-400 font-medium transition-colors ml-3"
									>
										{m.sessions_delete()}
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.totalPages > 1}
			<nav
				aria-label={m.sessions_pagination_label()}
				class="flex items-center justify-between mt-6"
			>
				<a
					href="?page={Math.max(1, data.page - 1)}"
					aria-disabled={data.page <= 1}
					tabindex={data.page <= 1 ? -1 : undefined}
					class="inline-flex items-center gap-2 px-4 py-2 bg-surface-800 hover:bg-surface-700 text-surface-300 rounded-lg transition-colors {data.page <=
					1
						? 'opacity-50 pointer-events-none'
						: ''}"
				>
					{m.sessions_previous()}
				</a>
				<span class="text-surface-400 text-sm">
					{m.sessions_page_of({ page: data.page, total: data.totalPages })}
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
					{m.sessions_next()}
				</a>
			</nav>
		{/if}
	{/if}
</div>
