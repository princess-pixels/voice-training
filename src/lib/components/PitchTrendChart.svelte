<script lang="ts">
	import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';
	import { pickDayLabelIndices } from '$lib/days';
	import { formatDayMonth } from '$lib/format';
	interface TrendPoint {
		date: Date;
		avgHz: number;
	}

	interface Props {
		trendData: TrendPoint[];
		targetRange?: { low: number; high: number };
	}

	let { trendData, targetRange = DEFAULT_TARGET_RANGE }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();
	let container: HTMLDivElement | undefined = $state();
	let canvasWidth = $state(0);

	// Chart dimensions
	const padding = { top: 20, right: 20, bottom: 40, left: 50 };
	const chartHeight = 250;

	// Y-axis range (Hz)
	const minHz = 100;
	const maxHz = 400;

	function drawChart() {
		if (!canvas || trendData.length === 0) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Set canvas size accounting for device pixel ratio
		const dpr = window.devicePixelRatio || 1;
		canvas.width = canvasWidth * dpr;
		canvas.height = chartHeight * dpr;
		ctx.scale(dpr, dpr);

		// Clear canvas
		ctx.clearRect(0, 0, canvasWidth, chartHeight);

		const chartW = canvasWidth - padding.left - padding.right;
		const chartH = chartHeight - padding.top - padding.bottom;

		// Draw grid lines
		ctx.strokeStyle = '#262626'; // surface-800
		ctx.lineWidth = 1;

		// Horizontal grid lines
		const ySteps = 5;
		for (let i = 0; i <= ySteps; i++) {
			const y = padding.top + (chartH * i) / ySteps;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(padding.left + chartW, y);
			ctx.stroke();
		}

		// Vertical grid lines
		const xSteps = Math.min(trendData.length - 1, 10);
		for (let i = 0; i <= xSteps; i++) {
			const x = padding.left + (chartW * i) / xSteps;
			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, padding.top + chartH);
			ctx.stroke();
		}

		// Draw target range band
		const targetY1 = padding.top + chartH - ((targetRange.high - minHz) / (maxHz - minHz)) * chartH;
		const targetY2 = padding.top + chartH - ((targetRange.low - minHz) / (maxHz - minHz)) * chartH;

		ctx.fillStyle = 'rgba(236, 72, 153, 0.15)'; // primary-500 with opacity
		ctx.fillRect(padding.left, targetY1, chartW, targetY2 - targetY1);

		// Draw target range labels
		ctx.fillStyle = '#ec4899'; // primary-500
		ctx.font = '10px Inter, system-ui, sans-serif';
		ctx.textAlign = 'right';
		ctx.fillText(`${targetRange.high} Hz`, padding.left - 8, targetY1 + 4);
		ctx.fillText(`${targetRange.low} Hz`, padding.left - 8, targetY2 + 4);

		// Calculate data points
		const points = trendData.map((d, i) => ({
			x: padding.left + (chartW * i) / (trendData.length - 1 || 1),
			y: padding.top + chartH - ((d.avgHz - minHz) / (maxHz - minHz)) * chartH,
			hz: d.avgHz
		}));

		// Draw line
		if (points.length > 1) {
			ctx.strokeStyle = '#ec4899'; // primary-500
			ctx.lineWidth = 2;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';

			ctx.beginPath();
			ctx.moveTo(points[0].x, points[0].y);

			for (let i = 1; i < points.length; i++) {
				ctx.lineTo(points[i].x, points[i].y);
			}

			ctx.stroke();

			// Draw gradient fill under the line
			const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
			gradient.addColorStop(0, 'rgba(236, 72, 153, 0.3)');
			gradient.addColorStop(1, 'rgba(236, 72, 153, 0)');

			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.moveTo(points[0].x, padding.top + chartH);
			for (let i = 0; i < points.length; i++) {
				ctx.lineTo(points[i].x, points[i].y);
			}
			ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
			ctx.closePath();
			ctx.fill();
		}

		// Draw data points
		for (const point of points) {
			ctx.fillStyle = '#ec4899';
			ctx.beginPath();
			ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = '#0a0a0a'; // surface-950
			ctx.beginPath();
			ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
			ctx.fill();
		}

		// Draw Y-axis labels
		ctx.fillStyle = '#8f8f8f'; // lifted from surface-500 to clear 4.5:1 on surface-900
		ctx.font = '11px Inter, system-ui, sans-serif';
		ctx.textAlign = 'right';

		for (let i = 0; i <= ySteps; i++) {
			const hz = Math.round(minHz + ((maxHz - minHz) * (ySteps - i)) / ySteps);
			const y = padding.top + (chartH * i) / ySteps;
			ctx.fillText(`${hz}`, padding.left - 8, y + 4);
		}

		// Draw X-axis labels (dates)
		ctx.textAlign = 'center';
		ctx.fillStyle = '#8f8f8f';

		// One label per day: several sessions on the same day would otherwise
		// repeat the date under each of them.
		const dates = trendData.map((d) => new Date(d.date));
		for (const index of pickDayLabelIndices(dates, 5)) {
			const x = padding.left + (chartW * index) / (trendData.length - 1 || 1);
			const date = dates[index];
			const label = formatDayMonth(date);
			ctx.fillText(label, x, padding.top + chartH + 20);
		}
	}

	// Redraw when data or size changes
	$effect(() => {
		if (canvas && canvasWidth > 0) {
			drawChart();
		}
	});

	// Handle resize
	$effect(() => {
		if (!container) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				canvasWidth = entry.contentRect.width;
			}
		});

		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	});
</script>

<div bind:this={container} class="w-full">
	{#if trendData.length > 0}
		<canvas bind:this={canvas} class="w-full" style="height: {chartHeight}px;">
			Average pitch over the last {trendData.length}
			{trendData.length === 1 ? 'session' : 'sessions'}: from {Math.round(trendData[0].avgHz)} Hz to {Math.round(
				trendData[trendData.length - 1].avgHz
			)} Hz, target {targetRange.low} to {targetRange.high}
			Hz.
		</canvas>
	{:else}
		<div class="flex items-center justify-center h-[250px] text-surface-500">
			<p>No pitch data available yet</p>
		</div>
	{/if}
</div>
