/**
 * bun run build:binary [target ...]
 *
 * One self-contained executable per target under dist/. `bun run build` must
 * have run first: the SvelteKit server bundle in build/ is what gets wrapped.
 * With no target, builds for this machine.
 *
 * Two stages: the CLI is bundled INTO build/ next to the server, a two-line
 * wrapper there imports both (so the compiler bundles the server and its
 * import.meta.dir is the directory the handler resolves `client/` against),
 * then the wrapper is compiled with the client assets embedded.
 */
import { $ } from 'bun';
import { existsSync } from 'node:fs';
import pkg from '../package.json' with { type: 'json' };

const targets = process.argv.slice(2);
if (!existsSync('build/index.js')) {
	console.error('build/index.js is missing; run `bun run build` first');
	process.exit(1);
}

await $`bun build src/cli.ts --target=bun --outfile build/cli-core.js`;
await Bun.write(
	'build/cli.js',
	`import { run } from './cli-core.js';\nawait run(() => import('./index.js'));\n`
);

const assets = ['--asset', 'build/client'];
if (existsSync('build/prerendered')) assets.push('--asset', 'build/prerendered');

const builds = targets.length ? targets : [null];
for (const target of builds) {
	const suffix = target ? `-${target.replace(/^bun-/, '')}` : '';
	const exe = target?.includes('windows') ? '.exe' : '';
	const outfile = `dist/voice-training${suffix}${exe}`;
	const targetFlag = target ? [`--target=${target}`] : [];
	await $`bun build --compile ${targetFlag} build/cli.js ${assets} --outfile ${outfile}`;
	const size = (Bun.file(outfile).size / 1024 / 1024).toFixed(0);
	console.log(`${outfile}  (${size} MB, v${pkg.version})`);
}
