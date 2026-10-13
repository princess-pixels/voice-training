import type { HandleClientError } from '@sveltejs/kit';
import { m } from '$lib/paraglide/messages';

// The browser's side of hooks.server.ts handleError: a client-side navigation
// to an unknown path, or an error thrown in a universal load, would otherwise
// reach the error page as SvelteKit's English "Not Found" / "Internal Error".
export const handleError: HandleClientError = ({ error, status }) => {
	if (status === 404) return { message: m.common_error_not_found() };
	console.error(error);
	return { message: m.common_error_generic() };
};
