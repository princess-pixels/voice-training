import { json, error } from '@sveltejs/kit';
import {
	getPracticeDay,
	isValidId,
	resetPracticeDaySteps,
	sessionExists,
	updatePracticeStep
} from '$lib/server/db';
import { DAY_KEY, STEP_STATUSES, type StepUpdate } from '$lib/server/practice';
import type { PracticeStepStatus } from '$lib/types';
import type { RequestHandler } from './$types';

// Nobody spends longer than this on one step in one go; anything past it is a
// timer left running overnight, not practice.
const MAX_ADD_SECONDS = 4 * 60 * 60;

function parseDay(day: string): string {
	if (!DAY_KEY.test(day)) error(400, 'day must look like 2026-09-03');
	return day;
}

function parseUpdate(body: unknown): { index: number; update: StepUpdate } {
	const b = body as Record<string, unknown> | null;
	if (!b || typeof b !== 'object') error(400, 'JSON body required');

	const index = b.step;
	if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
		error(400, 'step must be a non-negative integer');
	}

	const update: StepUpdate = {};

	if (b.status !== undefined) {
		if (typeof b.status !== 'string' || !STEP_STATUSES.includes(b.status as PracticeStepStatus)) {
			error(400, `status must be one of: ${STEP_STATUSES.join(', ')}`);
		}
		update.status = b.status as PracticeStepStatus;
	}

	if (b.addSeconds !== undefined) {
		if (typeof b.addSeconds !== 'number' || !Number.isFinite(b.addSeconds) || b.addSeconds < 0) {
			error(400, 'addSeconds must be a non-negative number');
		}
		update.addSeconds = Math.min(MAX_ADD_SECONDS, Math.floor(b.addSeconds));
	}

	if (b.sessionId !== undefined) {
		if (typeof b.sessionId !== 'string' || !isValidId(b.sessionId)) {
			error(400, 'sessionId must be a session id');
		}
		update.sessionId = b.sessionId;
	}

	if (Object.keys(update).length === 0) {
		error(400, 'Nothing to update: give status, addSeconds or sessionId');
	}

	return { index, update };
}

export const GET: RequestHandler = async ({ params }) => {
	const day = await getPracticeDay(parseDay(params.day));
	if (!day) error(404, 'No practice recorded for that day');
	return json(day);
};

/**
 * Update one step: `{ step, status?, addSeconds?, sessionId? }`.
 * Days are created by opening the practice page, not here, so an unknown day is a 404.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const dayKey = parseDay(params.day);
	const { index, update } = parseUpdate(await request.json().catch(() => null));
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
	const day = await resetPracticeDaySteps(parseDay(params.day));
	if (!day) error(404, 'No practice recorded for that day');
	return json(day);
};
