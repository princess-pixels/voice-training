import { json, error } from '@sveltejs/kit';
import { createRangeTest, deleteRangeTest, updateRangeTestMode } from '$lib/server/db';
import { semitonesBetween } from '$lib/audio/utils';
import type { RangeTestMode } from '$lib/types';
import type { RequestHandler } from './$types';

const MODES: RangeTestMode[] = ['full', 'modal'];

function parseMode(value: unknown): RangeTestMode {
	if (typeof value !== 'string' || !MODES.includes(value as RangeTestMode)) {
		error(400, `mode must be one of: ${MODES.join(', ')}`);
	}
	return value as RangeTestMode;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);

	if (!body || typeof body.lowHz !== 'number' || typeof body.highHz !== 'number') {
		error(400, 'lowHz and highHz are required numbers');
	}

	const { lowHz, highHz } = body;

	if (!Number.isFinite(lowHz) || !Number.isFinite(highHz) || lowHz <= 0 || highHz <= 0) {
		error(400, 'lowHz and highHz must be positive');
	}

	if (highHz <= lowHz) {
		error(400, 'highHz must be greater than lowHz');
	}

	const test = await createRangeTest({
		mode: parseMode(body.mode),
		lowHz,
		highHz,
		// Recomputed server-side so the stored value always matches the stored bounds.
		semitones: semitonesBetween(lowHz, highHz),
		notes: typeof body.notes === 'string' ? body.notes : '',
		createdAt: new Date()
	});

	return json(test, { status: 201 });
};

export const PATCH: RequestHandler = async ({ request, url }) => {
	const id = url.searchParams.get('id');
	if (!id) error(400, 'id query parameter is required');

	const body = await request.json().catch(() => null);
	const updated = await updateRangeTestMode(id, parseMode(body?.mode));
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
