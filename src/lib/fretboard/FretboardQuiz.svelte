<script lang="ts">
	// "Find the note", timed: a round asks notes one by one; tap every place each one is on the
	// quiz's strings (frets 0–11, fret 12 counts as open). A found note sounds and turns green; a
	// wrong tap flashes red, counts, and shows where the note is while it plays the right one. The
	// round is stored (fretboard mastery checks use the fastest passing round). The whole neck
	// stays on screen (it scales to fit the height).
	import { onDestroy, tick as nextTick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { pluck } from '$lib/audio/pluck';
	import { midiToFreq } from '$lib/music/notes';
	import { midiAt } from '$lib/theory/fretboard';
	import { pretty } from '$lib/theory/notes';
	import type { QuizSummary } from '$lib/core/ear';
	import { loadQuizzes, saveQuizRound } from './client';
	import Fretboard, { type Mark } from './Fretboard.svelte';
	import { hitOf, makeRound, quizSpec, roundPassed, targets } from './quiz';

	let {
		quiz,
		target,
		compact: _compact = false,
		fitHeight = 'max(16rem, calc(100dvh - 9.5rem))',
		onresult
	}: {
		quiz: string;
		/** Goal in seconds (a mastery check's). */
		target?: number;
		compact?: boolean;
		/** CSS max height of the neck: frets 0–11 stay in view while tapping. */
		fitHeight?: string;
		onresult?: (s: QuizSummary) => void;
	} = $props();

	const spec = $derived(quizSpec(quiz));
	let summary = $state<QuizSummary | null>(null);
	$effect(() => {
		const id = quiz;
		loadQuizzes().then((all) => (summary = all.find((s) => s.quiz === id) ?? null));
	});

	let phase = $state<'idle' | 'running' | 'done'>('idle');
	let prompts = $state<string[]>([]);
	let idx = $state(0);
	let found = $state<string[]>([]);
	let marks = $state<Mark[]>([]);
	let wrong = $state(0);
	let flashes = 0;
	let total = $state(0);
	let startedAt = 0;
	let elapsed = $state(0);
	let result = $state<{ ms: number; found: number; wrong: number } | null>(null);
	let tick: ReturnType<typeof setInterval> | undefined;
	let saving = $state(false);
	const note = $derived(prompts[idx] ?? '');
	const goal = $derived(note ? targets(note, spec.strings) : []);

	let root = $state<HTMLElement>();

	function start() {
		prompts = makeRound(spec);
		idx = 0;
		found = [];
		marks = [];
		wrong = 0;
		total = 0;
		result = null;
		startedAt = performance.now();
		elapsed = 0;
		clearInterval(tick);
		tick = setInterval(() => (elapsed = performance.now() - startedAt), 100);
		phase = 'running';
		// The quiz bar at the top of the screen, the whole neck under it.
		nextTick().then(() => root?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
	}

	async function finish() {
		clearInterval(tick);
		const ms = Math.round(performance.now() - startedAt);
		result = { ms, found: total, wrong };
		phase = 'done';
		saving = true;
		const s = await saveQuizRound(quiz, total, wrong, Math.max(500, ms));
		saving = false;
		if (s) {
			summary = s;
			onresult?.(s);
		}
	}

	const hear = (midi: number) =>
		pluck(getAudioContext(), midiToFreq(midi), { gain: 0.6, seconds: 1.8, halfLife: 0.6 });

	function tap({ string, fret }: { string: number; fret: number }) {
		if (phase !== 'running') return;
		const hit = hitOf(note, spec.strings, string, fret);
		const k = hit && `${hit.string}:${hit.fret}`;
		if (!hit || !k) {
			wrong++;
			// Where the note is (still to find), and how it sounds: the nearest one on the tapped
			// string, else the first.
			const left = goal.filter((g) => !found.includes(`${g.string}:${g.fret}`));
			const near =
				left
					.filter((g) => g.string === string)
					.sort((a, b) => Math.abs(a.fret - fret) - Math.abs(b.fret - fret))[0] ?? left[0];
			if (near) hear(midiAt(near.string, near.fret));
			// Tagged: the marks in state are proxies, so they are removed by their tag.
			const tag = ++flashes;
			const m: Mark = { string, fret, kind: 'miss', tag };
			const shown: Mark[] = left.map((g) => ({ ...g, kind: 'show', label: pretty(note), tag }));
			marks = [...marks, m, ...shown];
			// The answer must be seen: bring it on screen at once (no-op when already visible).
			nextTick().then(() =>
				root
					?.querySelector('[data-testid=fret-mark][data-kind=show]')
					?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
			);
			setTimeout(() => (marks = marks.filter((x) => x.tag !== tag)), 1100);
			navigator.vibrate?.([30, 40, 30]);
			return;
		}
		if (found.includes(k)) return;
		hear(midiAt(string, fret));
		found = [...found, k];
		total++;
		marks = [...marks, { string, fret, kind: 'hit', label: pretty(note) }];
		if (found.length < goal.length) return;
		if (idx + 1 >= prompts.length) {
			finish();
			return;
		}
		// Next note: a short beat to see the last one land.
		setTimeout(() => {
			idx++;
			found = [];
			marks = [];
		}, 350);
	}

	onDestroy(() => clearInterval(tick));

	const secs = (ms: number) => (ms / 1000).toFixed(1);
	const passed = $derived(result ? roundPassed(result.found, result.wrong) : false);
	const metGoal = $derived(
		!!result && passed && target !== undefined && result.ms <= target * 1000
	);
</script>

<div
	bind:this={root}
	class="flex scroll-mt-1 flex-col gap-2 {phase === 'running' ? 'min-h-[calc(100dvh-4rem)]' : ''}"
	data-testid="fret-quiz"
	data-quiz={quiz}
	data-phase={phase}
	data-note={note}
>
	{#if phase === 'idle'}
		<div class="flex items-center gap-2" data-testid="quiz-idle">
			<p class="min-w-0 flex-1 text-sm leading-snug">
				<b>{spec.title}</b>
				<span class="block text-xs text-muted" data-testid="quiz-caption"
					>{spec.fixed
						? `Tap every ${pretty(spec.fixed)}, fast`
						: `${spec.prompts} notes · tap each on the lit string${spec.strings.length > 1 ? 's' : ''}`}{target
						? ` · goal ${target} s`
						: ''}{summary?.best ? ` · best ${secs(summary.best)} s` : ''}</span
				>
			</p>
			<button
				class="btn btn-primary min-h-12 shrink-0 px-5 text-lg"
				onclick={start}
				data-testid="quiz-start"><Icon name="timer" size={22} />Start</button
			>
		</div>
	{:else}
		<div
			class="sticky top-0 z-10 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2"
			data-testid="quiz-bar"
		>
			{#if phase === 'running'}
				<span class="text-sm text-muted">Find</span>
				<span class="text-3xl font-bold" data-testid="quiz-note">{pretty(note)}</span>
				<span class="text-sm text-muted tabular-nums">{found.length}/{goal.length}</span>
				<span class="ml-auto flex flex-col items-end leading-tight">
					<span class="text-lg font-semibold tabular-nums">{secs(elapsed)} s</span>
					<span class="text-xs text-muted tabular-nums"
						>note {idx + 1}/{prompts.length}{wrong ? ` · ${wrong} miss` : ''}</span
					>
				</span>
			{:else if result}
				<span
					class="min-w-0 flex-1"
					data-testid="quiz-result"
					data-ms={result.ms}
					data-passed={passed}
				>
					<span class="block text-lg font-bold tabular-nums"
						>{secs(result.ms)} s · {result.found} notes{result.wrong
							? ` · ${result.wrong} miss`
							: ''}</span
					>
					<span class="block text-xs {metGoal ? 'text-ok' : 'text-muted'}"
						>{!passed
							? 'Too many misses to count: slow down'
							: metGoal
								? `Goal of ${target} s reached!`
								: target
									? `Goal ${target} s`
									: 'Saved'}{summary?.best ? ` · best ${secs(summary.best)} s` : ''}{saving
							? ' · saving…'
							: ''}</span
					>
				</span>
				<button class="btn btn-primary" onclick={start} data-testid="quiz-again"
					><Icon name="loop" />Again</button
				>
			{/if}
		</div>
	{/if}
	<Fretboard
		window={[0, 11]}
		{marks}
		tapStrings={phase === 'running' ? spec.strings : phase === 'idle' ? spec.strings : null}
		ontap={tap}
		sound={false}
		fill
		bounds={[0, 11]}
		{fitHeight}
		label="Quiz fretboard"
	/>
</div>
