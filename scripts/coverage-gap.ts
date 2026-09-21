import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Bun only instruments files a test imports, so the coverage table (and its
 * per-file threshold) says nothing about the files no test reaches. This
 * lists them, so the number in CI is read next to what it leaves out.
 *
 *   bun test --coverage && bun scripts/coverage-gap.ts
 */

const root = 'src';
const lcov = await Bun.file('coverage/lcov.info').text();
const measured = new Set(
	[...lcov.matchAll(/^SF:(.+)$/gm)].map((m) => relative(process.cwd(), m[1]).replace(/\\/g, '/'))
);

async function walk(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...(await walk(path)));
		else if (/\.(ts|svelte)$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name))
			out.push(path);
	}
	return out;
}

const sources = (await walk(root)).sort();
const unmeasured = sources.filter((f) => !measured.has(f));
const lines = async (f: string) => (await Bun.file(f).text()).split('\n').length;
let measuredLines = 0;
let totalLines = 0;
for (const f of sources) {
	const n = await lines(f);
	totalLines += n;
	if (measured.has(f)) measuredLines += n;
}

console.log(
	`Coverage measures ${measured.size} of ${sources.length} source files ` +
		`(${measuredLines} of ${totalLines} lines, ${Math.round((100 * measuredLines) / totalLines)}%).`
);
console.log(`Not reached by any test (${unmeasured.length}):`);
for (const f of unmeasured) console.log(`  ${f}`);
