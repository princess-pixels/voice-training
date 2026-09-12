import adapter from 'svelte-adapter-bun';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				// Tailwind's generated stylesheet is external, but a handful of
				// components set style="" attributes (bar widths, category colours).
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				// Session audio streams from /api; the studio previews the recorded blob.
				'media-src': ['self', 'blob:'],
				'connect-src': ['self'],
				'worker-src': ['self'],
				'font-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		}
	}
};

export default config;
