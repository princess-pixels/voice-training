import { resolve } from 'node:path';

/**
 * Where this install keeps its data: the SQLite database and the recordings.
 *
 * `DATA_DIR` in the environment; `./data` under the working directory if unset.
 * The special value `:memory:` gives an in-memory database and no audio
 * directory, which is what the tests use. The CLI flags planned for the portable
 * binary (`--data-dir`) will land here as well.
 */
export function dataDir(): string {
	const raw = process.env.DATA_DIR?.trim();
	if (!raw) return resolve('data');
	return raw === ':memory:' ? raw : resolve(raw);
}

export function isInMemory(): boolean {
	return dataDir() === ':memory:';
}
