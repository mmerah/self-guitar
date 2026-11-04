<script lang="ts">
	// The SVG fretboard (explorer, ::fretboard lesson widget, note quiz). One orientation per screen
	// shape, everywhere: horizontal like tab (high e on top, low E at the bottom) on landscape and
	// wide screens; vertical on a portrait phone (strings across with low E on the left, frets
	// down, like a chord diagram). String names always show. Dots: the root is a square, an
	// emphasised degree is pink with a ring, finger labels use the app's finger colours. Tap a dot
	// to hear it.
	import { onMount } from 'svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { pluck } from '$lib/audio/pluck';
	import { midiToFreq } from '$lib/music/notes';
	import {
		FRETS,
		DOUBLE_INLAYS,
		INLAYS,
		STRING_NAMES,
		dotLabel,
		midiAt,
		type Dot,
		type LabelMode,
		type Region
	} from '$lib/theory/fretboard';

	/** Quiz feedback: a found note, a wrong tap, or where the note was (shown after a miss). */
	export type Mark = {
		string: number;
		fret: number;
		kind: 'hit' | 'miss' | 'show';
		label?: string;
		/** Marks flashed together (removed together). */
		tag?: number;
	};

	let {
		dots = [],
		window: win = [0, 12],
		labels = 'intervals',
		regions = [],
		orientation = 'auto',
		hidden = false,
		active = null,
		marks = [],
		tapStrings = null,
		sound = true,
		ondot,
		ontap,
		label = 'Fretboard',
		compact = false,
		fill = false,
		bounds = [0, FRETS],
		maxHeight,
		fitHeight
	}: {
		dots?: Dot[];
		/** First and last fret shown (0 = the open strings, left of the nut). */
		window?: [number, number];
		labels?: LabelMode;
		regions?: Region[];
		orientation?: 'auto' | 'horizontal' | 'vertical';
		/** Self-quiz: dots show no names until tapped. */
		hidden?: boolean;
		/** "string:fret" of the note playing now. */
		active?: string | null;
		/** Quiz feedback: found notes and wrong taps. */
		marks?: Mark[];
		/** Quiz: these strings take taps anywhere (null: only dots are tappable). */
		tapStrings?: number[] | null;
		sound?: boolean;
		ondot?: (d: Dot) => void;
		ontap?: (pos: { string: number; fret: number }) => void;
		label?: string;
		/** Inside a lesson: a narrower, shorter vertical neck. */
		compact?: boolean;
		/**
		 * Explorer / quiz: horizontal necks fill the width (the window grows to at least
		 * FILL_FRETS frets around the shape, within `bounds`) instead of staying hand-sized.
		 */
		fill?: boolean;
		/** Frets the window may grow into (fill). */
		bounds?: [number, number];
		/** CSS max height of a horizontal neck (it scales down to fit, keeping its shape). */
		maxHeight?: string;
		/** CSS max height in either orientation (a quiz keeps its whole neck on screen). */
		fitHeight?: string;
	} = $props();
	const FILL_FRETS = 12;

	// ---- orientation ----
	const PORTRAIT_PHONE = '(max-width: 639px) and (orientation: portrait)';
	let portraitPhone = $state(
		typeof matchMedia === 'function' && matchMedia(PORTRAIT_PHONE).matches
	);
	onMount(() => {
		const q = matchMedia(PORTRAIT_PHONE);
		const update = () => (portraitPhone = q.matches);
		update();
		q.addEventListener('change', update);
		return () => q.removeEventListener('change', update);
	});
	const vertical = $derived(
		orientation === 'vertical' || (orientation === 'auto' && portraitPhone)
	);
	/** The window shown: the given one, grown around its middle when a wide neck fills the width. */
	const shownWindow = $derived.by((): [number, number] => {
		const [a, b] = win;
		if (!fill || vertical || b - a + 1 >= FILL_FRETS) return [a, b];
		const [min, max] = bounds;
		let l = Math.max(min, a - Math.floor((FILL_FRETS - (b - a + 1)) / 2));
		const h = Math.min(Math.max(max, b), l + FILL_FRETS - 1);
		l = Math.max(min, Math.min(l, h - FILL_FRETS + 1));
		return [l, h];
	});
	const lo = $derived(shownWindow[0]);
	const hi = $derived(Math.max(shownWindow[1], 1));
	const hasOpen = $derived(lo === 0);
	const first = $derived(Math.max(lo, 1));
	const n = $derived(hi - first + 1);

	// ---- geometry: u runs along the strings (frets), v across them ----
	const SG = 40; // string gap
	const FW = $derived(vertical ? (compact ? 36 : 46) : 60); // one fret
	const OW = 34; // open-string column
	const NG = 18; // string names
	const PAD = 22;
	const FN = 20; // fret numbers
	const RG = $derived(regions.length ? 28 : 0); // region brackets (two rows)
	const u0 = NG;
	const nutU = $derived(u0 + (hasOpen ? OW : 0));
	const U = $derived(nutU + n * FW + 8);
	const v0 = $derived(RG + PAD);
	const V = $derived(v0 + 5 * SG + PAD + FN);
	const vOf = (s: number) => v0 + (vertical ? 6 - s : s - 1) * SG;
	const uOf = (f: number) => (f === 0 ? u0 + OW / 2 : nutU + (f - first) * FW + FW / 2);
	const startOf = (f: number) => (f === 0 ? u0 : nutU + (f - first) * FW);
	const endOf = (f: number) => (f === 0 ? nutU : nutU + (f - first + 1) * FW);
	const xy = (u: number, v: number) => (vertical ? { x: v, y: u } : { x: u, y: v });
	const viewBox = $derived(vertical ? `0 0 ${V} ${U}` : `0 0 ${U} ${V}`);

	const frets = $derived(Array.from({ length: n }, (_, i) => first + i));
	const shown = $derived(dots.filter((d) => d.fret >= lo && d.fret <= hi));
	const key = (s: number, f: number) => `${s}:${f}`;
	/** Frets with a dot or a quiz mark: their inlay would hide under it, so it is not drawn. */
	const covered = $derived(new Set([...shown, ...marks].map((d) => d.fret)));

	// ---- interaction ----
	let revealed = $state<Record<string, boolean>>({});
	$effect(() => {
		if (!hidden) revealed = {};
	});

	function hear(midi: number) {
		if (!sound) return;
		pluck(getAudioContext(), midiToFreq(midi), { gain: 0.6, seconds: 1.8, halfLife: 0.6 });
	}

	function tapDot(d: Dot) {
		hear(d.midi);
		if (hidden) revealed = { ...revealed, [key(d.string, d.fret)]: true };
		ondot?.(d);
	}

	function tapCell(string: number, fret: number) {
		hear(midiAt(string, fret));
		ontap?.({ string, fret });
	}

	const line = (u1: number, v1: number, u2: number, v2: number) => {
		const a = xy(u1, v1);
		const b = xy(u2, v2);
		return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
	};
	const rect = (u1: number, v1: number, u2: number, v2: number) => {
		const a = xy(Math.min(u1, u2), Math.min(v1, v2));
		const du = Math.abs(u2 - u1);
		const dv = Math.abs(v2 - v1);
		return vertical
			? { x: a.x, y: a.y, width: dv, height: du }
			: { x: a.x, y: a.y, width: du, height: dv };
	};
	const colours = (d: Dot, isHidden: boolean) => {
		if (isHidden) return { bg: 'var(--surface-2)', fg: 'var(--text)', stroke: 'var(--muted)' };
		if (labels === 'fingers' && d.finger)
			return { bg: `var(--finger-${d.finger})`, fg: 'var(--finger-text)', stroke: 'none' };
		if (d.accent) return { bg: 'var(--degree)', fg: 'var(--degree-text)', stroke: 'none' };
		if (d.root) return { bg: 'var(--accent)', fg: 'var(--accent-text)', stroke: 'none' };
		if (d.extra) return { bg: 'var(--surface-2)', fg: 'var(--text)', stroke: 'var(--text)' };
		return { bg: 'var(--text)', fg: 'var(--bg)', stroke: 'none' };
	};
</script>

<!-- Never drawn larger than its natural size (a 4-fret box stays hand-sized on a desktop). -->
<div
	class={vertical ? `mx-auto w-full ${compact ? 'max-w-[20rem]' : 'max-w-[24rem]'}` : 'w-full'}
	style:max-width={vertical || fill ? undefined : `${Math.round(U * 1.1)}px`}
>
	<svg
		{viewBox}
		style:max-height={fitHeight ?? (vertical ? undefined : maxHeight)}
		class="block h-auto w-full touch-manipulation select-none"
		role="group"
		aria-label={label}
		data-testid="fretboard"
		data-orientation={vertical ? 'vertical' : 'horizontal'}
		data-dots={shown.length}
		data-window="{lo}-{hi}"
		data-active={active ?? ''}
	>
		<!-- Regions (CAGED shapes, triad inversions): a faint band behind the strings and a named
		     bracket in the gutter (neighbours alternate rows, as shapes share a fret). -->
		{#each regions as r, i (i)}
			{@const a = Math.max(r.from, lo)}
			{@const b = Math.min(r.to, hi)}
			{#if a <= b}
				{@const color = i % 2 ? 'var(--finger-1)' : 'var(--accent)'}
				{@const row = 7 + (i % 2) * 14}
				<rect
					{...rect(startOf(a) + 2, v0 - PAD / 2, endOf(b) - 2, v0 + 5 * SG + PAD / 2)}
					rx="6"
					fill={color}
					opacity="0.08"
				/>
				<line
					{...line(startOf(a) + 4, row, endOf(b) - 4, row)}
					stroke={color}
					stroke-width="3"
					stroke-linecap="round"
				/>
				{@const c = xy((startOf(a) + endOf(b)) / 2, row)}
				<rect
					x={c.x - 6 - r.label.length * 3.4}
					y={c.y - 7}
					width={12 + r.label.length * 6.8}
					height="14"
					rx="7"
					fill="var(--bg)"
				/>
				<text
					x={c.x}
					y={c.y}
					text-anchor="middle"
					dominant-baseline="central"
					font-size="11"
					font-weight="700"
					fill={color}
					data-testid="fret-region">{r.label}</text
				>
			{/if}
		{/each}

		<!-- Inlays -->
		{#each frets.filter((f) => INLAYS.includes(f) && !covered.has(f)) as f (f)}
			{#if DOUBLE_INLAYS.includes(f)}
				{@const p1 = xy(uOf(f), v0 + 1.5 * SG)}
				{@const p2 = xy(uOf(f), v0 + 3.5 * SG)}
				<circle cx={p1.x} cy={p1.y} r="6" fill="var(--border)" />
				<circle cx={p2.x} cy={p2.y} r="6" fill="var(--border)" />
			{:else}
				{@const p = xy(uOf(f), v0 + 2.5 * SG)}
				<circle cx={p.x} cy={p.y} r="6" fill="var(--border)" />
			{/if}
		{/each}

		<!-- Frets (the nut thick) and fret numbers -->
		{#each Array.from({ length: n + 1 }, (_, k) => k) as k (k)}
			<line
				{...line(nutU + k * FW, v0 - 6, nutU + k * FW, v0 + 5 * SG + 6)}
				stroke={k === 0 && first === 1 ? 'var(--text)' : 'var(--muted)'}
				stroke-width={k === 0 && first === 1 ? 6 : 1.5}
				stroke-linecap="round"
			/>
		{/each}
		{#each frets as f (f)}
			{#if f === first || INLAYS.includes(f)}
				{@const p = xy(uOf(f), v0 + 5 * SG + PAD / 2 + FN / 2 + 2)}
				<text
					x={p.x}
					y={p.y}
					text-anchor="middle"
					dominant-baseline="central"
					font-size="12"
					fill="var(--muted)">{f}</text
				>
			{/if}
		{/each}

		<!-- Strings, low E thickest; names at the head -->
		{#each [1, 2, 3, 4, 5, 6] as s (s)}
			{@const dim = tapStrings !== null && !tapStrings.includes(s)}
			<line
				{...line(u0 + 4, vOf(s), nutU + n * FW, vOf(s))}
				stroke="var(--text)"
				stroke-width={0.9 + (s - 1) * 0.35}
				opacity={dim ? 0.25 : 0.75}
			/>
			{@const p = xy(u0 / 2, vOf(s))}
			<text
				x={p.x}
				y={p.y}
				text-anchor="middle"
				dominant-baseline="central"
				font-size="11"
				fill="var(--muted)"
				opacity={dim ? 0.4 : 1}>{STRING_NAMES[s]}</text
			>
		{/each}

		<!-- Quiz: every position on the quiz strings takes a tap. -->
		{#if tapStrings}
			{#each tapStrings as s (s)}
				{#each [...(hasOpen ? [0] : []), ...frets] as f (f)}
					<rect
						{...rect(startOf(f), vOf(s) - SG / 2, endOf(f), vOf(s) + SG / 2)}
						fill="transparent"
						class="cursor-pointer"
						role="button"
						tabindex="-1"
						aria-label="String {s}, fret {f}"
						data-testid="fret-cell"
						data-string={s}
						data-fret={f}
						onpointerdown={(e) => {
							e.preventDefault();
							tapCell(s, f);
						}}
					/>
				{/each}
			{/each}
		{/if}

		<!-- Dots -->
		{#each shown as d (key(d.string, d.fret))}
			{@const p = xy(uOf(d.fret), vOf(d.string))}
			{@const isHidden = hidden && !revealed[key(d.string, d.fret)]}
			{@const on = active === key(d.string, d.fret)}
			{@const c = on
				? { bg: 'var(--accent)', fg: 'var(--accent-text)', stroke: 'none' }
				: colours(d, isHidden)}
			{@const text = isHidden ? '' : dotLabel(d, labels)}
			<g
				transform="translate({p.x} {p.y})"
				class="cursor-pointer"
				role="button"
				tabindex="0"
				aria-label="String {d.string}, fret {d.fret}: {d.name}{d.root ? ' (root)' : ''}"
				data-testid="fret-dot"
				data-string={d.string}
				data-fret={d.fret}
				data-root={d.root}
				data-label={text}
				data-finger={d.finger ?? ''}
				data-accent={d.accent ? 'true' : undefined}
				data-active={active === key(d.string, d.fret) ? 'true' : undefined}
				onclick={() => tapDot(d)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && tapDot(d)}
			>
				{#if active === key(d.string, d.fret)}
					<!-- The note sounding now: a glow and a thick ring, the dot itself a size up. -->
					<circle r="22" fill="var(--accent)" opacity="0.3" />
					<circle r="19" fill="none" stroke="var(--accent)" stroke-width="4" />
				{:else if d.accent && !isHidden}
					<circle r="18.5" fill="none" stroke="var(--degree)" stroke-width="2.5" />
				{/if}
				{#if d.root}
					<rect
						x="-14"
						y="-14"
						width="28"
						height="28"
						rx="6"
						fill={c.bg}
						stroke={labels === 'fingers' && d.finger && !isHidden ? 'var(--accent)' : c.stroke}
						stroke-width="3"
					/>
				{:else}
					<circle
						r="14"
						fill={c.bg}
						stroke={c.stroke}
						stroke-width="2"
						stroke-dasharray={d.extra && !isHidden ? '4 3' : undefined}
					/>
				{/if}
				{#if text}
					<text
						text-anchor="middle"
						dominant-baseline="central"
						font-size={text.length > 2 ? 11 : 13}
						font-weight="700"
						fill={c.fg}>{text}</text
					>
				{/if}
			</g>
		{/each}

		<!-- Quiz marks -->
		{#each marks as m, i (i)}
			{@const p = xy(uOf(m.fret), vOf(m.string))}
			<g
				transform="translate({p.x} {p.y})"
				pointer-events="none"
				data-testid="fret-mark"
				data-kind={m.kind}
				data-string={m.string}
				data-fret={m.fret}
			>
				{#if m.kind === 'show'}
					<circle r="18" fill="none" stroke="var(--ok)" stroke-width="3" class="animate-pulse" />
					<circle r="14" fill="var(--ok)" opacity="0.85" />
				{:else}
					<circle r="14" fill={m.kind === 'hit' ? 'var(--ok)' : 'var(--danger)'} />
				{/if}
				<text
					text-anchor="middle"
					dominant-baseline="central"
					font-size="13"
					font-weight="700"
					fill={m.kind === 'miss' ? '#fff' : 'var(--ok-text)'}
					>{m.kind === 'miss' ? '×' : (m.label ?? '✓')}</text
				>
			</g>
		{/each}
	</svg>
</div>
