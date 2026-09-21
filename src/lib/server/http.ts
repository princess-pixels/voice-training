import { error } from '@sveltejs/kit';
import { readJson, ValidationError } from './validate';

/**
 * The one place a ValidationError becomes an HTTP error. Routes wrap their
 * parsing in this and stay ten-line adapters; the rules and their messages
 * live in validate.ts, where they are tested without a server.
 */
export function validated<T>(fn: () => T): T {
	try {
		return fn();
	} catch (err) {
		if (err instanceof ValidationError) error(err.status, err.message);
		throw err;
	}
}

/** The request body as JSON, or a 400. */
export async function jsonBody(request: Request): Promise<unknown> {
	try {
		return await readJson(request);
	} catch (err) {
		if (err instanceof ValidationError) error(err.status, err.message);
		throw err;
	}
}
