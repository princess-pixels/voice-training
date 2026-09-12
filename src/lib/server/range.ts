/**
 * HTTP Range header parsing for single byte ranges (RFC 9110 §14).
 *
 * The <audio> element sends `bytes=0-` to probe, then arbitrary `bytes=a-b`
 * while scrubbing. Multi-range requests are not something browsers send for
 * media, so they are treated as unsatisfiable rather than half-supported.
 */

export interface ByteRange {
	/** First byte, inclusive. */
	start: number;
	/** Last byte, inclusive. */
	end: number;
}

export type RangeResult =
	{ kind: 'full' } | { kind: 'partial'; range: ByteRange } | { kind: 'unsatisfiable' };

export function parseRange(header: string | null, size: number): RangeResult {
	if (!header) return { kind: 'full' };

	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return { kind: 'unsatisfiable' };

	const [, startText, endText] = match;
	if (startText === '' && endText === '') return { kind: 'unsatisfiable' };
	if (size === 0) return { kind: 'unsatisfiable' };

	// Suffix form: bytes=-500 means the last 500 bytes.
	if (startText === '') {
		const suffix = Number(endText);
		if (suffix === 0) return { kind: 'unsatisfiable' };
		return { kind: 'partial', range: { start: Math.max(0, size - suffix), end: size - 1 } };
	}

	const start = Number(startText);
	if (start >= size) return { kind: 'unsatisfiable' };

	const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
	if (end < start) return { kind: 'unsatisfiable' };

	return { kind: 'partial', range: { start, end } };
}
