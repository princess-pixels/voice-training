/**
 * Paraglide compiler options, shared by the Vite plugin (dev and build) and
 * scripts/i18n.ts (typecheck and tests, which run without Vite). Plain JS so
 * vite.config.ts can import it with an extension under either config loader.
 *
 * No URL strategy: this is a local, single-user app with nothing to index, so
 * locales never show up in paths. The cookie carries an explicit choice from
 * Settings so the server renders in it; otherwise the browser's language
 * decides, and English is the fallback.
 */
/** @satisfies {import('@inlang/paraglide-js').CompilerOptions} */
export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	strategy: ['cookie', 'preferredLanguage', 'baseLocale'],
	emitTsDeclarations: true
};
