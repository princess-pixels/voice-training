import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Bun's built-in modules are provided by the runtime, never bundled.
	ssr: { external: ['bun', 'bun:sqlite'] },
	define: {
		// Shown in the sidebar footer; one source of truth for the version.
		__APP_VERSION__: JSON.stringify(pkg.version)
	}
});
