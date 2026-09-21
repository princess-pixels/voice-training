import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localDayKey } from '$lib/days';

/**
 * The built server, end to end: `bun ./build/index.js` on a free port with a
 * temp DATA_DIR, driven over HTTP. Everything here is behaviour only the
 * production stack shows (the adapter, hooks.server.ts, the CSP nonces, the
 * body limit, the multipart parser, streaming), which the unit tests cannot
 * reach and which is where the Sept 3 audit's production-only bugs lived.
 *
 * Skipped when there is no build; CI builds first so it runs with the rest.
 * It runs inside the normal `bun test`, not alone: bunfig's per-file coverage
 * threshold would fail a lone run that imports one small module.
 */

const BUILD = 'build/index.js';
const hasBuild = existsSync(BUILD);

let proc: ReturnType<typeof Bun.spawn> | null = null;
let dataDir = '';
let port = 0;
let origin = '';

const BODY_SIZE_LIMIT = '2M';

async function freePort(): Promise<number> {
	const server = Bun.serve({ port: 0, fetch: () => new Response('') });
	const chosen = server.port!;
	await server.stop(true);
	return chosen;
}

async function waitForServer(): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${origin}/api/settings`);
			if (res.ok) return;
		} catch {
			// not up yet
		}
		await Bun.sleep(100);
	}
	throw new Error(`server did not come up on ${origin}`);
}

beforeAll(async () => {
	if (!hasBuild) return;
	dataDir = await mkdtemp(join(tmpdir(), 'voice-training-server-test-'));
	port = await freePort();
	origin = `http://127.0.0.1:${port}`;
	proc = Bun.spawn(['bun', `./${BUILD}`], {
		env: {
			...process.env,
			DATA_DIR: dataDir,
			PORT: String(port),
			HOST: '127.0.0.1',
			ORIGIN: origin,
			BODY_SIZE_LIMIT,
			OPEN: '0'
		},
		stdout: 'ignore',
		stderr: 'pipe'
	});
	await waitForServer();
});

afterAll(async () => {
	proc?.kill();
	await proc?.exited;
	if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

/** A multipart take with a tiny recording, as the studio posts it. */
function takeForm(over: Record<string, string | Blob> = {}): FormData {
	const form = new FormData();
	form.set('title', 'Server test take');
	form.set(
		'pitchData',
		JSON.stringify({
			points: [
				{ t: 0, hz: 200, confidence: 0.9 },
				{ t: 0.025, hz: 210, confidence: 0.9 }
			]
		})
	);
	form.set('targetRange', JSON.stringify({ low: 180, high: 300 }));
	form.set('duration', '12');
	form.set(
		'audio',
		new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], { type: 'audio/webm' }),
		'session.webm'
	);
	form.set('audioType', 'audio/webm');
	for (const [k, v] of Object.entries(over)) form.set(k, v);
	return form;
}

const sameOrigin = (init: RequestInit = {}): RequestInit => ({
	...init,
	headers: { ...(init.headers as Record<string, string>), Origin: origin }
});

/** One raw HTTP/1.1 request, so the Host header can be anything at all. */
function rawRequest(host: string, path = '/'): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const socket = connect(port, '127.0.0.1', () => {
			socket.write(`GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
		});
		let data = '';
		socket.on('data', (chunk) => (data += chunk.toString()));
		socket.on('end', () => {
			const status = Number(data.split(' ')[1]);
			resolve({ status, body: data.split('\r\n\r\n').slice(1).join('\r\n\r\n') });
		});
		socket.on('error', reject);
	});
}

describe.skipIf(!hasBuild)('built server', () => {
	test('serves the dashboard with a nonce CSP and the hardening headers', async () => {
		const res = await fetch(`${origin}/`);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain('<title>Dashboard — Voice Training</title>');
		expect(res.headers.get('content-security-policy')).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('permissions-policy')).toContain('microphone=(self)');
	});

	test('answers only to loopback and the ORIGIN hostname', async () => {
		expect((await rawRequest(`127.0.0.1:${port}`, '/api/settings')).status).toBe(200);
		expect((await rawRequest('localhost', '/api/settings')).status).toBe(200);
		const rebinding = await rawRequest('attacker.example', '/api/settings');
		expect(rebinding.status).toBe(403);
		expect(rebinding.body).toContain('is not allowed');
	});

	test('the error page renders inside the app for an unknown route and a stale take', async () => {
		const missing = await fetch(`${origin}/nowhere`);
		expect(missing.status).toBe(404);
		const html = await missing.text();
		expect(html).toContain('There is nothing at this address');
		expect(html).toContain('<title>Not found — Voice Training</title>');

		const stale = await fetch(`${origin}/sessions/01920b6e-4c8a-7d4e-9a1b-3c2d1e0f9a8b`);
		expect(stale.status).toBe(404);
		expect(await stale.text()).toContain('That recording is not here any more');
	});

	test('rejects a cross-site upload and a body over the limit', async () => {
		const crossSite = await fetch(`${origin}/api/sessions`, { method: 'POST', body: takeForm() });
		expect(crossSite.status).toBe(403);

		const big = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'audio/webm' });
		const tooBig = await fetch(
			`${origin}/api/sessions`,
			sameOrigin({ method: 'POST', body: takeForm({ audio: big }) })
		);
		expect(tooBig.status).toBe(413);
	});

	test('validation answers 400 with the message, not 500', async () => {
		const put = (body: string) =>
			fetch(`${origin}/api/settings`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body
			});
		for (const body of ['null', '"x"', '{ nope', '{"targetRange":{"low":"a","high":2}}']) {
			const res = await put(body);
			expect(res.status).toBe(400);
			expect((await res.json()).message).toBeString();
		}
		const missingTitle = await fetch(
			`${origin}/api/sessions`,
			sameOrigin({ method: 'POST', body: takeForm({ title: '' }) })
		);
		expect(missingTitle.status).toBe(400);
		expect((await missingTitle.json()).message).toBe('Title is required');
	});

	test('a take round-trips: multipart upload, ranged playback, listing, delete', async () => {
		const saved = await fetch(
			`${origin}/api/sessions`,
			sameOrigin({ method: 'POST', body: takeForm() })
		);
		expect(saved.status).toBe(200);
		const { id, session } = await saved.json();
		expect(session.pitchData.avgPitch).toBe(205);
		expect(session.pitchData.medianPitch).toBe(200);
		expect(session.audioType).toBe('audio/webm');

		const whole = await fetch(`${origin}/api/sessions/${id}/audio`);
		expect(whole.status).toBe(200);
		expect(whole.headers.get('content-type')).toBe('audio/webm');
		expect(whole.headers.get('accept-ranges')).toBe('bytes');
		expect(new Uint8Array(await whole.arrayBuffer())).toEqual(
			new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
		);

		const partial = await fetch(`${origin}/api/sessions/${id}/audio`, {
			headers: { Range: 'bytes=2-4' }
		});
		expect(partial.status).toBe(206);
		expect(partial.headers.get('content-range')).toBe('bytes 2-4/8');
		expect(new Uint8Array(await partial.arrayBuffer())).toEqual(new Uint8Array([3, 4, 5]));

		const beyond = await fetch(`${origin}/api/sessions/${id}/audio`, {
			headers: { Range: 'bytes=99-' }
		});
		expect(beyond.status).toBe(416);
		expect(beyond.headers.get('content-range')).toBe('bytes */8');

		const detail = await fetch(`${origin}/api/sessions/${id}`);
		expect(detail.status).toBe(200);
		expect((await detail.json()).title).toBe('Server test take');

		const gone = await fetch(`${origin}/api/sessions/${id}`, sameOrigin({ method: 'DELETE' }));
		expect(gone.status).toBe(200);
		expect((await fetch(`${origin}/api/sessions/${id}/audio`)).status).toBe(404);
	});

	test('an HTML part with no audioType is stored and served as audio', async () => {
		// Bun's multipart parser guesses text/html from the filename; the audio
		// route must never echo that on the app's own origin.
		const form = takeForm({ audio: new Blob(['<script>1</script>'], { type: 'text/html' }) });
		form.delete('audioType');
		form.set('audio', form.get('audio') as Blob, 'x.html');
		const saved = await fetch(`${origin}/api/sessions`, sameOrigin({ method: 'POST', body: form }));
		expect(saved.status).toBe(200);
		const { id, session } = await saved.json();
		expect(session.audioType).toBe('audio/webm');
		const res = await fetch(`${origin}/api/sessions/${id}/audio`);
		expect(res.headers.get('content-type')).toMatch(/^audio\//);
	});

	test("today's practice is created by the page and updated by PATCH", async () => {
		const page = await fetch(`${origin}/practice`);
		expect(page.status).toBe(200);
		const day = localDayKey(new Date());

		const res = await fetch(`${origin}/api/practice/${day}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ step: 0, status: 'done', addSeconds: 61.5 })
		});
		expect(res.status).toBe(200);
		const updated = await res.json();
		expect(updated._id).toBe(day);
		expect(updated.steps[0].status).toBe('done');
		expect(updated.steps[0].seconds).toBe(61);

		const bad = await fetch(`${origin}/api/practice/${day}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ step: 99, status: 'done' })
		});
		expect(bad.status).toBe(400);
		expect((await fetch(`${origin}/api/practice/2020-01-01`)).status).toBe(404);
		expect((await fetch(`${origin}/api/practice/today`)).status).toBe(400);
	});

	test('range tests are created and relabelled', async () => {
		const created = await fetch(`${origin}/api/range-tests`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ lowHz: 100, highHz: 300, mode: 'modal', semitones: 1 })
		});
		expect(created.status).toBe(201);
		const test = await created.json();
		expect(test.semitones).toBeCloseTo(19.02, 1);
		const relabelled = await fetch(`${origin}/api/range-tests?id=${test._id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ mode: 'full' })
		});
		expect((await relabelled.json()).mode).toBe('full');
	});

	test('export is a same-origin POST that streams a gzip archive named for today', async () => {
		// A GET, or a POST from another origin, must not make the server pack the library.
		expect((await fetch(`${origin}/api/export`)).status).toBe(405);
		const crossSite = await fetch(`${origin}/api/export`, {
			method: 'POST',
			headers: {
				Origin: 'https://evil.example',
				'content-type': 'application/x-www-form-urlencoded'
			},
			body: ''
		});
		expect(crossSite.status).toBe(403);

		const res = await fetch(
			`${origin}/api/export`,
			sameOrigin({
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: ''
			})
		);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/gzip');
		expect(res.headers.get('content-disposition')).toBe(
			`attachment; filename="voice-training-export-${localDayKey(new Date())}.tar.gz"`
		);
		const bytes = new Uint8Array(await res.arrayBuffer());
		expect(bytes.length).toBeGreaterThan(100);
		expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
	});
});
