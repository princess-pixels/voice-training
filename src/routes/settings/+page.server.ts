import type { PageServerLoad } from './$types';
import { getSettings } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const settings = await getSettings();
	return { settings };
};
