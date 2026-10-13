import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';

process.env.DATA_DIR = ':memory:';

const { closeDatabase, listExercises, migrateDatabase } = await import('./db');
const { exercises, seedExercises } = await import('./exercises');

beforeEach(async () => {
	closeDatabase();
	await migrateDatabase();
});
afterEach(() => closeDatabase());

test('seeding adds the library once, then keeps it in step without duplicating', async () => {
	const log = spyOn(console, 'log').mockImplementation(() => {});
	try {
		await seedExercises();
		expect(log).toHaveBeenLastCalledWith(
			`Exercise library synced: ${exercises.length} added, 0 updated`
		);
		const first = await listExercises();
		expect(first).toHaveLength(exercises.length);

		await seedExercises();
		expect(log).toHaveBeenLastCalledWith(
			`Exercise library up to date (${exercises.length} exercises)`
		);
		// Same rows, same ids: sessions point at exercises by id.
		const second = await listExercises();
		expect(second.map((e) => e._id).sort()).toEqual(first.map((e) => e._id).sort());
	} finally {
		log.mockRestore();
	}
});
