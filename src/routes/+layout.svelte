<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const navItems = [
		{ href: '/', label: 'Dashboard', icon: '📊' },
		{ href: '/practice', label: "Today's Practice", icon: '🌸' },
		{ href: '/exercises', label: 'Exercises', icon: '🎯' },
		{ href: '/record', label: 'Record', icon: '🎙️' },
		{ href: '/range-test', label: 'Range Test', icon: '📏' },
		{ href: '/sessions', label: 'Sessions', icon: '📁' },
		{ href: '/settings', label: 'Settings', icon: '⚙️' }
	];

	// Below md the sidebar becomes a drawer under a top bar.
	let menuOpen = $state(false);

	// Close the drawer whenever navigation happens.
	$effect(() => {
		void page.url.pathname;
		menuOpen = false;
	});

	function isActive(href: string): boolean {
		return page.url.pathname === href || (page.url.pathname.startsWith(href) && href !== '/');
	}
</script>

<div class="flex min-h-screen flex-col md:flex-row">
	<!-- Mobile top bar -->
	<header
		class="md:hidden flex items-center justify-between px-4 py-3 bg-surface-900 border-b border-surface-800"
	>
		<span class="text-lg font-bold text-primary-400">Voice Training</span>
		<button
			type="button"
			onclick={() => (menuOpen = !menuOpen)}
			aria-expanded={menuOpen}
			aria-controls="site-nav"
			aria-label={menuOpen ? 'Close menu' : 'Open menu'}
			class="p-2 -mr-2 rounded-lg text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
		>
			{#if menuOpen}
				<svg
					class="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			{:else}
				<svg
					class="w-6 h-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 6h16M4 12h16M4 18h16"
					/>
				</svg>
			{/if}
		</button>
	</header>

	<!-- Sidebar / drawer -->
	<nav
		id="site-nav"
		aria-label="Main"
		class="bg-surface-900 border-surface-800 flex-col md:flex md:w-64 md:border-r md:shrink-0 {menuOpen
			? 'flex border-b'
			: 'hidden'}"
	>
		<div class="p-6 hidden md:block">
			<span class="block text-xl font-bold text-primary-400">Voice Training</span>
			<p class="text-sm text-surface-400 mt-1">Feminization Practice</p>
		</div>
		<ul class="flex-1 p-3 md:px-3 md:py-0 space-y-1">
			{#each navItems as item}
				<li>
					<a
						href={item.href}
						aria-current={isActive(item.href) ? 'page' : undefined}
						class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              {isActive(item.href)
							? 'bg-primary-500/10 text-primary-400'
							: 'text-surface-400 hover:text-surface-200 hover:bg-surface-800'}"
					>
						<span class="text-lg" aria-hidden="true">{item.icon}</span>
						{item.label}
					</a>
				</li>
			{/each}
		</ul>
		<div class="p-4 border-t border-surface-800">
			<p class="text-xs text-surface-500 text-center">v{__APP_VERSION__}</p>
		</div>
	</nav>

	<!-- Main content -->
	<main class="flex-1 min-w-0 p-4 sm:p-6 md:p-8 overflow-auto">
		{@render children()}
	</main>
</div>
