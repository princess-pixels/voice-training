<script lang="ts">
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

	const notFound = $derived(page.status === 404);
	const title = $derived(notFound ? m.common_error_not_found() : m.common_error_generic());
	// Every message arrives in the request's locale: error() calls write it so,
	// and both handleError hooks translate the ones SvelteKit raises itself.
	const message = $derived(page.error?.message || title);
	// A stale link to a deleted take is the common 404; point back to the list it came from.
	const toSessions = $derived(notFound && page.url.pathname.startsWith('/sessions/'));
</script>

<svelte:head>
	<title>{m.common_page_title({ page: title })}</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
	<div class="bg-surface-900 rounded-xl p-12 text-center border border-surface-800">
		<p class="text-sm font-medium text-surface-500 uppercase tracking-wider mb-2">
			{page.status}
		</p>
		<h1 class="text-2xl font-semibold text-surface-100 mb-3">{message}</h1>
		<p class="text-surface-400 mb-8 max-w-md mx-auto">
			{#if toSessions}
				{m.common_error_session_gone()}
			{:else if notFound}
				{m.common_error_not_found_hint()}
			{:else}
				{m.common_error_generic_hint()}
			{/if}
		</p>
		<div class="flex flex-wrap justify-center gap-3">
			{#if toSessions}
				<a
					href="/sessions"
					class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
				>
					{m.common_error_back_to_sessions()}
				</a>
			{:else if !notFound}
				<button
					type="button"
					onclick={() => location.reload()}
					class="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
				>
					{m.common_error_try_again()}
				</button>
			{/if}
			<a
				href="/"
				class="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors {toSessions ||
				!notFound
					? 'text-surface-300 hover:text-surface-100 hover:bg-surface-800'
					: 'bg-primary-600 hover:bg-primary-500 text-white'}"
			>
				{m.common_error_back_to_dashboard()}
			</a>
		</div>
	</div>
</div>
