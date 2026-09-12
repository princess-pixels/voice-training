import { describe, expect, test } from 'bun:test';
import { TonePlayer, type ToneContext } from './tone';

interface Event {
	kind: string;
	value?: number;
	time?: number;
}

/** A recording stand-in for the few AudioContext pieces the player touches. */
function fakeContext(initialState: AudioContextState = 'suspended') {
	const events: Event[] = [];
	let state = initialState;
	const param = (name: string) => {
		const p = { value: 0 } as unknown as AudioParam & { value: number };
		p.setValueAtTime = ((value: number, time: number) => {
			p.value = value;
			events.push({ kind: `${name}.set`, value, time });
			return p;
		}) as AudioParam['setValueAtTime'];
		p.linearRampToValueAtTime = ((value: number, time: number) => {
			p.value = value;
			events.push({ kind: `${name}.ramp`, value, time });
			return p;
		}) as AudioParam['linearRampToValueAtTime'];
		p.cancelScheduledValues = ((time: number) => {
			events.push({ kind: `${name}.cancel`, time });
			return p;
		}) as AudioParam['cancelScheduledValues'];
		return p;
	};
	const destination = {} as AudioDestinationNode;
	const ctx: ToneContext = {
		get currentTime() {
			return 1;
		},
		get state() {
			return state;
		},
		resume: async () => {
			state = 'running';
			events.push({ kind: 'resume' });
		},
		close: async () => {
			state = 'closed';
			events.push({ kind: 'close' });
		},
		createOscillator: () => {
			const osc = {
				type: 'sine',
				frequency: param('frequency'),
				connect: (target: unknown) => {
					events.push({ kind: 'osc.connect' });
					return target;
				},
				start: () => events.push({ kind: 'osc.start' }),
				stop: (time: number) => events.push({ kind: 'osc.stop', time })
			};
			events.push({ kind: 'createOscillator' });
			return osc as unknown as OscillatorNode;
		},
		createGain: () => {
			const gain = {
				gain: param('gain'),
				connect: (target: unknown) => {
					events.push({
						kind: target === destination ? 'gain.connect.destination' : 'gain.connect'
					});
					return target;
				}
			};
			return gain as unknown as GainNode;
		},
		destination
	};
	return { ctx, events, kinds: () => events.map((e) => e.kind) };
}

describe('TonePlayer', () => {
	test('resumes a suspended context, ramps in and starts the oscillator', async () => {
		const fake = fakeContext();
		const changes: boolean[] = [];
		const player = new TonePlayer({
			createContext: () => fake.ctx,
			onChange: (p) => changes.push(p),
			gain: 0.5,
			attackMs: 20
		});

		await player.play(220, null);

		expect(player.playing).toBe(true);
		expect(changes).toEqual([true]);
		expect(fake.kinds()).toEqual([
			'resume',
			'createOscillator',
			'gain.set',
			'gain.ramp',
			'osc.connect',
			'gain.connect.destination',
			'osc.start'
		]);
		const ramp = fake.events.find((e) => e.kind === 'gain.ramp');
		expect(ramp).toMatchObject({ value: 0.5, time: 1.02 });
		expect(fake.events.find((e) => e.kind === 'frequency.set')).toBeUndefined();
	});

	test('sets the frequency and uses a triangle wave', async () => {
		const fake = fakeContext('running');
		const created: OscillatorNode[] = [];
		const original = fake.ctx.createOscillator;
		fake.ctx.createOscillator = () => {
			const osc = original();
			created.push(osc);
			return osc;
		};
		const player = new TonePlayer({ createContext: () => fake.ctx });
		await player.play(196, null);
		expect(created[0].type).toBe('triangle');
		expect(created[0].frequency.value).toBe(196);
		expect(fake.kinds()).not.toContain('resume');
	});

	test('stop releases with a ramp and schedules the oscillator stop', async () => {
		const fake = fakeContext('running');
		const changes: boolean[] = [];
		const player = new TonePlayer({
			createContext: () => fake.ctx,
			onChange: (p) => changes.push(p),
			releaseMs: 100
		});
		await player.play(220, null);
		player.stop();

		expect(player.playing).toBe(false);
		expect(changes).toEqual([true, false]);
		const tail = fake.kinds().slice(-4);
		expect(tail).toEqual(['gain.cancel', 'gain.set', 'gain.ramp', 'osc.stop']);
		expect(fake.events[fake.events.length - 1]).toMatchObject({ time: 1.1 });
		expect(fake.events[fake.events.length - 2]).toMatchObject({ value: 0, time: 1.1 });
	});

	test('stop is a no-op when nothing is playing', () => {
		const fake = fakeContext();
		const changes: boolean[] = [];
		const player = new TonePlayer({
			createContext: () => fake.ctx,
			onChange: (p) => changes.push(p)
		});
		player.stop();
		expect(fake.events).toEqual([]);
		expect(changes).toEqual([]);
	});

	test('a blip stops itself after its duration', async () => {
		const fake = fakeContext('running');
		const player = new TonePlayer({ createContext: () => fake.ctx });
		await player.play(220, 10);
		expect(player.playing).toBe(true);
		await new Promise((r) => setTimeout(r, 40));
		expect(player.playing).toBe(false);
		expect(fake.kinds()).toContain('osc.stop');
	});

	test('playing a second note releases the first and cancels its timer', async () => {
		const fake = fakeContext('running');
		const player = new TonePlayer({ createContext: () => fake.ctx });
		await player.play(220, 10);
		await player.play(247, null);
		expect(fake.kinds().filter((k) => k === 'osc.stop')).toHaveLength(1);
		expect(fake.kinds().filter((k) => k === 'createOscillator')).toHaveLength(2);
		// The first note's timer must not stop the second note.
		await new Promise((r) => setTimeout(r, 40));
		expect(player.playing).toBe(true);
	});

	test('ignores a silent or invalid frequency', async () => {
		const fake = fakeContext();
		const player = new TonePlayer({ createContext: () => fake.ctx });
		await player.play(0);
		await player.play(NaN);
		expect(fake.events).toEqual([]);
		expect(player.playing).toBe(false);
	});

	test('reuses one context across notes', async () => {
		let created = 0;
		const fake = fakeContext('running');
		const player = new TonePlayer({
			createContext: () => {
				created++;
				return fake.ctx;
			}
		});
		await player.play(220, null);
		await player.play(233, null);
		expect(created).toBe(1);
	});

	test('destroy stops the tone and closes the context once', async () => {
		const fake = fakeContext('running');
		const player = new TonePlayer({ createContext: () => fake.ctx });
		await player.play(220, null);
		player.destroy();
		player.destroy();
		expect(player.playing).toBe(false);
		expect(fake.kinds().filter((k) => k === 'close')).toHaveLength(1);
	});

	test('defaults to the page AudioContext', async () => {
		const fake = fakeContext('running');
		const g = globalThis as { AudioContext?: unknown };
		const saved = g.AudioContext;
		g.AudioContext = class {
			constructor() {
				return fake.ctx;
			}
		};
		try {
			const player = new TonePlayer();
			await player.play(220, null);
			expect(fake.kinds()).toContain('osc.start');
		} finally {
			g.AudioContext = saved;
		}
	});

	test('destroy without a context is harmless', () => {
		const player = new TonePlayer({ createContext: () => fakeContext().ctx });
		expect(() => player.destroy()).not.toThrow();
	});
});
