<script lang="ts">
	// A chord sheet: lyrics with the chords above them, the song's chord diagrams, the strum, and
	// the generated accompaniment playing underneath (TabPlayer, its tab hidden unless asked for).
	// Playback lights up the line being played and keeps it in view; tapping a line plays from it.
	// Transpose moves the sounding key (names, shapes and sound); the capo stepper re-voices the
	// shapes for another capo fret and keeps the sounding key. Neither stops playback.
	import { untrack, type Snippet } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { strum } from '$lib/audio/pluck';
	import { chordName, voicingFreqs } from '$lib/chords';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import StrumRow from '$lib/learn/StrumRow.svelte';
	import type { StrumSlot } from '$lib/learn/types';
	import TabPlayer, { type PlayerPrefs } from '$lib/player/TabPlayer.svelte';
	import { accompaniment } from './accompany';
	import { SLOTS, type Sheet } from './chordpro';
	import { transposeChord, voicingFor } from './chords';
	import { wrapUnits } from './wrap';

	let {
		sheet,
		id,
		initialTempoPct = 100,
		compact = false,
		onchange,
		onplay
	}: {
		sheet: Sheet;
		/** The song's id: its capo choice is remembered per song. */
		id?: string;
		initialTempoPct?: number;
		/** Session block: smaller paddings, no header-sized gaps. */
		compact?: boolean;
		onchange?: (prefs: PlayerPrefs) => void;
		onplay?: (prefs: PlayerPrefs) => void;
	} = $props();

	const CAPO_MAX = 7;
	const FONT_MIN = 14;
	const FONT_MAX = 30;
	const FONT_DEFAULT = 18;
	const FONT_KEY = 'sg:sheet-font';
	const capoKey = () => `sg:capo:${id}`;

	function readNumber(key: string): number | null {
		try {
			const v = localStorage.getItem(key);
			return v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
		} catch {
			return null;
		}
	}
	function writeNumber(key: string, v: number | null) {
		try {
			if (v === null) localStorage.removeItem(key);
			else localStorage.setItem(key, String(v));
		} catch {
			// a per-device convenience only
		}
	}

	let transpose = $state(0);
	/** The capo fret played (the sheet's own unless the reader moved it). */
	let capo = $state(
		untrack(() => {
			const saved = id ? readNumber(capoKey()) : null;
			return saved !== null && saved >= 0 && saved <= CAPO_MAX ? saved : sheet.capo;
		})
	);
	/** Lyrics font size (px); chords are 2px smaller and bold. */
	let font = $state(Math.min(FONT_MAX, Math.max(FONT_MIN, readNumber(FONT_KEY) ?? FONT_DEFAULT)));
	let tempoPct = $state(untrack(() => initialTempoPct));
	let showTab = $state(false);
	let showNotes = $state(false);
	/** The bar being played (index into sheet.bars), -1 before playback. */
	let bar = $state(-1);
	let frac = $state(0);
	let playing = $state(false);
	let follow = $state(true);
	let manualAt = 0;
	let lyrics = $state<HTMLDivElement>();
	let player = $state<ReturnType<typeof TabPlayer>>();
	/** Recalled choruses opened by the reader. */
	let opened = $state<Record<number, boolean>>({});

	/** Semitones the shapes move: the key change, less the frets the capo moved up. */
	const shift = $derived(transpose - (capo - sheet.capo));
	const tex = $derived(accompaniment(sheet, shift, capo));
	const name = (c: string) => transposeChord(c, shift);
	const slots = $derived(SLOTS[sheet.time]);
	const info = $derived(bar >= 0 ? sheet.bars[bar] : null);
	const curLine = $derived(info && info.b >= 0 ? `${info.b}-${info.l}` : null);
	const curBlock = $derived(info?.b ?? -1);
	/** The chord sounding now (none during the pickup) and the next different one. */
	const cell = $derived(info ? Math.min(info.c.length - 1, Math.floor(frac * info.c.length)) : 0);
	const curChord = $derived(info && !info.p ? info.c[cell] : null);
	const nextChord = $derived.by(() => {
		if (!info) return null;
		if (info.p) return info.c[0];
		for (let i = bar; i < sheet.bars.length; i++) {
			const cs = sheet.bars[i].c;
			for (let k = i === bar ? cell + 1 : 0; k < cs.length; k++)
				if (cs[k] !== curChord) return cs[k];
		}
		return null;
	});
	/** First bar of every line ("b-l" → bar index), for tap-to-play: a pickup starts line 1. */
	const lineStart = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read inside one derived
		const m = new Map<string, number>();
		sheet.bars.forEach((x, i) => {
			const k = `${x.b}-${x.l}`;
			if (x.b >= 0 && !m.has(k)) m.set(k, i);
		});
		return m;
	});
	/** First strummed bar of every block (two-bar patterns alternate from it). */
	const blockStart = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read inside one derived
		const m = new Map<number, number>();
		sheet.bars.forEach((x, i) => x.b >= 0 && !x.p && !m.has(x.b) && m.set(x.b, i));
		return m;
	});
	const strumOf = (b: number) => {
		const block = sheet.blocks[b];
		return (block && block.type !== 'comment' ? block.strum : sheet.strum).split(
			' '
		) as StrumSlot[];
	};
	const pattern = $derived(strumOf(curBlock >= 0 ? curBlock : 0));
	const slot = $derived.by(() => {
		if (!playing || bar < 0 || curBlock < 0 || info?.p) return -1;
		const n = pattern.length;
		const inBlock = bar - (blockStart.get(curBlock) ?? 0);
		const bars = Math.max(1, Math.round(n / slots));
		return ((inBlock % bars) * slots + Math.min(slots - 1, Math.floor(frac * slots))) % n;
	});
	/** The key the song sounds in (kept when the capo moves). */
	const sounding = $derived(transposeChord(sheet.key, sheet.capo + transpose));
	/** Notes before the first verse: behind ⓘ, so the lyrics start at the top. */
	const firstBlock = $derived(sheet.blocks.findIndex((b) => b.type !== 'comment'));
	const notes = $derived(
		sheet.blocks
			.slice(0, Math.max(0, firstBlock))
			.flatMap((b) => (b.type === 'comment' ? [b.text] : []))
	);

	function onPosition(b: number, f: number) {
		playing = b >= 0;
		if (b < 0) return;
		bar = b;
		frac = f;
	}

	// Keep the line being played in view (about a third down), unless the reader just scrolled.
	$effect(() => {
		const key = curLine;
		if (!key || !lyrics || !playing) return;
		if (!follow || Date.now() - manualAt < 4000) return;
		const el = lyrics.querySelector<HTMLElement>(`[data-line="${key}"]`);
		if (!el) return;
		const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const top = el.offsetTop - lyrics.clientHeight * 0.3;
		lyrics.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
	});

	function onManualScroll() {
		manualAt = Date.now();
		if (playing) follow = false;
	}

	function playFrom(key: string) {
		const b = lineStart.get(key);
		if (b === undefined) return;
		bar = b;
		frac = 0;
		follow = true;
		player?.seekBar(b);
	}

	function hear(c: string) {
		const v = voicingFor(name(c), shift ? undefined : sheet.voicings[c]);
		if (v) strum(getAudioContext(), voicingFreqs(v.voicing));
	}

	/** A new key: the accompaniment is swapped in place (same bar, still playing). */
	function setTranspose(n: number) {
		transpose = Math.max(-6, Math.min(6, n));
	}

	function setCapo(n: number) {
		capo = Math.max(0, Math.min(CAPO_MAX, n));
		if (id) writeNumber(capoKey(), capo === sheet.capo ? null : capo);
	}

	function setFont(n: number) {
		font = Math.max(FONT_MIN, Math.min(FONT_MAX, n));
		writeNumber(FONT_KEY, font === FONT_DEFAULT ? null : font);
	}
</script>

{#snippet stepper(
	label: string,
	down: () => void,
	up: () => void,
	downOff: boolean,
	upOff: boolean,
	testid: string,
	body: Snippet
)}
	<span class="flex shrink-0 items-center rounded-xl bg-surface-2" role="group" aria-label={label}>
		<button
			class="btn min-h-9 min-w-9 bg-transparent! px-2 short:min-h-8"
			onclick={down}
			disabled={downOff}
			aria-label="{label} down"
			data-testid="{testid}-down"><Icon name="minus" size={16} /></button
		>
		{@render body()}
		<button
			class="btn min-h-9 min-w-9 bg-transparent! px-2 short:min-h-8"
			onclick={up}
			disabled={upOff}
			aria-label="{label} up"
			data-testid="{testid}-up"><Icon name="plus" size={16} /></button
		>
	</span>
{/snippet}

{#snippet keyBody()}
	<button
		class="min-w-9 text-center leading-none"
		onclick={() => setTranspose(0)}
		title={transpose ? 'Back to the written key' : 'Key'}
		data-testid="sheet-key"
	>
		<span class="block text-[15px] font-bold">{name(sheet.key)}</span>
		<span class="block text-[10px] text-muted"
			>{transpose ? `${transpose > 0 ? '+' : ''}${transpose}` : 'key'}</span
		>
	</button>
{/snippet}

{#snippet capoBody()}
	<span
		class="px-0.5 text-center text-[13px] leading-tight whitespace-nowrap"
		data-testid="capo"
		data-capo={capo}
		><b class={capo ? 'text-accent' : ''}>{capo ? `Capo ${capo}` : 'No capo'}</b><span
			class="text-muted">{` · sounds in ${sounding}`}</span
		></span
	>
{/snippet}

<div
	class="flex min-h-0 flex-1 flex-col"
	data-testid="sheet"
	data-transpose={transpose}
	style:--lyric="{font}px"
	style:--chord="{font - 2}px"
>
	<!-- Key and capo, the chord diagrams, the strum: three rows, or one strip on a short screen. -->
	<div class="border-b border-line bg-surface">
		<div
			class="mx-auto flex max-w-3xl flex-col gap-1 px-2 py-1 short:max-w-none short:flex-row short:items-center short:gap-1.5 short:py-0.5"
			data-testid="sheet-bar"
		>
			<div class="flex items-center gap-1.5">
				{@render stepper(
					'Transpose',
					() => setTranspose(transpose - 1),
					() => setTranspose(transpose + 1),
					transpose <= -6,
					transpose >= 6,
					'transpose',
					keyBody
				)}
				{@render stepper(
					'Capo',
					() => setCapo(capo - 1),
					() => setCapo(capo + 1),
					capo <= 0,
					capo >= CAPO_MAX,
					'capo',
					capoBody
				)}
			</div>
			<ul
				class="flex min-w-0 gap-1.5 overflow-x-auto short:flex-1"
				aria-label="Chords (tap to hear)"
				data-testid="chord-bar"
			>
				{#each sheet.chords as c (c)}
					{@const v = voicingFor(name(c), shift ? undefined : sheet.voicings[c])}
					{@const on = curChord === c}
					{@const soon = !on && nextChord === c}
					<li class="shrink-0">
						<button
							class="relative flex items-start gap-0.5 rounded-xl py-0.5 pr-1 pl-1.5 {on
								? 'bg-accent/15 ring-2 ring-accent'
								: 'bg-surface-2'}"
							onclick={() => hear(c)}
							aria-label="{name(c)}: hear it"
							data-testid="chord-mini"
							data-chord={name(c)}
							data-current={on}
						>
							<span
								class="min-w-4 pt-0.5 text-left text-[15px] leading-tight font-bold short:text-[13px]"
								>{name(c)}</span
							>
							{#if v}
								<span class="block w-[64px] short:w-[38px]"
									><ChordDiagram
										voicing={v.voicing}
										label="{chordName(v.chord)} diagram"
										mini
									/></span
								>
							{/if}
							{#if soon}
								<span
									class="absolute top-1 right-1 size-2 rounded-full bg-accent"
									title="next chord"
									data-testid="chord-next"
								></span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
			<div class="flex items-center gap-1">
				<div class="min-w-0 flex-1 short:w-48 short:flex-none">
					<StrumRow {pattern} active={slot} />
				</div>
				<span class="flex items-center short:hidden" role="group" aria-label="Lyrics size">
					<button
						class="btn min-h-8 px-1.5 text-xs font-bold"
						onclick={() => setFont(font - 2)}
						disabled={font <= FONT_MIN}
						aria-label="Smaller lyrics"
						data-testid="font-down">A−</button
					>
					<button
						class="btn min-h-8 px-1.5 text-base font-bold"
						onclick={() => setFont(font + 2)}
						disabled={font >= FONT_MAX}
						aria-label="Bigger lyrics"
						data-testid="font-up">A+</button
					>
				</span>
				{#if notes.length}
					<button
						class="btn min-h-8 px-2 text-base"
						aria-expanded={showNotes}
						aria-label="Notes on this song"
						title="Notes"
						onclick={() => (showNotes = !showNotes)}
						data-testid="sheet-notes-button">ⓘ</button
					>
				{/if}
				<button
					class="btn min-h-8 px-2 text-xs"
					aria-pressed={showTab}
					onclick={() => (showTab = !showTab)}
					data-testid="show-tab">Tab</button
				>
			</div>
		</div>
	</div>

	<!-- Lyrics with chords above the syllables. -->
	<div
		bind:this={lyrics}
		class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
		onwheel={onManualScroll}
		ontouchmove={onManualScroll}
		role="region"
		aria-label="Lyrics and chords"
		data-testid="lyrics"
	>
		<div class="mx-auto max-w-2xl {compact ? 'px-3 py-1.5' : 'px-4 py-2'} short:py-1">
			{#if showNotes}
				<div class="mb-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="sheet-notes">
					{#each notes as n, i (i)}<p class="my-0.5">{n}</p>{/each}
				</div>
			{/if}
			{#each sheet.blocks as block, b (b)}
				{#if block.type === 'comment'}
					{#if b > firstBlock}<p class="my-2 text-sm text-muted italic">{block.text}</p>{/if}
				{:else if block.recall && !opened[b] && curBlock !== b}
					<button class="chip my-1.5" onclick={() => (opened[b] = true)} data-testid="chorus-recall"
						>{block.label} <Icon name="loop" size={14} /></button
					>
				{:else}
					<section class="mb-3" aria-label={block.label} data-block={b}>
						<h3
							class="mb-0.5 text-[11px] font-semibold tracking-wider text-muted uppercase {block.type ===
							'chorus'
								? 'text-accent!'
								: ''}"
						>
							{block.label}
						</h3>
						{#each block.lines as line, l (l)}
							{@const key = `${b}-${l}`}
							{@const on = curLine === key}
							{@const chorded = line.some((s) => s.chord)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="-mx-2 flex flex-wrap items-end rounded-lg border-l-4 px-2 py-0.5 motion-safe:transition-colors {on
									? 'border-accent bg-accent/12'
									: 'border-transparent'} {block.type === 'chorus' ? 'pl-4' : ''}"
								data-line={key}
								data-current={on}
								data-testid="sheet-line"
								onclick={() => playFrom(key)}
								title="Play from here"
							>
								{#each wrapUnits(line) as unit, u (u)}
									<span class="inline-flex max-w-full items-end">
										{#each unit as seg, i (i)}
											<span class="inline-flex min-w-0 flex-col">
												{#if chorded}
													<span
														class="chord min-h-[1.2em] pr-1 leading-tight font-bold text-accent"
														aria-label={seg.chord ? `chord ${name(seg.chord)}` : undefined}
														>{seg.chord ? name(seg.chord) : ''}</span
													>
												{/if}
												<span class="lyric leading-snug break-words whitespace-pre-wrap"
													>{seg.text || ' '}</span
												>
											</span>
										{/each}
									</span>
								{/each}
							</div>
						{/each}
					</section>
				{/if}
			{/each}
			{#if sheet.end}
				<p class="text-sm text-muted">
					End on <b class="text-accent">{name(sheet.end)}</b>
				</p>
			{/if}
		</div>
		{#if !follow && playing}
			<button
				class="btn btn-primary sticky bottom-2 left-full mr-2 rounded-full shadow-lg"
				onclick={() => {
					follow = true;
					manualAt = 0;
				}}
				data-testid="follow">Follow</button
			>
		{/if}
	</div>

	<!-- The accompaniment: TabPlayer's transport; its tab only on request. A new key or capo
	     swaps the score in place (same bar, still playing). -->
	<div class={showTab ? 'flex h-[45%] min-h-48 flex-col border-t border-line' : 'flex flex-col'}>
		<TabPlayer
			bind:this={player}
			{tex}
			hideTab={!showTab}
			tempoMark={false}
			initialTempoPct={tempoPct}
			onchange={(p) => {
				tempoPct = p.tempoPct;
				onchange?.(p);
			}}
			{onplay}
			onposition={onPosition}
		/>
	</div>
</div>

<style>
	.lyric {
		font-size: var(--lyric);
	}
	.chord {
		font-size: var(--chord);
	}
</style>
