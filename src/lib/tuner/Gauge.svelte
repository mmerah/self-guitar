<script lang="ts">
	import { centsTone, IN_TUNE_CENTS } from './tunings';

	/** `cents` null = no reading: no needle and nothing green. */
	let { cents, dim = false }: { cents: number | null; dim?: boolean } = $props();

	const CX = 120;
	const CY = 128;
	const R = 104;
	const SWEEP = 70; // degrees either side for ±50 cents

	const angle = (c: number) => (Math.max(-50, Math.min(50, c)) / 50) * SWEEP;
	const point = (deg: number, r: number) => {
		const rad = ((deg - 90) * Math.PI) / 180;
		return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)];
	};
	function arc(from: number, to: number, r: number) {
		const [x1, y1] = point(from, r);
		const [x2, y2] = point(to, r);
		return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`;
	}
	const ticks = Array.from({ length: 11 }, (_, i) => -50 + i * 10);
	const zone = angle(IN_TUNE_CENTS);
	const color = $derived(cents === null ? 'var(--muted)' : `var(--${centsTone(cents)})`);
	const inTune = $derived(cents !== null && !dim && centsTone(cents) === 'ok');
</script>

<svg viewBox="0 0 240 140" class="w-full" role="img" aria-label="Tuning gauge">
	<path
		d={arc(-SWEEP, SWEEP, R)}
		fill="none"
		stroke="var(--border)"
		stroke-width="10"
		stroke-linecap="round"
	/>
	<path
		d={arc(-zone, zone, R)}
		fill="none"
		stroke={cents === null ? 'var(--muted)' : 'var(--ok)'}
		stroke-width="10"
		opacity={inTune ? 1 : cents === null ? 0.35 : 0.55}
	/>
	{#each ticks as t (t)}
		{@const [x1, y1] = point(angle(t), R - 14)}
		{@const [x2, y2] = point(angle(t), R - (t % 50 === 0 ? 30 : 22))}
		<line
			{x1}
			{y1}
			{x2}
			{y2}
			stroke="var(--muted)"
			stroke-width={t === 0 ? 3 : 1.5}
			stroke-linecap="round"
		/>
	{/each}
	<text
		x={point(-SWEEP, R)[0] - 2}
		y={CY + 6}
		fill="var(--muted)"
		font-size="18"
		text-anchor="middle">♭</text
	>
	<text
		x={point(SWEEP, R)[0] + 2}
		y={CY + 6}
		fill="var(--muted)"
		font-size="18"
		text-anchor="middle">♯</text
	>
	{#if cents !== null}
		<g
			class="motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
			style="transform: rotate({angle(cents)}deg); transform-origin: {CX}px {CY}px"
			opacity={dim ? 0.45 : 1}
			data-testid="gauge-needle"
		>
			<line
				x1={CX}
				y1={CY}
				x2={CX}
				y2={CY - R + 6}
				stroke={color}
				stroke-width="5"
				stroke-linecap="round"
			/>
		</g>
	{/if}
	<circle cx={CX} cy={CY} r="8" fill={color} />
</svg>
