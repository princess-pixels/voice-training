import { json, error } from '@sveltejs/kit';
import { createRangeTest, deleteRangeTest, updateRangeTestMode } from '$lib/server/db';
import { jsonBody, validated } from '$lib/server/http';
import { parseMode, parseRangeTestBody } from '$lib/server/validate';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await jsonBody(request);
	const fields = validated(() => parseRangeTestBody(body));
	const test = await createRangeTest({ ...fields, createdAt: new Date() });
	return json(test, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request, url }) => {
	const id = url.searchParams.get('id');
	if (!id) error(400, 'id query parameter is required');

	const body = await jsonBody(request);
	const mode = validated(() => parseMode((body as { mode?: unknown } | null)?.mode));
	const updated = await updateRangeTestMode(id, mode);
	if (!updated) error(404, 'Range test not found');
	return json(updated);
};

export const DELETE: RequestHandler = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) error(400, 'id query parameter is required');

	const deleted = await deleteRangeTest(id);
	if (!deleted) error(404, 'Range test not found');
	return json({ ok: true });
};
