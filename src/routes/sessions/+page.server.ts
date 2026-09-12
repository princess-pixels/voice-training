import type { PageServerLoad } from './$types';
import { listSessions } from '$lib/server/db';

export const load: PageServerLoad = async ({ url, depends }) => {
	depends('app:sessions');
	// `?page=abc` or `?page=-3` would otherwise reach the database as a NaN or negative offset.
	const requested = Number(url.searchParams.get('page') ?? 1);
	const page = Number.isInteger(requested) && requested >= 1 ? requested : 1;
	const limit = 20;
	const { sessions, total } = await listSessions(page, limit);
	return { sessions, page, limit, total, totalPages: Math.ceil(total / limit) };
};
