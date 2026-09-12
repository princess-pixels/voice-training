/**
 * bun run import <archive.tar.gz>
 *
 * Reads an export (Settings → "Download everything") into the data directory
 * this process sees (`DATA_DIR`, default ./data). Safe to re-run: existing
 * rows are skipped. Stop the server first if it is running against the same
 * directory, so the two are not writing at once.
 */
import { formatReport, importArchive } from '../src/lib/server/import';
import { closeDatabase } from '../src/lib/server/db';
import { dataDir } from '../src/lib/server/config';

const archive = process.argv[2];
if (!archive) {
	console.error('usage: bun run import <voice-training-export-YYYY-MM-DD.tar.gz>');
	process.exit(2);
}

console.log(`Importing ${archive} into ${dataDir()}`);
try {
	const report = await importArchive(archive);
	console.log(formatReport(report));
	process.exit(report.sessions.failed.length > 0 ? 1 : 0);
} catch (err) {
	console.error(`Import failed: ${(err as Error).message}`);
	process.exit(1);
} finally {
	closeDatabase();
}
