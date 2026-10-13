import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { getTextDirection } from '$lib/paraglide/runtime';
import { m } from '$lib/paraglide/messages';
import { seedExercises } from '$lib/server/exercises';
import { migrateDatabase } from '$lib/server/db';
import { ensureAudioDir } from '$lib/server/audio';
import { hostPolicy, isAllowedHost } from '$lib/server/host';

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

// Read once at startup; see host.ts for what it allows and why.
const hosts = hostPolicy(process.env);

// Request and response hardening. The Content-Security-Policy itself comes
// from kit.csp in svelte.config.js, which adds the per-request script nonces.
const hardening: Handle = async ({ event, resolve }) => {
	// The adapter builds event.url from ORIGIN, so the raw header is the only
	// place a DNS-rebinding request still shows its real name.
	const host = event.request.headers.get('host');
	if (!isAllowedHost(host, hosts)) {
		return new Response(
			`Host ${JSON.stringify(host ?? '')} is not allowed. Open the app at the URL in ORIGIN (or on localhost); see README "Keep it running".`,
			{ status: 403, headers: { 'Content-Type': 'text/plain' } }
		);
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// The app is the only thing that should ever ask for the mic here.
	response.headers.set('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
	return response;
};

// The request's locale (cookie, then Accept-Language, then English), held in
// AsyncLocalStorage for the whole request so every m.*() call on the server
// renders in it. Runs after the host check: a refused host gets nothing.
// The middleware hands back a clone of the request, which only matters when a
// URL strategy rewrites the path. There is none here, and the clone would tee
// every body, so an audio upload would sit in memory twice: keep the original.
const i18n: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%lang%', locale).replace('%dir%', getTextDirection(locale))
		});
	});

export const handle = sequence(hardening, i18n);

// Unexpected errors only; error() calls from loads and routes never come here.
// SvelteKit's own 404 for an unknown path does, so it is told apart by status.
// The one place they are logged, with the path, and the one shape the error
// page ever sees (App.Error in app.d.ts).
export const handleError: HandleServerError = ({ error, event, status }) => {
	if (status === 404) return { message: m.common_error_not_found() };
	console.error(`[${status}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: m.common_error_server() };
};
