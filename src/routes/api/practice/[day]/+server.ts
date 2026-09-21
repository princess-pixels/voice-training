import { json, error } from '@sveltejs/kit';
import {
	getPracticeDay,
	resetPracticeDaySteps,
	sessionExists,
	updatePracticeStep
} from '$lib/server/db';
import { jsonBody, validated } from '$lib/server/http';
import { parseDayKey, parseStepUpdate } from '$lib/server/validate';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const day = await getPracticeDay(validated(() => parseDayKey(params.day)));
	if (!day) error(404, 'No practice recorded for that day');
	return json(day);
};

/**
 * Update one step: `{ step, status?, addSeconds?, sessionId? }`.
 * Days are created by opening the practice page, not here, so an unknown day is a 404.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const dayKey = validated(() => parseDayKey(params.day));
	const body = await jsonBody(request);
	const { index, update } = validated(() => parseStepUpdate(body));
	// Well-formed is not enough: a step must only ever point at a take that exists.
	if (update.sessionId && !(await sessionExists(update.sessionId))) {
		error(400, 'sessionId does not refer to a saved session');
	}

	let day;
	try {
		day = await updatePracticeStep(dayKey, index, update);
	} catch (err) {
		if (err instanceof RangeError) error(400, err.message);
		throw err;
	}
	if (!day) error(404, 'No practice recorded for that day');
	return json(day);
};

/** Put every step back to pending. Time spent and recordings stay on the record. */
export const POST: RequestHandler = async ({ params, url }) => {
	if (url.searchParams.get('action') !== 'reset') error(400, 'Unknown action');
	const day = await resetPracticeDaySteps(validated(() => parseDayKey(params.day)));
	if (!day) error(404, 'No practice recorded for that day');
	return json(day);
};
