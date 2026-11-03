<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import { holdRepeat } from '$lib/actions/holdRepeat';
	import { getAudioContext } from '$lib/audio/context';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { Metronome } from '$lib/metronome/scheduler';
	import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '$lib/metronome/settings';
	import {
		BPM_MAX,
		BPM_MIN,
		clampBpm,
		SUBDIVISIONS,
		tapTempo,
		TIME_SIGNATURES,
		type TimeSignature
	} from '$lib/metronome/timeline';
	import { createWakeLock } from '$lib/player/wakeLock';

	let s = $state(structuredClone(DEFAULT_SETTINGS));
	/** Saving is on for the user's own settings; off for a lesson's preset (deep link). */
	let saving = false;
	let running = $state(false);
	let beat = $state(-1);
	let bar = $state(0);
	/** Tempo being played (the speed trainer's, while it runs) and bars to its next step. */
	let playing = $state<number | null>(null);
	let nextStepIn = $state<number | null>(null);
	let taps: number[] = [];

	const beats = $derived(TIME_SIGNATURES[s.timeSignature].beats);
	const strong = $derived(TIME_SIGNATURES[s.timeSignature].strong);
	const training = $derived(running && s.trainer.enabled);
	const shownBpm = $derived(training && playing !== null ? playing : s.bpm);

	let metronome: Metronome | null = null;
	let wakeLock: ReturnType<typeof createWakeLock> | null = null;

	onMount(() => {
		// Linked from a lesson (?bpm=70&ts=3/4&sub=2): exactly that preset, everything else at its
		// default, and the user's own saved settings stay untouched.
		const q = page.url.searchParams;
		const preset = ['bpm', 'ts', 'sub'].some((k) => q.has(k));
		if (preset) {
			s = structuredClone(DEFAULT_SETTINGS);
			const bpm = Number(q.get('bpm'));
			if (bpm) s.bpm = clampBpm(bpm);
			const ts = q.get('ts');
			if (ts && ts in TIME_SIGNATURES) s.timeSignature = ts as TimeSignature;
			const sub = SUBDIVISIONS.find((d) => String(d.value) === q.get('sub'));
			if (sub) s.subdivision = sub.value;
		} else {
			s = loadSettings();
			saving = true;
		}
		wakeLock = createWakeLock();
	});

	// Only the user's own tempo is saved: the trainer's ramp never overwrites it.
	$effect(() => {
		const snapshot = $state.snapshot(s);
		if (saving) saveSettings(snapshot);
	});

	onDestroy(() => {
		releasePlayback(stop);
		metronome?.destroy();
		wakeLock?.destroy();
	});

	function stop() {
		metronome?.stop();
		running = false;
		beat = -1;
		playing = nextStepIn = null;
		wakeLock?.set(false);
		releasePlayback(stop);
	}

	function toggle() {
		if (running) return stop();
		// Inside the tap (iOS needs a user gesture), and on every start: this resumes a context
		// that iOS interrupted (a call, another app) or replaces one that was closed.
		const ctx = getAudioContext();
		if (metronome?.ctx !== ctx) {
			metronome?.destroy();
			metronome = new Metronome(ctx, {
				settings: () => s,
				trainer: () => s.trainer,
				onClick: (c) => {
					if (c.sub === 0) beat = c.beat;
					bar = c.bar;
					playing = c.bpm;
					nextStepIn = metronome?.barsToNextStep(c.bar) ?? null;
				}
			});
		}
		metronome.start();
		running = true;
		claimPlayback(stop);
		wakeLock?.set(true);
	}

	/** A tempo the user chose: it plays from the next click and restarts the trainer's ramp. */
	function setTempo(bpm: number) {
		s.bpm = clampBpm(bpm);
		playing = s.bpm;
		metronome?.userTempo();
	}

	const nudge = (d: number) => () => setTempo(shownBpm + d);

	function tap() {
		const now = performance.now();
		taps = [...taps.slice(-7), now];
		const bpm = tapTempo(taps);
		if (bpm !== null) setTempo(bpm);
	}

	const tempoName = (bpm: number) =>
		bpm < 60
			? 'Largo'
			: bpm < 76
				? 'Adagio'
				: bpm < 108
					? 'Andante'
					: bpm < 120
						? 'Moderato'
						: bpm < 168
							? 'Allegro'
							: 'Presto';

	function onKey(e: KeyboardEvent) {
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
		if (e.code === 'Space') {
			e.preventDefault();
			toggle();
		}
	}
</script>

<svelte:head><title>Metronome · Self-Guitar</title></svelte:head>
<svelte:window onkeydown={onKey} />

<main class="mx-auto flex w-full max-w-xl flex-1 flex-col p-4 md:p-8 short:max-w-5xl short:py-2">
	<ToolHeader title="Metronome" />

	<!-- Phone landscape: tempo + Start on the left, settings on the right (nothing hides the slider). -->
	<div
		class="flex flex-1 flex-col gap-3 short:grid short:grid-cols-2 short:grid-rows-[auto_1fr] short:items-start short:gap-x-4"
	>
		<div class="flex flex-col gap-3 short:gap-2">
			<!-- Beat indicator -->
			<div
				class="flex items-center justify-center gap-2 sm:gap-3 sm:py-2 short:py-0"
				data-testid="beat-dots"
				aria-hidden="true"
			>
				{#each Array.from({ length: beats }, (_, i) => i) as i (i)}
					{@const active = running && beat === i}
					{@const accent = s.accent && (i === 0 || strong.includes(i))}
					<span
						class="rounded-full border-2 motion-safe:transition-transform motion-safe:duration-75
						{beats > 4 ? 'size-10 sm:size-12 short:size-7' : 'size-12 sm:size-16 short:size-8'}
						{active
							? i === 0 && s.accent
								? 'border-accent bg-accent motion-safe:scale-110'
								: 'border-fg bg-fg motion-safe:scale-110'
							: accent
								? 'border-accent'
								: 'border-line'}"
						data-active={active}
					></span>
				{/each}
			</div>

			<!-- Tempo -->
			<section class="card flex flex-col gap-2 short:p-3">
				<div class="flex items-center justify-between gap-2">
					<button
						class="btn size-16 rounded-2xl short:size-14"
						aria-label="Slower"
						use:holdRepeat={nudge(-1)}
					>
						<Icon name="minus" size={28} />
					</button>
					<div class="text-center">
						<div class="text-6xl font-bold tabular-nums short:text-5xl" data-testid="bpm-value">
							{shownBpm}
						</div>
						<div class="text-sm text-muted">
							{s.timeSignature === '6/8' ? '♪ per minute' : 'BPM'} · {tempoName(shownBpm)}
						</div>
					</div>
					<button
						class="btn size-16 rounded-2xl short:size-14"
						aria-label="Faster"
						use:holdRepeat={nudge(1)}
					>
						<Icon name="plus" size={28} />
					</button>
				</div>
				{#if training}
					<p
						class="rounded-lg bg-surface-2 py-1 text-center text-sm font-semibold text-accent tabular-nums"
						data-testid="trainer-progress"
					>
						{shownBpm} → {s.trainer.target} BPM · {nextStepIn === null
							? 'target reached'
							: `+${s.trainer.step} in ${nextStepIn} ${nextStepIn === 1 ? 'bar' : 'bars'}`}
					</p>
				{/if}
				<div class="flex flex-col gap-2 short:flex-row short:items-center">
					<input
						type="range"
						min={BPM_MIN}
						max={BPM_MAX}
						value={shownBpm}
						oninput={(e) => setTempo(e.currentTarget.valueAsNumber)}
						class="h-11 w-full accent-(--accent) short:flex-1"
						aria-label="Tempo"
					/>
					<button class="btn w-full short:w-auto" onclick={tap} data-testid="tap-tempo">
						<Icon name="tap" /> Tap tempo
					</button>
				</div>
			</section>
		</div>

		<div class="flex flex-col gap-3 short:row-span-2 short:gap-2">
			<section class="card flex flex-col gap-3 short:gap-2 short:p-3">
				<div>
					<h2 class="mb-1 text-sm font-medium text-muted">Time signature</h2>
					<div class="segmented" role="group" aria-label="Time signature">
						{#each Object.keys(TIME_SIGNATURES) as ts (ts)}
							<button
								aria-pressed={s.timeSignature === ts}
								onclick={() => (s.timeSignature = ts as TimeSignature)}>{ts}</button
							>
						{/each}
					</div>
				</div>
				<div>
					<h2 class="mb-1 text-sm font-medium text-muted">Subdivision</h2>
					<div class="segmented" role="group" aria-label="Subdivision">
						{#each SUBDIVISIONS as sub (sub.value)}
							<button
								aria-pressed={s.subdivision === sub.value}
								onclick={() => (s.subdivision = sub.value)}>{sub.label}</button
							>
						{/each}
					</div>
				</div>
				<label class="flex min-h-11 items-center justify-between gap-3">
					<span>Accent beat 1</span>
					<input type="checkbox" bind:checked={s.accent} class="size-6 accent-(--accent)" />
				</label>
			</section>

			<section class="card flex flex-col gap-3 short:p-3" data-testid="speed-trainer">
				<label class="flex min-h-11 items-center justify-between gap-3">
					<span>
						<span class="block font-medium">Speed trainer</span>
						<span class="text-sm text-muted">Raise the tempo as you go</span>
					</span>
					<input
						type="checkbox"
						bind:checked={s.trainer.enabled}
						class="size-6 accent-(--accent)"
					/>
				</label>
				{#if s.trainer.enabled}
					<div class="flex flex-col gap-1">
						{@render stepper('Add BPM', s.trainer.step, 1, 20, (v) => (s.trainer.step = v))}
						{@render stepper(
							'Every … bars',
							s.trainer.everyBars,
							1,
							32,
							(v) => (s.trainer.everyBars = v)
						)}
						{@render stepper(
							'Up to BPM',
							s.trainer.target,
							BPM_MIN,
							BPM_MAX,
							(v) => (s.trainer.target = v)
						)}
					</div>
				{/if}
			</section>
		</div>

		<div
			class="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-auto bg-linear-to-t from-bg from-70% to-transparent px-4 pt-6 pb-3 md:bottom-0 md:mx-0 md:px-0 md:pb-4 short:static short:mx-0 short:mt-0 short:bg-none short:p-0"
		>
			<button
				class="btn btn-primary min-h-16 w-full text-lg shadow-lg short:min-h-14"
				onclick={toggle}
				data-testid="metronome-toggle"
				data-running={running}
			>
				<Icon name={running ? 'stop' : 'play'} size={26} />
				{running ? `Stop · bar ${bar + 1}` : 'Start'}
			</button>
		</div>
	</div>
</main>

{#snippet stepper(label: string, value: number, min: number, max: number, set: (v: number) => void)}
	<div class="flex items-center justify-between gap-2">
		<span class="text-muted">{label}</span>
		<div class="flex items-center gap-1">
			<button
				class="btn"
				aria-label="{label}: less"
				use:holdRepeat={() => set(Math.max(min, value - 1))}
			>
				<Icon name="minus" size={18} />
			</button>
			<span class="w-10 text-center text-lg font-semibold tabular-nums">{value}</span>
			<button
				class="btn"
				aria-label="{label}: more"
				use:holdRepeat={() => set(Math.min(max, value + 1))}
			>
				<Icon name="plus" size={18} />
			</button>
		</div>
	</div>
{/snippet}
