import { json, error, isHttpError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSettings, updateSettings } from '$lib/server/db';
import type { PitchRange } from '$lib/types';

export const GET: RequestHandler = async () => {
	try {
		const settings = await getSettings();
		return json(settings);
	} catch (err) {
		console.error('Failed to get settings:', err);
		throw error(500, 'Failed to load settings');
	}
};

export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();

		// typeof NaN === 'number', and NaN sails through the clamp and the low < high
		// check below, so it has to be excluded explicitly.
		if (
			!body.targetRange ||
			!Number.isFinite(body.targetRange.low) ||
			!Number.isFinite(body.targetRange.high)
		) {
			throw error(400, 'Invalid targetRange: must have finite low and high values');
		}

		const targetRange: PitchRange = {
			low: Math.max(80, Math.min(400, body.targetRange.low)),
			high: Math.max(80, Math.min(400, body.targetRange.high))
		};

		// Ensure low is actually lower than high
		if (targetRange.low >= targetRange.high) {
			throw error(400, 'Invalid range: low must be less than high');
		}

		const updated = await updateSettings({ targetRange });
		return json(updated);
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('Failed to update settings:', err);
		throw error(500, 'Failed to update settings');
	}
};
