import { describe, expect, test } from 'bun:test';
import { hostPolicy, hostnameOf, isAllowedHost } from './host';

describe('hostPolicy', () => {
	test('takes the hostname of ORIGIN, port and scheme dropped', () => {
		expect(hostPolicy({ ORIGIN: 'https://voice.example:8443' }).hostnames).toEqual(
			new Set(['voice.example'])
		);
		expect(hostPolicy({ ORIGIN: 'http://localhost:3000' }).hostnames).toEqual(
			new Set(['localhost'])
		);
	});

	test('no ORIGIN, blank or unparsable ORIGIN means loopback only', () => {
		expect(hostPolicy({}).hostnames.size).toBe(0);
		expect(hostPolicy({ ORIGIN: '  ' }).hostnames.size).toBe(0);
		expect(hostPolicy({ ORIGIN: 'http://' }).hostnames.size).toBe(0);
	});

	test('HOST_HEADER trusts the proxy', () => {
		expect(hostPolicy({ HOST_HEADER: 'x-forwarded-host' }).trustProxy).toBe(true);
		expect(hostPolicy({ HOST_HEADER: '' }).trustProxy).toBe(false);
		expect(hostPolicy({}).trustProxy).toBe(false);
	});
});

describe('hostnameOf', () => {
	test('reads a Host header with or without a port', () => {
		expect(hostnameOf('localhost:3000')).toBe('localhost');
		expect(hostnameOf('Voice.Example')).toBe('voice.example');
		expect(hostnameOf('[::1]:3000')).toBe('[::1]');
		expect(hostnameOf('192.168.1.5:3000')).toBe('192.168.1.5');
	});

	test('reads an origin', () => {
		expect(hostnameOf('https://voice.example')).toBe('voice.example');
	});

	test('rejects garbage', () => {
		expect(hostnameOf('')).toBeNull();
		expect(hostnameOf('   ')).toBeNull();
		expect(hostnameOf('a b')).toBeNull();
	});
});

describe('isAllowedHost', () => {
	const policy = hostPolicy({ ORIGIN: 'https://voice.example' });

	test('loopback on any port', () => {
		for (const host of ['localhost', 'localhost:3000', '127.0.0.1:5173', '[::1]:3000']) {
			expect(isAllowedHost(host, policy)).toBe(true);
		}
	});

	test('the ORIGIN hostname, any port, any case', () => {
		expect(isAllowedHost('voice.example', policy)).toBe(true);
		expect(isAllowedHost('VOICE.example:443', policy)).toBe(true);
	});

	test('anything else, including a missing or malformed header', () => {
		expect(isAllowedHost('attacker.example', policy)).toBe(false);
		expect(isAllowedHost('attacker.example:3000', policy)).toBe(false);
		expect(isAllowedHost('192.168.1.5:3000', policy)).toBe(false);
		expect(isAllowedHost(null, policy)).toBe(false);
		expect(isAllowedHost('', policy)).toBe(false);
	});

	test('a trusted proxy header turns the check off', () => {
		const trusting = hostPolicy({ HOST_HEADER: 'x-forwarded-host' });
		expect(isAllowedHost('attacker.example', trusting)).toBe(true);
		expect(isAllowedHost(null, trusting)).toBe(true);
	});
});
