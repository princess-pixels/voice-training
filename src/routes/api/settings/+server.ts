import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, updateSettings } from '$lib/server/db';
import { jsonBody, validated } from '$lib/server/http';
import { parseSettingsBody } from '$lib/server/validate';

export const GET: RequestHandler = async () => json(await getSettings());

/** `{ targetRange: { low, high } }`, clamped to what the app can display. */
export const PUT: RequestHandler = async ({ request }) => {
	const body = await jsonBody(request);
	const fields = validated(() => parseSettingsBody(body));
	return json(await updateSettings(fields));
};
