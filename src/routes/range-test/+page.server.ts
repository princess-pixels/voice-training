import { listRangeTests } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		history: await listRangeTests(30)
	};
};
