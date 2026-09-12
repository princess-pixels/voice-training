import type { PageServerLoad } from './$types';
import { getDashboardStats, getSettings } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const [stats, settings] = await Promise.all([getDashboardStats(), getSettings()]);
	return { stats, settings };
};
