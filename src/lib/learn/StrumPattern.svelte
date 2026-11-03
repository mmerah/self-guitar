<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { strum } from '$lib/audio/pluck';
	import { getChord, voicingFreqs } from '$lib/chords';
	import { Metronome, playClick } from '$lib/metronome/scheduler';
	import type { Click } from '$lib/metronome/timeline';
	import { strumCount, strumMeter, strumSlotAt, STRUM_BPM_MAX, STRUM_BPM_MIN } from './strum';
	import type { StrumSlot } from './types';

	let {
		pattern,
		bpm: initialBpm,
		chord
	}: { pattern: StrumSlot[]; bpm: number; chord?: string } = $props();

	let bpm = $state(untrack(() => initialBpm));
	let playing = $state(false);
	let active = $state(-1);
	let chordSound = $state(true);
	let metronome: Metronome | null = null;

	const n = $derived(pattern.length);
	const meter = $derived(strumMeter(pattern.length));
	// One row per bar (two-bar patterns: two rows, beats aligned).
	const perBar = $derived(meter.beats * 2);
	const bars = $derived(
		Array.from({ length: Math.ceil(n / perBar) }, (_, b) =>
			Array.from({ length: Math.min(perBar, n - b * perBar) }, (_, j) => b * perBar + j)
		)
	);
	const voicing = $derived(chord ? getChord(chord)?.voicings[0] : undefined);
	const down = $derived(voicing ? voicingFreqs(voicing) : []);
	// Up-strums catch the top strings only, high to low.
	const up = $derived(down.slice(-4).reverse());

	function sound(ctx: AudioContext, time: number, level: Click['level'], click: Click) {
		const slot = strumSlotAt(click, n);
		const hit = pattern[slot];
		const withChord = chordSound && down.length > 0;
		if (click.sub === 0) playClick(ctx, time, level === 'accent' ? 'accent' : 'beat');
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
					subdivision: 2,
					accent: true
				}),
				sound,
				onClick: (click) => (active = strumSlotAt(click, n))
			});
		}
		metronome.start();
		playing = true;
		claimPlayback(stop);
	}

	const setBpm = (v: number) => (bpm = Math.min(STRUM_BPM_MAX, Math.max(STRUM_BPM_MIN, v)));

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
	aria-label="Strum pattern"
>
	<header class="flex items-center gap-2">
		<h3 class="font-semibold">Strum pattern</h3>
		{#if chord}<span class="chip chip-accent">{chord}</span>{/if}
		<span class="ml-auto text-sm text-muted">{meter.timeSignature}</span>
	</header>

	<div
		class="flex flex-col gap-2"
		role="img"
		aria-label={pattern.map((s) => (s === 'D' ? 'down' : s === 'U' ? 'up' : 'rest')).join(', ')}
	>
		{#each bars as slots, b (b)}
			<ol
				class="grid gap-0.5"
				style="grid-template-columns: repeat({perBar}, minmax(0, 1fr))"
				aria-hidden="true"
				data-testid="strum-bar"
			>
				{#each slots as i (i)}
					{@const slot = pattern[i]}
					{@const on = active === i}
					{@const count = strumCount(i, n)}
					<li
						class="flex flex-col items-center gap-0.5 rounded-xl pt-1 pb-1.5 motion-safe:transition-colors motion-safe:duration-75 {on
							? 'bg-accent text-accent-fg'
							: i % 2
								? 'bg-surface'
								: 'bg-surface-2'}"
						data-active={on}
					>
						<!-- Count row: 1 & 2 & …, the downbeat stands out. -->
						<span
							class="leading-none tabular-nums {count === '1'
								? 'text-base font-extrabold'
								: i % 2
									? 'text-xs ' + (on ? '' : 'text-muted')
									: 'text-sm font-semibold'} {count === '1' && !on ? 'text-accent' : ''}"
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
				aria-label="Hear the {chord} chord"
				title="Hear the chord (off: click only)"
				data-testid="strum-sound"><Icon name="volume" />{chord}</button
			>
		{/if}
	</div>
</section>
