<script lang="ts">
	import { page } from '$app/state';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? 'Not found' : 'Something went wrong');
	const message = $derived(
		page.error?.message ?? (notFound ? 'Not found' : 'Something went wrong')
	);
	// A stale link to a deleted take is the common 404; point back to the list it came from.
	const toSessions = $derived(notFound && page.url.pathname.startsWith('/sessions/'));
</script>

<svelte:head>
	<title>{title} — Voice Training</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<div class="bg-surface-900 rounded-xl p-12 text-center border border-surface-800">
		<p class="text-sm font-medium text-surface-500 uppercase tracking-wider mb-2">
			{page.status}
		</p>
		<h1 class="text-2xl font-semibold text-surface-100 mb-3">{message}</h1>
		<p class="text-surface-400 mb-8 max-w-md mx-auto">
			{#if toSessions}
				That recording is not here any more. It may have been deleted, perhaps from another device.
			{:else if notFound}
				There is nothing at this address. Your recordings and progress are all still where you left
				them.
			{:else}
				Nothing was lost. Try again in a moment, and if it keeps happening, restarting the app
				usually clears it.
			{/if}
		</p>
		<div class="flex flex-wrap justify-center gap-3">
			{#if toSessions}
				<a
					href="/sessions"
					class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
				>
					Back to Sessions
				</a>
			{:else if !notFound}
				<button
					type="button"
					onclick={() => location.reload()}
					class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
				>
					Try again
				</button>
			{/if}
			<a
				href="/"
				class="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors {toSessions ||
				!notFound
					? 'text-surface-300 hover:text-surface-100 hover:bg-surface-800'
					: 'bg-primary-600 hover:bg-primary-500 text-white'}"
			>
				Back to Dashboard
			</a>
		</div>
	</div>
</div>
