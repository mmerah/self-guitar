<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { strum } from '$lib/audio/pluck';
	import { chordRef, voicingFreqs } from '$lib/chords';
	import { Metronome, playClick } from '$lib/metronome/scheduler';
	import type { Click } from '$lib/metronome/timeline';
	import {
		compoundBeat,
		slotsPerClick,
		strumCount,
		strumMeter,
		strumSlotAt,
		STRUM_BPM_MAX,
		STRUM_BPM_MIN,
		type StrumSub,
		type StrumTs
	} from './strum';
	import type { StrumSlot } from './types';

	let {
		pattern,
		bpm: initialBpm,
		chord,
		sub = 8,
		ts,
		autoplay = false
	}: {
		pattern: StrumSlot[];
		bpm: number;
		/** A chord name, optionally with its voicing ("F@1-3-3-2-1-1"). */
		chord?: string;
		/** Slot value: 8th notes (default) or 16th notes ("1 e & a"). */
		sub?: StrumSub;
		/** 6/8: six 8th-note clicks a bar (the BPM counts 8ths), counted 1–6, big beats 1 and 4. */
		ts?: StrumTs;
		/** Starts playing as soon as it shows (a warm-up step that runs hands-free). */
		autoplay?: boolean;
	} = $props();

	let bpm = $state(untrack(() => initialBpm));
	let playing = $state(false);
	let active = $state(-1);
	let chordSound = $state(true);
	let metronome: Metronome | null = null;

	const n = $derived(pattern.length);
	const meter = $derived(strumMeter(pattern.length, sub, ts));
	const per = $derived(slotsPerClick(sub, ts));
	// One row per bar (two-bar patterns: two rows, beats aligned); 16ths: two beats per row, so
	// every slot keeps a thumb-sized cell on a phone.
	const perRow = $derived(sub === 16 ? 2 * per : meter.beats * per);
	const bars = $derived(
		Array.from({ length: Math.ceil(n / perRow) }, (_, b) =>
			Array.from({ length: Math.min(perRow, n - b * perRow) }, (_, j) => b * perRow + j)
		)
	);
	const ref = $derived(chord ? chordRef(chord) : undefined);
	const chordLabel = $derived(ref?.chord.id ?? chord);
	const voicing = $derived(ref?.voicing);
	const down = $derived(voicing ? voicingFreqs(voicing) : []);
	// Up-strums catch the top strings only, high to low.
	const up = $derived(down.slice(-4).reverse());

	function sound(ctx: AudioContext, time: number, level: Click['level'], click: Click) {
		const slot = strumSlotAt(click, n, sub, ts);
		const hit = pattern[slot];
		const withChord = chordSound && down.length > 0;
		if (ts) playClick(ctx, time, level === 'accent' || level === 'strong' ? level : 'sub');
		else if (click.sub === 0) playClick(ctx, time, level === 'accent' ? 'accent' : 'beat');
		else if (!withChord) playClick(ctx, time, 'sub');
		if (withChord && hit !== '-') {
			const freqs = hit === 'D' ? down : up;
			strum(ctx, freqs, 0.012, { when: time, level: hit === 'D' ? 0.9 : 0.6, seconds: 1.5 });
		}
	}

	function stop() {
		metronome?.stop();
		playing = false;
		active = -1;
		releasePlayback(stop);
	}

	function toggle() {
		if (playing) return stop();
		const ctx = getAudioContext();
		if (metronome?.ctx !== ctx) {
			metronome?.destroy();
			metronome = new Metronome(ctx, {
				settings: () => ({
					bpm,
					timeSignature: meter.timeSignature,
					subdivision: per,
					accent: true
				}),
				sound,
				onClick: (click) => (active = strumSlotAt(click, n, sub, ts))
			});
		}
		metronome.start();
		playing = true;
		claimPlayback(stop);
	}

	const setBpm = (v: number) => (bpm = Math.min(STRUM_BPM_MAX, Math.max(STRUM_BPM_MIN, v)));

	onMount(() => {
		if (autoplay && !playing) toggle();
	});

	onDestroy(() => {
		releasePlayback(stop);
		metronome?.destroy();
	});
</script>

<section
	class="card flex flex-col gap-3 p-3"
	data-testid="strum"
	data-playing={playing}
	data-slot={active}
	data-sub={sub}
	data-ts={ts ?? ''}
	aria-label="Strum pattern"
>
	<header class="flex items-center gap-2">
		<h3 class="font-semibold">Strum pattern</h3>
		{#if chord}<span class="chip chip-accent">{chordLabel}</span>{/if}
		<span class="ml-auto text-sm text-muted"
			>{meter.timeSignature}{sub === 16 ? ' · 16ths' : ''}</span
		>
	</header>

	<div
		class="flex flex-col gap-2"
		role="img"
		aria-label={pattern.map((s) => (s === 'D' ? 'down' : s === 'U' ? 'up' : 'rest')).join(', ')}
	>
		{#each bars as slots, b (b)}
			<ol
				class="grid gap-0.5"
				style="grid-template-columns: repeat({perRow}, minmax(0, 1fr))"
				aria-hidden="true"
				data-testid="strum-bar"
			>
				{#each slots as i (i)}
					{@const slot = pattern[i]}
					{@const on = active === i}
					{@const count = strumCount(i, n, sub, ts)}
					{@const onBeat = ts ? compoundBeat(i) : i % per === 0}
					{@const big = count === '1' || (ts && count === '4')}
					<li
						class="flex flex-col items-center gap-0.5 rounded-xl pt-1 pb-1.5 motion-safe:transition-colors motion-safe:duration-75 {on
							? 'bg-accent text-accent-fg'
							: onBeat
								? 'bg-surface-2'
								: 'bg-surface'}"
						data-active={on}
					>
						<!-- Count row: 1 & 2 & … (16ths: 1 e & a), the downbeat stands out. -->
						<span
							class="leading-none tabular-nums {big
								? 'text-base font-extrabold'
								: !onBeat && !ts
									? 'text-xs ' + (on ? '' : 'text-muted')
									: ts && !onBeat
										? 'text-sm ' + (on ? '' : 'text-muted')
										: 'text-sm font-semibold'} {big && !on ? 'text-accent' : ''}"
							data-testid="strum-count">{count}</span
						>
						<span
							class="grid size-10 place-items-center {slot === '-'
								? on
									? ''
									: 'text-muted opacity-40'
								: on
									? ''
									: slot === 'D'
										? 'text-fg'
										: 'text-accent'}"
							data-slot={slot}
						>
							{#if slot === 'D'}
								<Icon name="down" size={40} />
							{:else if slot === 'U'}
								<Icon name="up" size={40} />
							{:else}
								<Icon name="minus" size={20} />
							{/if}
						</span>
					</li>
				{/each}
			</ol>
		{/each}
	</div>

	<div class="flex items-center gap-2">
		<button
			class="btn btn-primary min-w-24 rounded-full text-base"
			onclick={toggle}
			aria-label={playing ? 'Stop strum pattern' : 'Play strum pattern'}
			data-testid="strum-play"
		>
			<Icon name={playing ? 'stop' : 'play'} />{playing ? 'Stop' : 'Play'}
		</button>
		<span class="flex items-center gap-1">
			<button
				class="btn"
				onclick={() => setBpm(bpm - 5)}
				disabled={bpm <= STRUM_BPM_MIN}
				aria-label="Slower"><Icon name="minus" /></button
			>
			<span class="w-12 text-center leading-tight tabular-nums">
				<span class="block text-lg font-bold" data-testid="strum-bpm">{bpm}</span>
				<span class="block text-xs text-muted">BPM</span>
			</span>
			<button
				class="btn"
				onclick={() => setBpm(bpm + 5)}
				disabled={bpm >= STRUM_BPM_MAX}
				aria-label="Faster"><Icon name="plus" /></button
			>
		</span>
		{#if down.length}
			<button
				class="btn ml-auto px-2.5"
				aria-pressed={chordSound}
				onclick={() => (chordSound = !chordSound)}
				aria-label="Hear the {chordLabel} chord"
				title="Hear the chord (off: click only)"
				data-testid="strum-sound"><Icon name="volume" />{chordLabel}</button
			>
		{/if}
	</div>
</section>
