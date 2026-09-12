import type { Handle } from '@sveltejs/kit';
import { seedExercises } from '$lib/server/exercises';
import { migrateDatabase } from '$lib/server/db';
import { ensureAudioDir } from '$lib/server/audio';

// One-time startup tasks: open the database, make sure the data directory is ready.
// Runs once on first module load (server start) — subsequent requests are no-ops.
async function bootstrap() {
	try {
		await migrateDatabase();
	} catch (err) {
		console.error(
			'[bootstrap] Could not open the database. Is DATA_DIR writable? Nothing will work until this is fixed.',
			err
		);
		return;
	}

	try {
		await ensureAudioDir();
	} catch (err) {
		console.error(
			'[bootstrap] Could not create the audio directory. Recordings will fail to save.',
			err
		);
	}

	try {
		await seedExercises();
	} catch (err) {
		console.error('[bootstrap] Exercise seeding failed.', err);
	}
}

bootstrap();

// Response hardening. The Content-Security-Policy itself comes from kit.csp in
// svelte.config.js, which adds the per-request script nonces.
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// The app is the only thing that should ever ask for the mic here.
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	return response;
};
