<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { getLocale, locales, setLocale, type Locale } from '$lib/paraglide/runtime';

	// Each language in its own words: someone who cannot read the current UI
	// still has to find theirs. Record<Locale, …> breaks the build when a
	// locale is added to project.inlang without a name here.
	const NATIVE_NAMES: Record<Locale, string> = {
		en: 'English',
		nb: 'Norsk bokmål'
	};

	let { unsaved = false }: { unsaved?: boolean } = $props();

	const current = getLocale();

	function choose(event: Event & { currentTarget: HTMLSelectElement }) {
		const next = event.currentTarget.value as Locale;
		if (next === current) return;
		// Switching reloads the page, which would drop the rest of the form.
		if (unsaved && !confirm(m.settings_language_unsaved_confirm())) {
			event.currentTarget.value = current;
			return;
		}
		// Sets the cookie and reloads, so the server renders the next page in it.
		setLocale(next);
	}
</script>

<section class="bg-surface-900 rounded-2xl p-6 mb-6 border border-surface-800">
	<h2 class="text-xl font-semibold mb-2 text-surface-100">
		<label for="app-language">{m.settings_language_heading()}</label>
	</h2>
	<p class="text-sm text-surface-400 mb-4">{m.settings_language_hint()}</p>
	<select
		id="app-language"
		value={current}
		onchange={choose}
		class="w-full px-4 py-3 bg-surface-950 border border-surface-800 rounded-xl text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
	>
		{#each locales as locale (locale)}
			<option value={locale} lang={locale}>{NATIVE_NAMES[locale]}</option>
		{/each}
	</select>
</section>
