/**
 * Which `Host` headers this server answers. The adapter builds every request
 * URL from ORIGIN and never looks at the header again, so a page on
 * `attacker.example` whose DNS points at 127.0.0.1 (DNS rebinding) could
 * otherwise reach the JSON routes as if it were the app itself; the
 * cross-site check only covers form posts.
 *
 * Allowed: loopback names on any port, and the hostname of ORIGIN. With
 * HOST_HEADER set the proxy in front is trusted to route by name, and the
 * check is off.
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface HostPolicy {
	/** Hostnames (no port, lowercase) accepted besides loopback. */
	hostnames: Set<string>;
	/** True when a proxy header names the host; the raw header is then not checked. */
	trustProxy: boolean;
}

export function hostPolicy(env: Record<string, string | undefined>): HostPolicy {
	const hostnames = new Set<string>();
	const origin = env.ORIGIN?.trim();
	if (origin) {
		const hostname = hostnameOf(origin);
		if (hostname) hostnames.add(hostname);
	}
	return { hostnames, trustProxy: Boolean(env.HOST_HEADER?.trim()) };
}

/** The hostname part of a `Host` header or an origin; null if it does not parse. */
export function hostnameOf(hostOrOrigin: string): string | null {
	const value = hostOrOrigin.trim();
	if (!value) return null;
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`);
		return url.hostname.toLowerCase();
	} catch {
		return null;
	}
}

/** True if a request carrying this `Host` header may be answered. */
export function isAllowedHost(host: string | null, policy: HostPolicy): boolean {
	if (policy.trustProxy) return true;
	const hostname = host === null ? null : hostnameOf(host);
	if (!hostname) return false;
	return LOOPBACK.has(hostname) || policy.hostnames.has(hostname);
}
