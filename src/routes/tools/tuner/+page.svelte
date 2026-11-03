<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { PitchDetector } from 'pitchy';
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { pluck } from '$lib/audio/pluck';
	import { centsBetween, freqToNote, parseNote } from '$lib/music/notes';
	import Gauge from '$lib/tuner/Gauge.svelte';
	import {
		classifyMicError,
		MIC_HELP,
		micPrecheck,
		openMic,
		stopStream,
		type MicProblem
	} from '$lib/tuner/mic';
	import { PitchTracker, rmsOf } from '$lib/tuner/pitch';
	import {
		centsTone,
		getTuning,
		IN_TUNE_CENTS,
		nearestString,
		stringFreqs,
		TUNINGS
	} from '$lib/tuner/tunings';

	// AnalyserNode + requestAnimationFrame rather than an AudioWorklet: pitchy runs on the main
	// thread either way, a display only needs ~60 readings/s, rAF pauses with the screen (battery),
	// and it avoids shipping/bundling a worklet module. 4096 samples (~85 ms) holds 7 periods of low E.
	const WINDOW = 4096;
	const HOLD_MS = 3000; // keep showing the last reading after the string stops
	const IN_TUNE_HOLD_MS = 400; // in tune this long = "held" (green check, haptic tick)
	const TUNING_KEY = 'tuner:tuning';

	type Status = 'idle' | 'starting' | 'listening' | 'error';
	type Reading = { string: number; cents: number; freq: number; heard: string };

	let status = $state<Status>('idle');
	let problem = $state<MicProblem | null>(null);
	let tuningId = $state(TUNINGS[0].id);
	let locked = $state<number | null>(null);
	let reading = $state<Reading | null>(null);
	let stale = $state(false);
	let held = false; // in tune long enough for the haptic tick
	let lastString = $state(0);

	const tuning = $derived(getTuning(tuningId));
	const targets = $derived(stringFreqs(tuning));
	const tone = $derived(reading ? centsTone(reading.cents) : null);
	const inTune = $derived(tone === 'ok' && !stale);
	const shown = $derived(
		reading ? tuning.notes[reading.string] : locked !== null ? tuning.notes[locked] : null
	);
	const selected = $derived(locked ?? reading?.string ?? lastString);

	let ctx: AudioContext | null = null;
	let stream: MediaStream | null = null;
	let source: MediaStreamAudioSourceNode | null = null;
	let analyser: AnalyserNode | null = null;
	let raf = 0;
	let destroyed = false;
	/** Bumped by every start and stop: a getUserMedia that resolves for an old start is dropped. */
	let startToken = 0;
	const tracker = new PitchTracker();
	const detector = PitchDetector.forFloat32Array(WINDOW);
	detector.minVolumeDecibels = -50;
	const buf = new Float32Array(WINDOW);
	let lastHeardAt = 0;
	let inTuneSince = 0;
	let startedAt = 0;
	let gotSignal = false;
	let stopRef: (() => void) | null = null;

	onMount(() => {
		try {
			const saved = localStorage.getItem(TUNING_KEY);
			if (saved && TUNINGS.some((t) => t.id === saved)) tuningId = saved;
		} catch {
			// no storage: default tuning
		}
		// Linked from a lesson: ?tuning=drop-d
		const q = page.url.searchParams.get('tuning');
		if (q && TUNINGS.some((t) => t.id === q)) tuningId = q;
		const pre = micPrecheck();
		if (pre) fail(pre);
		document.addEventListener('visibilitychange', onVisibility);
	});

	onDestroy(() => {
		destroyed = true;
		stop();
		stopRef?.();
		if (typeof document !== 'undefined')
			document.removeEventListener('visibilitychange', onVisibility);
	});

	// Release the microphone when the app goes to the background (also mid-permission-prompt).
	function onVisibility() {
		if (document.visibilityState === 'hidden' && (status === 'listening' || status === 'starting'))
			stop();
	}

	function setTuning(id: string) {
		tuningId = id;
		locked = null;
		reading = null;
		tracker.reset();
		try {
			localStorage.setItem(TUNING_KEY, id);
		} catch {
			// not remembered
		}
	}

	function fail(p: MicProblem) {
		stop();
		problem = p;
		status = 'error';
	}

	async function start() {
		const pre = micPrecheck();
		if (pre) return fail(pre);
		problem = null;
		status = 'starting';
		const token = ++startToken;
		// Created inside the tap: iOS only allows audio to start from a user gesture.
		const ac = (ctx = getAudioContext('play-and-record'));
		let mic: MediaStream;
		try {
			mic = await openMic();
		} catch (e) {
			if (token === startToken) fail(classifyMicError(e));
			return;
		}
		// Stopped, backgrounded or left while the permission prompt was open: release the mic.
		if (token !== startToken || destroyed) return stopStream(mic);
		stream = mic;
		mic.getAudioTracks()[0]?.addEventListener('ended', () => {
			if (status === 'listening') fail('busy');
		});
		source = ac.createMediaStreamSource(mic);
		analyser = ac.createAnalyser();
		analyser.fftSize = WINDOW;
		source.connect(analyser);
		await ac.resume().catch(() => {});
		if (token !== startToken) return;
		tracker.reset();
		reading = null;
		gotSignal = false;
		startedAt = performance.now();
		status = 'listening';
		raf = requestAnimationFrame(frame);
	}

	function stop() {
		startToken++;
		cancelAnimationFrame(raf);
		source?.disconnect();
		stopStream(stream);
		source = analyser = stream = null;
		if (status !== 'error') status = 'idle';
		reading = null;
		held = stale = false;
		// Nothing else plays while the tuner is open: let the audio hardware sleep (battery).
		if (ctx?.state === 'running') ctx.suspend().catch(() => {});
	}

	function frame(now: number) {
		if (!analyser || !ctx) return;
		analyser.getFloatTimeDomainData(buf);
		const rms = rmsOf(buf);
		if (!gotSignal) {
			gotSignal = rms > 1e-6;
			// iOS sometimes grants the mic but delivers pure digital silence until Safari restarts.
			if (!gotSignal && now - startedAt > 3500) return fail('silent');
		}
		const [f, clarity] = detector.findPitch(buf, ctx.sampleRate);
		// Locked: readings fold into the locked string's octave, deliberately. The player has said
		// which string they are tuning, so harmonics and octave errors count as that string (an E4
		// played while locked to E2 reads as an in-tune E2; Auto mode would show the E4 string).
		const freq = tracker.push(f, clarity, {
			rms,
			target: locked !== null ? targets[locked] : undefined
		});
		if (freq !== null) {
			const string = locked ?? nearestString(freq, tuning).index;
			const note = freqToNote(freq);
			reading = {
				string,
				cents: centsBetween(freq, targets[string]),
				freq,
				heard: `${note.name}${note.octave}`
			};
			lastString = string;
			lastHeardAt = now;
			stale = false;
			if (Math.abs(reading.cents) <= IN_TUNE_CENTS) {
				inTuneSince ||= now;
				if (!held && now - inTuneSince >= IN_TUNE_HOLD_MS) {
					held = true;
					navigator.vibrate?.(25);
				}
			} else {
				inTuneSince = 0;
				held = false;
			}
		} else if (reading && now - lastHeardAt > 250) {
			// Hold: the last reading stays (dimmed) for a moment after the note dies away.
			stale = true;
			inTuneSince = 0;
			if (now - lastHeardAt > HOLD_MS) {
				reading = null;
				held = stale = false;
			}
		}
		raf = requestAnimationFrame(frame);
	}

	function toggleLock(i: number) {
		locked = locked === i ? null : i;
		tracker.reset();
		reading = null;
		held = false;
	}

	function playReference() {
		const ac = getAudioContext(status === 'listening' ? 'play-and-record' : 'playback');
		stopRef?.();
		stopRef = pluck(ac, targets[selected], { seconds: 4, halfLife: 1.5, gain: 0.7 });
	}

	const centsText = (cents: number) => {
		const c = Math.round(cents);
		return `${c > 0 ? '+' : c < 0 ? '−' : '±'}${Math.abs(c)}`;
	};
	const toneText = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' };
</script>

<svelte:head><title>Tuner · Self-Guitar</title></svelte:head>

<main
	class="mx-auto flex w-full max-w-xl flex-1 flex-col p-4 md:p-8 short:max-w-5xl short:py-2 md:short:p-4"
>
	<ToolHeader title="Tuner">
		{#snippet actions()}
			<label class="sr-only" for="tuning">Tuning</label>
			<select
				id="tuning"
				class="field text-sm font-medium"
				value={tuningId}
				onchange={(e) => setTuning(e.currentTarget.value)}
				data-testid="tuning-select"
			>
				{#each TUNINGS as t (t.id)}
					<option value={t.id}>{t.name}</option>
				{/each}
			</select>
		{/snippet}
	</ToolHeader>

	<div class="flex flex-1 flex-col gap-4 short:grid short:grid-cols-[1.15fr_1fr] short:gap-4">
		<section
			class="card flex flex-1 flex-col items-center justify-center gap-1 transition-colors short:py-2 {inTune
				? 'border-ok!'
				: ''} {status === 'error' ? 'border-danger!' : ''}"
			data-testid="tuner-readout"
			data-status={status}
		>
			{#if status === 'error' && problem}
				<!-- In place of the readout, so the Try again button below stays on screen. -->
				<div
					class="flex flex-col items-center gap-2 text-center"
					role="alert"
					data-testid="mic-problem"
					data-problem={problem}
				>
					<span class="text-danger"><Icon name="alert" size={40} /></span>
					<p class="text-lg font-semibold">{MIC_HELP[problem].title}</p>
					<p class="text-sm text-muted">{MIC_HELP[problem].body}</p>
				</div>
			{:else}
				<div class="flex items-center justify-center gap-5" aria-live="polite">
					<div
						class="flex h-28 items-start font-bold tabular-nums short:h-16 {stale
							? 'opacity-50'
							: ''} {inTune ? 'text-ok' : ''}"
						data-testid="tuner-note"
						data-note={reading ? tuning.notes[reading.string] : ''}
					>
						{#if shown}
							{@const n = parseNote(shown)}
							<span class="text-8xl leading-none short:text-6xl">{n.name}</span>
							<span class="mt-auto text-3xl text-muted">{n.octave}</span>
						{:else}
							<span class="text-8xl leading-none text-muted opacity-40 short:text-6xl">♪</span>
						{/if}
					</div>
					{#if reading && tone}
						<div
							class="text-right leading-none font-bold tabular-nums {toneText[tone]} {stale
								? 'opacity-50'
								: ''}"
							data-testid="tuner-cents"
							data-tone={tone}
						>
							<span class="text-6xl short:text-4xl">{centsText(reading.cents)}</span>
							<span class="block text-xl text-muted short:text-base">cents</span>
						</div>
					{/if}
				</div>
				<div class="w-full max-w-sm short:max-w-52">
					<Gauge cents={reading?.cents ?? null} dim={stale} />
				</div>
				<p
					class="flex h-12 items-center gap-2 text-4xl font-bold short:h-9 short:text-[2rem] {stale
						? 'opacity-50'
						: ''}"
					data-testid="tuner-direction"
				>
					{#if reading && tone}
						{#if tone === 'ok'}
							<span class="flex items-center gap-2 text-ok">
								<Icon name="check" size={36} />In tune
							</span>
						{:else}
							<span class="flex items-center gap-1 {toneText[tone]}">
								<Icon name={reading.cents < 0 ? 'up' : 'down'} size={40} />
								{reading.cents < 0 ? 'Tighten' : 'Loosen'}
							</span>
						{/if}
					{:else if status === 'listening'}
						<span class="text-lg font-normal text-muted">Play a string</span>
					{:else}
						<span class="text-lg font-normal text-muted"
							>{tuning.name}: {tuning.notes.map((n) => parseNote(n).name).join(' ')}</span
						>
					{/if}
				</p>
				<p class="h-5 text-sm text-muted tabular-nums" data-testid="tuner-heard">
					{#if reading}Hearing {reading.heard} · {reading.freq.toFixed(1)} Hz{/if}
				</p>
			{/if}
		</section>

		<div class="mt-auto short:mt-0 short:flex short:flex-col short:justify-center">
			<div class="mb-2 flex items-center justify-between text-sm text-muted">
				<span>{locked === null ? 'Auto: nearest string' : `Locked to ${tuning.notes[locked]}`}</span
				>
				<button class="btn px-4" aria-pressed={locked === null} onclick={() => (locked = null)}
					>Auto</button
				>
			</div>
			<div class="grid grid-cols-6 gap-2" role="group" aria-label="Strings (tap to lock)">
				{#each tuning.notes as note, i (i)}
					{@const n = parseNote(note)}
					<button
						class="btn h-16 flex-col gap-0 px-0 short:h-14 {locked === null &&
						reading?.string === i &&
						!stale
							? 'ring-2 ring-accent'
							: ''}"
						aria-pressed={locked === i}
						aria-label="String {6 - i}, {note}{locked === i ? ' (locked)' : ''}"
						onclick={() => toggleLock(i)}
					>
						<span class="text-xl font-bold">{n.name}<span class="text-xs">{n.octave}</span></span>
						<span class="text-[10px] opacity-70">{6 - i}</span>
					</button>
				{/each}
			</div>
			<div class="mt-3 flex gap-2">
				<button class="btn min-h-14 flex-1" onclick={playReference} data-testid="reference-tone">
					<Icon name="volume" /> Play {tuning.notes[selected]}
				</button>
				{#if status === 'listening' || status === 'starting'}
					<button
						class="btn min-h-14 flex-[1.4] text-base"
						onclick={stop}
						data-testid="tuner-toggle"
					>
						<Icon name="stop" /> Stop
					</button>
				{:else if problem !== 'insecure' && problem !== 'unsupported'}
					<button
						class="btn btn-primary min-h-14 flex-[1.4] text-base"
						onclick={start}
						data-testid="tuner-toggle"
					>
						<Icon name="mic" />
						{status === 'error' ? 'Try again' : 'Start tuner'}
					</button>
				{/if}
			</div>
		</div>
	</div>
</main>
