/**
 * bun scripts/i18n.ts
 *
 * Compiles messages/ into src/lib/paraglide. Vite does this itself during dev
 * and build; svelte-check and bun test run without Vite, so `prepare` and
 * `typecheck` call this first.
 *
 * Paraglide only warns when the format plugin fails to load, and then compiles
 * zero messages with exit code 0, so the compiled count is checked against the
 * English files here. A key that exists only in a translation is a typo.
 */
import { compile } from '@inlang/paraglide-js';
import { readdir } from 'node:fs/promises';
import { paraglideOptions } from '../paraglide.config.js';
import settings from '../project.inlang/settings.json' with { type: 'json' };

await compile(paraglideOptions);

const patterns = settings['plugin.inlang.messageFormat'].pathPattern;
const keysOf = async (locale: string) => {
	const keys = new Set<string>();
	for (const pattern of patterns) {
		const file: Record<string, unknown> = await Bun.file(
			pattern.replace('{locale}', locale)
		).json();
		for (const key of Object.keys(file)) if (key !== '$schema') keys.add(key);
	}
	return keys;
};

const base = await keysOf(settings.baseLocale);
const compiled = (await readdir(`${paraglideOptions.outdir}/messages`)).filter(
	(f) => f.endsWith('.js') && !f.startsWith('_')
).length;
if (compiled !== base.size) {
	console.error(
		`i18n: compiled ${compiled} messages, but the ${settings.baseLocale} files have ${base.size}`
	);
	process.exit(1);
}

let missing = 0;
for (const locale of settings.locales.filter((l) => l !== settings.baseLocale)) {
	const keys = await keysOf(locale);
	const stray = [...keys].filter((k) => !base.has(k));
	if (stray.length) {
		console.error(
			`i18n: ${locale} has keys that ${settings.baseLocale} does not: ${stray.join(', ')}`
		);
		process.exit(1);
	}
	missing += base.size - keys.size;
	if (base.size > keys.size) {
		console.log(
			`i18n: ${locale} falls back to ${settings.baseLocale} for ${base.size - keys.size} of ${base.size} messages`
		);
	}
}
if (!missing) console.log(`i18n: ${base.size} messages, every locale complete`);
