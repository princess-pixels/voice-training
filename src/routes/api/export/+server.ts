import { rm } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveFileName, buildExport } from '$lib/server/export';

/**
 * POST /api/export: every session, recording, range test, exercise and the
 * settings, as one .tar.gz. See README "Backups" for the layout.
 *
 * A POST rather than a GET because building the archive copies every
 * recording to disk: as a GET, any page could make this server do that
 * (SvelteKit's cross-site check only covers form posts, and a hostile page
 * addressing localhost directly bypasses the host allowlist). Settings sends
 * a plain form, so the origin check applies, and only one export runs at a
 * time.
 */
let inFlight = false;

export const POST: RequestHandler = async () => {
	if (inFlight) error(429, 'An export is already being built; try again in a moment');
	inFlight = true;
	let result;
	try {
		result = await buildExport();
	} catch (err) {
		console.error('[export] failed:', err);
		error(500, 'Export failed; see the server log');
	} finally {
		inFlight = false;
	}

	const { dir, archivePath } = result;
	const file = Bun.file(archivePath);
	const reader = file.stream().getReader();

	let cleaned = false;
	const cleanup = async () => {
		if (cleaned) return;
		cleaned = true;
		await rm(dir, { recursive: true, force: true });
	};

	// Wrap the file stream so the temp directory goes away when the download
	// completes or the client gives up part-way.
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			const { done, value } = await reader.read();
			if (done) {
				controller.close();
				await cleanup();
				return;
			}
			controller.enqueue(value);
		},
		async cancel(reason) {
			await reader.cancel(reason);
			await cleanup();
		}
	});

	return new Response(body, {
		headers: {
			'Content-Type': 'application/gzip',
			'Content-Length': String(file.size),
			'Content-Disposition': `attachment; filename="${archiveFileName()}"`,
			'Cache-Control': 'no-store'
		}
	});
};
