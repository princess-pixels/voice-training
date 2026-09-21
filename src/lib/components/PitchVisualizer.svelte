<script lang="ts">
	import type { PitchPoint, PitchRange } from '$lib/types';
	import { DEFAULT_TARGET_RANGE, noteFromHz, pitchBand, pitchBandColor } from '$lib/audio/utils';

	interface Props {
		mode: 'live' | 'playback';
		/** Live: the recent window of points. Playback: the whole session, ordered by time. */
		pitchData?: PitchPoint[];
		targetRange?: PitchRange;
		currentPitch?: number;
		currentTime?: number;
		height?: number;
		/** A note to draw as a horizontal line, e.g. the one chosen on the reference strip. */
		referenceHz?: number | null;
	}

	let {
		mode,
		pitchData = [],
		targetRange = DEFAULT_TARGET_RANGE,
		currentPitch = 0,
		currentTime = 0,
		height = 300,
		referenceHz = null
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let container: HTMLDivElement;
	let containerWidth = $state(0);

	// Frequency range
	const MIN_FREQ = 50;
	const MAX_FREQ = 500;
	const GRID_FREQS = [100, 150, 180, 200, 250, 300, 350];

	// Live mode: show last 10 seconds
	const LIVE_WINDOW_SECONDS = 10;

	const MARGIN = { left: 50, right: 20, top: 20, bottom: 30 };

	interface Layout {
		width: number;
		height: number;
		graphWidth: number;
		graphHeight: number;
		minTime: number;
		timeRange: number;
	}

	// Last applied backing-store size. Setting canvas.width reallocates the
	// bitmap and resets the context, so it only happens when these change.
	let appliedWidth = 0;
	let appliedHeight = 0;
	let appliedDpr = 0;

	// Playback: everything except the cursor is rendered once to an offscreen
	// canvas, so a timeupdate only costs one drawImage plus the cursor.
	let staticLayer: HTMLCanvasElement | null = null;
	// `source` is the prop array the layer was built from; `points` its voiced
	// subset and `timeRange` its extent, kept so a timeupdate (up to 60 a
	// second) does not filter and scan up to 200k points again.
	let staticFor: {
		source: PitchPoint[];
		points: PitchPoint[];
		timeRange: number;
		low: number;
		high: number;
	} | null = null;

	// Resize observer to handle responsive sizing
	$effect(() => {
		if (!container) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerWidth = entry.contentRect.width;
			}
		});

		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	});

	function freqToY(layout: Layout, freq: number): number {
		const clampedFreq = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
		const ratio = (clampedFreq - MIN_FREQ) / (MAX_FREQ - MIN_FREQ);
		return MARGIN.top + layout.graphHeight - ratio * layout.graphHeight;
	}

	function timeToX(layout: Layout, t: number): number {
		const ratio = (t - layout.minTime) / layout.timeRange;
		return MARGIN.left + ratio * layout.graphWidth;
	}

	/** Largest timestamp, without spreading the array into Math.max. */
	function lastTime(points: PitchPoint[]): number {
		let max = 0;
		for (const p of points) if (p.t > max) max = p.t;
		return max;
	}

	/** The voiced point nearest to `t` if it is within 0.1 s. Points are ordered by time. */
	function pointNear(points: PitchPoint[], t: number): PitchPoint | null {
		if (points.length === 0) return null;
		let lo = 0;
		let hi = points.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (points[mid].t < t) lo = mid + 1;
			else hi = mid;
		}
		const after = points[lo];
		const before = lo > 0 ? points[lo - 1] : after;
		const nearest = Math.abs(after.t - t) < Math.abs(before.t - t) ? after : before;
		return Math.abs(nearest.t - t) < 0.1 ? nearest : null;
	}

	/** Background, target band, grid, axes, the pitch line and the label: everything that is not the cursor. */
	// The detector hops every 25 ms; four missed hops in a row is silence, not jitter.
	const MAX_GAP_SECONDS = 0.1;

	function drawStatic(ctx: CanvasRenderingContext2D, layout: Layout, points: PitchPoint[]) {
		ctx.clearRect(0, 0, layout.width, layout.height);
		ctx.fillStyle = '#171717'; // surface-900
		ctx.fillRect(0, 0, layout.width, layout.height);

		// Target range band
		const targetY1 = freqToY(layout, targetRange.high);
		const targetY2 = freqToY(layout, targetRange.low);
		ctx.fillStyle = 'rgba(236, 72, 153, 0.15)'; // primary-500 with low opacity
		ctx.fillRect(MARGIN.left, targetY1, layout.graphWidth, targetY2 - targetY1);

		// Grid lines and Y-axis labels
		ctx.strokeStyle = '#404040'; // surface-700
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.fillStyle = '#a3a3a3'; // surface-400
		ctx.font = '11px Inter, system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'middle';
		for (const freq of GRID_FREQS) {
			const y = freqToY(layout, freq);
			ctx.beginPath();
			ctx.moveTo(MARGIN.left, y);
			ctx.lineTo(MARGIN.left + layout.graphWidth, y);
			ctx.stroke();
			ctx.fillText(`${freq}`, MARGIN.left - 8, y);
		}
		ctx.setLineDash([]);

		// Axes
		ctx.strokeStyle = '#525252'; // surface-600
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(MARGIN.left, MARGIN.top);
		ctx.lineTo(MARGIN.left, MARGIN.top + layout.graphHeight);
		ctx.moveTo(MARGIN.left, MARGIN.top + layout.graphHeight);
		ctx.lineTo(MARGIN.left + layout.graphWidth, MARGIN.top + layout.graphHeight);
		ctx.stroke();

		// Pitch line, coloured by where it sits against the target range.
		// Consecutive segments of the same
		// colour go into one path; stroking each segment on its own cost one
		// draw call per point.
		ctx.lineWidth = 2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		let runCategory: string | null = null;
		for (let i = 0; i < points.length - 1; i++) {
			const p1 = points[i];
			const p2 = points[i + 1];
			// Only voiced frames are stored, so a gap wider than a few hops is a
			// breath or a pause. End the run there rather than drawing a straight
			// line across the silence, coloured by neither side.
			if (p2.t - p1.t > MAX_GAP_SECONDS) {
				if (runCategory !== null) ctx.stroke();
				runCategory = null;
				continue;
			}
			const category = pitchBand((p1.hz + p2.hz) / 2, targetRange);
			if (category !== runCategory) {
				if (runCategory !== null) ctx.stroke();
				ctx.strokeStyle = pitchBandColor(category);
				ctx.beginPath();
				ctx.moveTo(timeToX(layout, p1.t), freqToY(layout, p1.hz));
				runCategory = category;
			}
			ctx.lineTo(timeToX(layout, p2.t), freqToY(layout, p2.hz));
		}
		if (runCategory !== null) ctx.stroke();

		// Target range label
		ctx.fillStyle = '#ec4899'; // full-alpha pink: the 70% version fell under 4.5:1
		ctx.font = '10px Inter, system-ui, sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'bottom';
		ctx.fillText(
			`Target: ${targetRange.low}-${targetRange.high} Hz`,
			MARGIN.left + 4,
			freqToY(layout, targetRange.low) - 2
		);
	}

	/** The reference note: a solid line across the graph with its name at the right edge. */
	function drawReference(ctx: CanvasRenderingContext2D, layout: Layout) {
		if (!referenceHz || referenceHz <= 0) return;
		const y = freqToY(layout, referenceHz);
		ctx.strokeStyle = '#c084fc'; // accent-400
		ctx.lineWidth = 1.5;
		ctx.beginPath();
		ctx.moveTo(MARGIN.left, y);
		ctx.lineTo(MARGIN.left + layout.graphWidth, y);
		ctx.stroke();

		ctx.fillStyle = '#c084fc';
		ctx.font = 'bold 10px Inter, system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.textBaseline = 'bottom';
		ctx.fillText(
			`${noteFromHz(referenceHz)} · ${Math.round(referenceHz)} Hz`,
			MARGIN.left + layout.graphWidth - 4,
			y - 3
		);
	}

	function drawLiveDot(ctx: CanvasRenderingContext2D, layout: Layout) {
		const x = MARGIN.left + layout.graphWidth; // Right edge
		const y = freqToY(layout, currentPitch);
		const color = pitchBandColor(pitchBand(currentPitch, targetRange));

		// Glow effect
		const gradient = ctx.createRadialGradient(x, y, 0, x, y, 12);
		gradient.addColorStop(0, color);
		gradient.addColorStop(1, 'transparent');
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(x, y, 12, 0, Math.PI * 2);
		ctx.fill();

		// Center dot
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(x, y, 4, 0, Math.PI * 2);
		ctx.fill();
	}

	function drawCursor(ctx: CanvasRenderingContext2D, layout: Layout, points: PitchPoint[]) {
		const x = timeToX(layout, currentTime);

		ctx.strokeStyle = '#ec4899'; // primary-500
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 4]);
		ctx.beginPath();
		ctx.moveTo(x, MARGIN.top);
		ctx.lineTo(x, MARGIN.top + layout.graphHeight);
		ctx.stroke();
		ctx.setLineDash([]);

		const currentPoint = pointNear(points, currentTime);
		if (currentPoint) {
			ctx.fillStyle = '#ec4899';
			ctx.beginPath();
			ctx.arc(x, freqToY(layout, currentPoint.hz), 6, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// Redraw when anything visible changes
	$effect(() => {
		if (!canvas || containerWidth === 0) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		if (containerWidth !== appliedWidth || height !== appliedHeight || dpr !== appliedDpr) {
			canvas.width = containerWidth * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${containerWidth}px`;
			canvas.style.height = `${height}px`;
			appliedWidth = containerWidth;
			appliedHeight = height;
			appliedDpr = dpr;
			staticLayer = null;
		}
		// setTransform rather than scale: the context keeps its transform across
		// redraws now that the bitmap is not reallocated every frame.
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const layout: Layout = {
			width: containerWidth,
			height,
			graphWidth: containerWidth - MARGIN.left - MARGIN.right,
			graphHeight: height - MARGIN.top - MARGIN.bottom,
			minTime: 0,
			timeRange: 1
		};

		if (mode === 'live') {
			const now = currentTime > 0 ? currentTime : lastTime(pitchData);
			layout.minTime = Math.max(0, now - LIVE_WINDOW_SECONDS);
			layout.timeRange = now - layout.minTime || 1;
			const points = pitchData.filter((p) => p.t >= layout.minTime && p.hz > 0);
			drawStatic(ctx, layout, points);
			drawReference(ctx, layout);
			if (currentPitch > 0) drawLiveDot(ctx, layout);
			return;
		}

		const samePoints = staticFor?.source === pitchData;
		const points = samePoints ? staticFor!.points : pitchData.filter((p) => p.hz > 0);
		layout.timeRange = samePoints ? staticFor!.timeRange : Math.max(lastTime(points), 1);

		const stale =
			!staticLayer ||
			!samePoints ||
			staticFor!.low !== targetRange.low ||
			staticFor!.high !== targetRange.high;
		if (stale) {
			staticLayer = document.createElement('canvas');
			staticLayer.width = canvas.width;
			staticLayer.height = canvas.height;
			const sctx = staticLayer.getContext('2d');
			if (!sctx) return;
			sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			drawStatic(sctx, layout, points);
			staticFor = {
				source: pitchData,
				points,
				timeRange: layout.timeRange,
				low: targetRange.low,
				high: targetRange.high
			};
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.drawImage(staticLayer!, 0, 0);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Drawn over the cached layer: it changes independently of the points.
		drawReference(ctx, layout);
		if (currentTime > 0) drawCursor(ctx, layout, points);
	});
</script>

<div
	bind:this={container}
	class="w-full rounded-lg overflow-hidden bg-surface-900 border border-surface-800"
>
	<!-- Fallback content is the canvas's accessible description. -->
	<canvas bind:this={canvas} class="block">
		{#if mode === 'live'}
			Live pitch graph. Current pitch {currentPitch > 0
				? `${Math.round(currentPitch)} Hz`
				: 'silent'}, target {targetRange.low} to {targetRange.high} Hz.
		{:else}
			Pitch timeline for the whole session, target {targetRange.low} to {targetRange.high} Hz.
		{/if}
	</canvas>
</div>
