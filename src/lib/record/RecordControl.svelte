<script lang="ts" module>
	/** What a player offers the recorder: its backing, to record over and to compare with. */
	export type Reference = {
		ready: () => boolean;
		/** The player's own count-in toggle. */
		countIn: () => boolean;
		info: () => { tempoPct: number | null; bpm: number | null; beats: number; clickBpm: number };
		/** The score's own tempo (BPM at 100 %). */
		baseTempo: () => number;
		/** Plays from the top (or the loop's start); resolves with performance.now() once it plays. */
		play: (o: { countIn: boolean; speed?: number }) => Promise<number>;
		stop: () => void;
		/** 0..1 */
		volume: (v: number) => void;
		playing: () => boolean;
		/** The backing repeats (an A-B loop or Repeat): it never ends by itself. */
		looping: () => boolean;
		/** Passes played since the last play() (a looping backing counts each wrap). */
		passes: () => number;
	};
</script>

<script lang="ts">
	// "Rec": record yourself, over the backing (headphones) or solo after a click count-in.
	// While recording, a bar along the bottom says so from across the room (red dot, big time,
	// level, a big Stop, "PageDown stops"), leaving the page's back button and title alone. Hands
	// free: an along take stops at the end of the backing (or after N passes of a loop), a solo
	// take after some seconds of silence. Then the review sheet opens and plays the take. Takes
	// stay in this browser.
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { MIC_HELP, type MicProblem } from '$lib/tuner/mic';
	import { clickCountIn, countBeat } from './countin';
	import { recordingsHref } from './context';
	import {
		alongStop,
		PASS_CHOICES,
		readPasses,
		readSilence,
		SILENCE_CHOICES,
		soloStop,
		writePasses,
		writeSilence
	} from './prefs';
	import { formatDuration, STORAGE_FULL } from './quota';
	import RecButton from './RecButton.svelte';
	import { headphonesLikely, RECORDER_HELP, TakeRecorder, type RecorderProblem } from './recorder';
	import ReviewSheet from './ReviewSheet.svelte';
	import { getTake, updateTake } from './store';
	import type { RecordItem, Take, TakeMode } from './types';

	let {
		item,
		reference,
		showButton = true,
		silenceStop = true
	}: {
		item: RecordItem;
		reference?: Reference;
		/** The button itself (a phone layout may offer it from the ⋯ menu: see openMenu). */
		showButton?: boolean;
		/** Solo takes end after the silence set in the menu (off for warm-ups: stretches are quiet). */
		silenceStop?: boolean;
	} = $props();

	type Phase = 'idle' | 'opening' | 'countin' | 'recording' | 'saving' | 'review';
	let phase = $state<Phase>('idle');
	let menuOpen = $state(false);
	let mode = $state<TakeMode>('along');
	let elapsed = $state(0);
	let level = $state(0);
	let beat = $state(0);
	let headphones = $state<boolean | null>(null);
	let problem = $state<{ title: string; body: string } | null>(null);
	let notice = $state('');
	let silent = $state(false);
	let review = $state<Take | null>(null);
	/** The review was opened by a take just recorded (it plays at once), not by ?take=. */
	let fresh = $state(false);
	let passes = $state(readPasses());
	let silenceS = $state(readSilence());
	/** The backing was looping when the take started (N passes end it). */
	let looping = $state(false);
	let quiet = $state(0);
	let pass = $state(0);
	/** The backing was seen playing (its end, after that, ends an along take). */
	let backingSeen = false;
	let endedAt = 0;
	/** An along take goes on this long after the backing's end (the last chord rings). */
	const TAIL_MS = 1500;
	const recorder = new TakeRecorder();
	/** Solo takes start this long before bar 1 (MediaRecorder needs a moment to get going). */
	const PRE_ROLL_MS = 500;
	let raf = 0;
	/** How the last take ended (the bar and the tests say so). */
	let stoppedBy = $state<'user' | 'auto' | ''>('');
	let abort: AbortController | null = null;
	let destroyed = false;

	const busy = $derived(phase === 'opening' || phase === 'countin' || phase === 'recording');

	/** Opens the mode choice (also from the player's ⋯ menu on phones). */
	export function openMenu() {
		if (phase !== 'idle') return;
		if (!reference) return void start('solo');
		menuOpen = true;
		problem = null;
		headphonesLikely().then((h) => (headphones = h));
	}

	function explain(p: RecorderProblem) {
		problem =
			p in MIC_HELP
				? MIC_HELP[p as MicProblem]
				: RECORDER_HELP[p as Exclude<RecorderProblem, MicProblem>];
	}

	async function start(m: TakeMode) {
		menuOpen = false;
		problem = null;
		notice = '';
		silent = false;
		mode = m;
		phase = 'opening';
		backingSeen = false;
		endedAt = 0;
		quiet = pass = 0;
		looping = m === 'along' && !!reference?.looping();
		const opened = await recorder.open();
		if (opened) return fail(opened);
		if (destroyed) return recorder.close();
		const info = reference?.info();
		const along = m === 'along' && !!reference;
		const countIn = along ? reference!.countIn() : false;
		recorder.onended = (take, p) => void finished(take, p);
		const begin = () =>
			recorder.start({
				...item,
				tempoPct: info?.tempoPct ?? null,
				bpm: info?.bpm ?? null,
				mode: m,
				offsetMs: 0,
				countIn
			});
		tick();
		if (along) {
			const started = await begin();
			if (started) return fail(started);
			phase = 'recording';
			const at = await reference!.play({ countIn }).catch(() => 0);
			if (at && recorder.id)
				await updateTake(recorder.id, { offsetMs: Math.round(at - recorder.startedAt) });
		} else if (reference && info) {
			// Solo: one bar of clicks. The recorder starts just before bar 1 (a short pre-roll, not
			// the whole count-in), and a compare starts the tab where bar 1 is in the take.
			phase = 'countin';
			abort = new AbortController();
			const signal = abort.signal;
			const t0 = performance.now();
			const beatTimer = setInterval(
				() => (beat = countBeat(performance.now() - t0, info.clickBpm)),
				50
			);
			beat = 1;
			const clicks = clickCountIn(info.clickBpm, info.beats, signal);
			const total = (info.beats * 60_000) / info.clickBpm;
			await new Promise((r) => setTimeout(r, Math.max(0, total - PRE_ROLL_MS)));
			const started = signal.aborted ? null : await begin();
			const ok = await clicks;
			clearInterval(beatTimer);
			abort = null;
			if (started) return fail(started);
			if (!ok || destroyed) {
				await recorder.discard();
				recorder.close();
				stopTick();
				phase = 'idle';
				return;
			}
			if (recorder.id)
				await updateTake(recorder.id, {
					offsetMs: Math.max(0, Math.round(performance.now() - recorder.startedAt))
				});
			phase = 'recording';
		} else {
			const started = await begin();
			if (started) return fail(started);
			phase = 'recording';
		}
	}

	function fail(p: RecorderProblem) {
		recorder.close();
		stopTick();
		explain(p);
		phase = 'idle';
	}

	function tick() {
		cancelAnimationFrame(raf);
		const frame = () => {
			elapsed = recorder.elapsed();
			level = level * 0.6 + recorder.level() * 0.4;
			if (elapsed > 3 && recorder.silent) silent = true;
			if (phase === 'recording') autoStop();
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}
	function stopTick() {
		cancelAnimationFrame(raf);
		level = 0;
	}

	/** Hands-free: the end of the backing, N passes of its loop, or the silence after a solo. */
	function autoStop() {
		if (mode === 'along' && reference) {
			const on = reference.playing();
			if (on) backingSeen = true;
			pass = reference.passes();
			const done = looping ? passes > 0 && pass >= passes : backingSeen && !on;
			// A moment for the last note to ring out (the loop's backing is stopped at once).
			if (done && looping) void stop('auto');
			else if (done) {
				endedAt ||= performance.now();
				if (performance.now() - endedAt >= TAIL_MS) void stop('auto');
			} else endedAt = 0;
		} else if (silenceStop && silenceS && !recorder.silent) {
			quiet = recorder.quietFor();
			if (quiet >= silenceS) void stop('auto');
		}
	}

	const stopHint = $derived(
		mode === 'along' && reference
			? alongStop(looping, passes)
			: silenceStop
				? soloStop(silenceS)
				: 'Stop when you are done'
	);
	/** The last seconds of a silence stop are counted down on the bar. */
	const silenceLeft = $derived(
		mode === 'solo' && silenceStop && silenceS && quiet >= Math.min(3, silenceS / 2)
			? Math.max(0, Math.ceil(silenceS - quiet))
			: null
	);

	/** Stop (button, PageDown, or hands-free): saves and opens the review. */
	export async function stop(why: 'user' | 'auto' = 'user') {
		if (phase === 'countin') {
			abort?.abort();
			return;
		}
		if (phase !== 'recording') return;
		phase = 'saving';
		stoppedBy = why;
		if (mode === 'along') reference?.stop();
		const take = await recorder.stop();
		await finished(take, recorder.problem);
	}

	/** The take ended (Stop, or by itself: page hidden, storage full, the mic went away). */
	async function finished(take: Take | null, p: RecorderProblem | null) {
		if (phase === 'idle' || phase === 'review') return;
		stopTick();
		if (mode === 'along' && reference?.playing()) reference.stop();
		recorder.close();
		if (p === 'storage-full' && take) notice = STORAGE_FULL;
		else if (p === 'failed') notice = RECORDER_HELP.failed.body;
		if (destroyed) return;
		if (take) {
			review = take;
			fresh = true;
			phase = 'review';
		} else {
			phase = 'idle';
			// Full before anything was saved: say so, not "saved up to this point".
			if (p === 'storage-full') explain('no-room');
			else if (!notice) notice = 'Nothing was recorded.';
		}
	}

	function onKey(e: KeyboardEvent) {
		if (!busy) {
			if (e.code === 'Escape' && menuOpen) menuOpen = false;
			return;
		}
		// The pedal's "next" key stops the take; nothing underneath (a ladder's Clean) sees it.
		if (e.code === 'PageDown' || e.code === 'Escape') {
			e.preventDefault();
			e.stopImmediatePropagation();
			void stop('user');
		}
	}

	function onOutside(e: PointerEvent) {
		if (menuOpen && !(e.target as Element | null)?.closest('[data-popover=rec]')) menuOpen = false;
	}

	onMount(() => {
		// /recordings → "Compare": the item opens with that take's review.
		const id = page.url.searchParams.get('take');
		if (!id) return;
		getTake(id).then((t) => {
			if (t && t.itemType === item.itemType && t.itemId === item.itemId && phase === 'idle') {
				review = t;
				fresh = false;
				phase = 'review';
			}
		});
	});

	onDestroy(() => {
		destroyed = true;
		abort?.abort();
		stopTick();
		if (recorder.recording) void recorder.stop().finally(() => recorder.close());
		else recorder.close();
	});

	const meterPct = $derived(Math.min(100, Math.round(Math.sqrt(level) * 100)));
</script>

<svelte:window onkeydowncapture={onKey} onpointerdown={onOutside} />

<span class="relative" data-popover="rec">
	{#if showButton}
		<RecButton
			onclick={() => (menuOpen ? (menuOpen = false) : openMenu())}
			expanded={reference ? menuOpen : undefined}
			pressed={busy}
			disabled={phase !== 'idle' && phase !== 'opening'}
		/>
	{/if}

	{#if menuOpen && reference}
		<div
			class="absolute right-0 bottom-full z-30 mb-2 flex w-72 max-w-[calc(100vw-1rem)] flex-col gap-1.5 rounded-2xl border border-line bg-surface p-2 shadow-xl"
			role="menu"
			data-testid="rec-menu"
		>
			<button
				class="btn min-h-14 flex-col items-start justify-center gap-0 text-left"
				role="menuitem"
				onclick={() => start('along')}
				disabled={!reference.ready()}
				data-testid="rec-along"
			>
				<span class="flex items-center gap-1.5 font-semibold"
					><span class="size-2.5 rounded-full bg-danger"></span>Record with the backing</span
				>
				<span class="text-xs font-normal text-muted"
					>{reference.countIn() ? 'Count-in, then the' : 'The'} tab plays · {alongStop(
						reference.looping(),
						passes
					).toLowerCase()}</span
				>
			</button>
			<button
				class="btn min-h-14 flex-col items-start justify-center gap-0 text-left"
				role="menuitem"
				onclick={() => start('solo')}
				data-testid="rec-solo"
			>
				<span class="flex items-center gap-1.5 font-semibold"
					><span class="size-2.5 rounded-full bg-danger"></span>Record solo</span
				>
				<span class="text-xs font-normal text-muted"
					>One bar of clicks, then just you · {soloStop(silenceS).toLowerCase()}</span
				>
			</button>
			<div class="flex flex-col gap-1 px-1 text-xs" data-testid="rec-autostop">
				{#if reference.looping()}
					<label class="flex items-center justify-between gap-2">
						<span>Loop: stop after</span>
						<select
							class="field min-h-9 py-0 text-xs"
							bind:value={passes}
							onchange={() => writePasses(passes)}
							data-testid="rec-passes"
						>
							{#each PASS_CHOICES as n (n)}
								<option value={n}>{n ? `${n} pass${n === 1 ? '' : 'es'}` : 'never (Stop)'}</option>
							{/each}
						</select>
					</label>
				{/if}
				<label class="flex items-center justify-between gap-2">
					<span>Solo: stop after silence of</span>
					<select
						class="field min-h-9 py-0 text-xs"
						bind:value={silenceS}
						onchange={() => writeSilence(silenceS)}
						data-testid="rec-silence"
					>
						{#each SILENCE_CHOICES as n (n)}
							<option value={n}>{n ? `${n} s` : 'never (Stop)'}</option>
						{/each}
					</select>
				</label>
			</div>
			<p
				class="flex items-start gap-1.5 px-1 text-xs leading-snug {headphones
					? 'text-ok'
					: 'text-muted'}"
				data-testid="rec-headphones"
			>
				<Icon name="listen" size={14} />
				{#if headphones}
					Headphones detected: the backing stays out of the take.
				{:else}
					Use headphones with the backing, or the mic records it too.
				{/if}
			</p>
			<a
				class="px-1 text-xs font-medium text-accent underline"
				href={recordingsHref(base, item)}
				data-testid="rec-library-link">My recordings</a
			>
		</div>
	{/if}
</span>

{#if problem}
	<div
		class="fixed inset-x-2 top-2 z-50 mx-auto flex max-w-md items-start gap-2 rounded-2xl border border-line bg-surface p-3 shadow-xl"
		role="alert"
		data-testid="rec-problem"
	>
		<span class="text-danger"><Icon name="alert" /></span>
		<div class="min-w-0 flex-1">
			<p class="font-semibold">{problem.title}</p>
			<p class="text-sm text-muted">{problem.body}</p>
		</div>
		<button class="btn px-2" onclick={() => (problem = null)} aria-label="Close"
			><Icon name="close" size={18} /></button
		>
	</div>
{/if}

{#if busy || phase === 'saving'}
	<!-- Readable from a metre away, along the bottom (the page's back button and title stay
	     visible): red dot, big time, level, a big Stop, and how it stops by itself. -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 border-t-2 border-danger bg-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.35)] short:pt-1 short:pb-[max(0.25rem,env(safe-area-inset-bottom))]"
		role="status"
		aria-live="polite"
		data-testid="rec-bar"
		data-phase={phase}
		data-mode={mode}
		data-stopped-by={stoppedBy}
	>
		<div class="mx-auto flex max-w-3xl items-center gap-3">
			<span
				class="size-6 shrink-0 rounded-full bg-danger {phase === 'recording'
					? 'rec-pulse'
					: 'opacity-50'}"
				aria-hidden="true"
			></span>
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<p class="flex flex-wrap items-baseline gap-x-2 leading-none">
					{#if phase === 'countin'}
						<span
							class="text-5xl font-extrabold tabular-nums short:text-4xl"
							data-testid="rec-countin">{beat}</span
						>
						<span class="text-base font-semibold text-muted">count-in…</span>
					{:else if phase === 'opening'}
						<span class="text-2xl font-bold">Starting the mic…</span>
					{:else if phase === 'saving'}
						<span class="text-2xl font-bold">Saving…</span>
					{:else}
						<span
							class="text-5xl font-extrabold text-danger tabular-nums short:text-4xl"
							data-testid="rec-time">{formatDuration(elapsed)}</span
						>
						<span class="text-base font-bold tracking-wide text-danger">REC</span>
						{#if mode === 'along' && looping && passes}
							<span class="text-base font-semibold tabular-nums" data-testid="rec-pass"
								>pass {Math.min(passes, pass + 1)}/{passes}</span
							>
						{/if}
					{/if}
				</p>
				<span class="h-2 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
					<span
						class="block h-full rounded-full {meterPct > 90 ? 'bg-danger' : 'bg-ok'}"
						style:width="{meterPct}%"
						data-testid="rec-level"
						data-level={meterPct}
					></span>
				</span>
				{#if silent}
					<span class="text-sm text-danger">{MIC_HELP.silent.title}: {MIC_HELP.silent.body}</span>
				{:else}
					<span class="text-sm text-muted" data-testid="rec-hint">
						<kbd
							class="rounded border border-line bg-surface-2 px-1 font-sans text-xs font-semibold"
							>PageDown</kbd
						>
						stops ·
						{#if silenceLeft !== null}<span
								class="font-semibold text-fg"
								data-testid="rec-silence-left">Silence: stopping in {silenceLeft} s</span
							>{:else}{stopHint}{/if}
					</span>
				{/if}
			</div>
			<button
				class="btn min-h-14 shrink-0 gap-1.5 bg-danger! px-5 text-xl font-bold text-white! short:min-h-12"
				onclick={() => stop('user')}
				disabled={phase === 'opening' || phase === 'saving'}
				aria-label="Stop recording (PageDown)"
				title="Stop (PageDown)"
				data-testid="rec-stop"><Icon name="stop" />Stop</button
			>
		</div>
	</div>
{/if}

{#if notice && phase === 'idle'}
	<div
		class="fixed inset-x-2 top-2 z-50 mx-auto flex max-w-md items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm shadow-xl"
		role="status"
	>
		<span class="flex-1">{notice}</span>
		<button class="btn px-2" onclick={() => (notice = '')} aria-label="Close"
			><Icon name="close" size={18} /></button
		>
	</div>
{/if}

{#if phase === 'review' && review}
	<ReviewSheet
		take={review}
		{reference}
		{notice}
		autoplay={fresh}
		onclose={() => {
			review = null;
			notice = '';
			phase = 'idle';
		}}
	/>
{/if}

<style>
	.rec-pulse {
		animation: rec-pulse 1.2s ease-in-out infinite;
	}
	@keyframes rec-pulse {
		50% {
			opacity: 0.35;
			transform: scale(0.85);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rec-pulse {
			animation: none;
		}
	}
</style>
