<script lang="ts">
	import { base } from '$app/paths';
	// The practice surface of one session block, reusing the app's own widgets: the tempo ladder,
	// the 1-minute-changes timer, the tab player, the strum widget, chord diagrams. A new-skill
	// block embeds its lesson's practical part (goal, "How to practise this", first widget); the
	// full lesson and the tools open with from=session (a slim bar there keeps the session going).
	import Icon from '$lib/components/Icon.svelte';
	import { getChord } from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import ChangesRun from '$lib/changes/ChangesRun.svelte';
	import { pairKey, type ChangePair } from '$lib/chordChanges';
	import { LADDER_SESSION_KEYS } from '$lib/keys';
	import Inlines from '$lib/learn/Inlines.svelte';
	import LadderPanel from '$lib/learn/LadderPanel.svelte';
	import StrumPattern from '$lib/learn/StrumPattern.svelte';
	import { loadExercise } from '$lib/learn/client';
	import { changesTarget } from '$lib/learn/tools';
	import type { LearnIndex, StrumSlot } from '$lib/learn/types';
	import TabPlayer from '$lib/player/TabPlayer.svelte';
	import { getOptional, sendJson } from '$lib/api';
	import type { Song } from '$lib/content/schema';
	import { barNumber } from '$lib/progress';
	import BlockSurface from './BlockSurface.svelte';
	import type { BlockNote } from './client';
	import { lessonPractice } from './practice';
	import { CHANGES_GOAL } from './planner';
	import type { BlockTarget, PlanBlock } from './types';

	let {
		block,
		index,
		onnote,
		onbusy,
		onchangesdone
	}: {
		block: PlanBlock;
		index: LearnIndex;
		/** What the block measured (ladder events, clean tempo, changes count). */
		onnote?: (note: BlockNote) => void;
		/** A changes round is counting in or running (the runner's Done key waits). */
		onbusy?: (busy: boolean) => void;
		/** A changes round was saved: the block can move on to its rating. */
		onchangesdone?: () => void;
	} = $props();

	const t = $derived(block.target);
	const exercise = $derived(
		t.type === 'exercise' ? index.exercises.find((e) => e.id === t.id) : undefined
	);
	const lesson = $derived(
		t.type === 'lesson' ? index.lessons.find((l) => l.id === t.id) : undefined
	);
	const practice = $derived(lesson ? lessonPractice(lesson) : null);
	/** The lesson's first widget as a block of its own (ladder, changes, strum, tuner). */
	const inner = $derived.by((): PlanBlock | null => {
		const w = practice?.widget;
		if (!w || !lesson) return null;
		let target: BlockTarget | null = null;
		if (w.t === 'exercise') target = { type: 'exercise', id: w.id };
		else if (w.t === 'strum')
			target = { type: 'strum', pattern: w.pattern.join(''), bpm: w.bpm, chord: w.chord ?? null };
		else if (w.t === 'tool' && w.name === 'changes') {
			const a = getChord(w.params.a ?? '')?.id;
			const b = getChord(w.params.b ?? '')?.id;
			if (a && b)
				target = {
					type: 'changes',
					a,
					b,
					target: changesTarget(lesson.mastery, w.params) ?? CHANGES_GOAL
				};
		} else if (w.t === 'tool' && w.name === 'tuner')
			target = { type: 'tool', id: 'tuner', params: w.params };
		return target && { ...block, target };
	});
	const lessonChords = $derived.by(() => {
		const w = practice?.widget;
		return w?.t === 'chords' ? w.ids : w?.t === 'chord' ? [w.id] : [];
	});

	// ---- ladder ----
	let ladder: string[] = [];
	let bestClean = 0;

	// ---- changes ----
	let changesRunning = $state(false);
	let changesResult = $state<{ count: number; best: number } | null>(null);
	let pairs = $state<ChangePair[] | null>(null);
	$effect(() => {
		if (t.type === 'changes' && pairs === null)
			getOptional<ChangePair[]>(fetch, '/api/chord-changes', []).then((p) => (pairs = p));
	});
	const pair = $derived(
		t.type === 'changes'
			? pairs?.find((p) => pairKey(p.chordA, p.chordB) === pairKey(t.a, t.b))
			: undefined
	);
	$effect(() => onbusy?.(changesRunning));

	function startChanges() {
		getAudioContext(); // unlock audio inside the tap
		changesResult = null;
		changesRunning = true;
	}

	function savePlay(song: Song, tempoPct: number, loop: { start: number; end: number } | null) {
		sendJson(`/api/songs/${encodeURIComponent(song.id)}/progress`, 'PUT', {
			tempoPct,
			loopStartBar: loop?.start ?? null,
			loopEndBar: loop?.end ?? null,
			played: true
		}).catch(() => {
			// best effort, as on the player page
		});
	}
</script>

<div class="flex min-h-0 flex-1 flex-col" data-testid="block-surface" data-type={t.type}>
	{#if t.type === 'exercise' && exercise}
		{#await loadExercise(fetch, exercise.id)}
			<p class="p-4 text-muted">Loading the ladder…</p>
		{:then detail}
			<LadderPanel
				{exercise}
				{detail}
				keys={LADDER_SESSION_KEYS}
				onrate={(r) => {
					ladder = [...ladder, r.clean ? 'clean' : 'miss'];
					if (r.event === 'up' || r.event === 'down' || r.event === 'mastered')
						ladder = [...ladder, r.event];
					if (r.clean) bestClean = Math.max(bestClean, r.bpm);
					onnote?.({ ladder, ...(bestClean ? { bpm: bestClean } : {}) });
				}}
			/>
		{/await}
	{:else if t.type === 'changes'}
		{@const a = getChord(t.a)}
		{@const b = getChord(t.b)}
		{#if a && b}
			{#if changesRunning}
				<div class="flex min-h-0 flex-1 flex-col p-3">
					<ChangesRun
						a={a.id}
						b={b.id}
						voicingA={a.voicings[0]}
						voicingB={b.voicings[0]}
						tapMode={false}
						best={pair?.best ?? null}
						onsaved={(p, count) => {
							pairs = [
								p,
								...(pairs ?? []).filter((x) => pairKey(x.chordA, x.chordB) !== pairKey(t.a, t.b))
							];
							changesResult = { count, best: p.best };
							changesRunning = false;
							onnote?.({ changes: count, changesTarget: t.target });
							onchangesdone?.();
						}}
						oncancel={() => (changesRunning = false)}
					/>
				</div>
			{:else}
				<div
					class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3 short:flex-row"
				>
					<div class="grid w-full max-w-sm grid-cols-2 gap-4 short:max-w-64">
						<div>
							<p class="text-center text-2xl font-bold">{a.id}</p>
							<ChordDiagram voicing={a.voicings[0]} label="{a.id} diagram" />
						</div>
						<div>
							<p class="text-center text-2xl font-bold">{b.id}</p>
							<ChordDiagram voicing={b.voicings[0]} label="{b.id} diagram" />
						</div>
					</div>
					<div class="flex w-full max-w-sm flex-col gap-3">
						{#if changesResult}
							<p
								class="rounded-xl bg-surface-2 px-3 py-2 text-center"
								role="status"
								data-testid="changes-saved"
							>
								Saved: <b>{changesResult.count}</b> changes · best {changesResult.best}
							</p>
						{/if}
						<p class="text-center text-sm text-muted">
							Best <b class="text-fg tabular-nums">{pair?.best ?? '–'}</b> / min · goal {t.target}
						</p>
						<button
							class="btn btn-primary min-h-14 text-lg"
							onclick={startChanges}
							data-testid="changes-start"
						>
							<Icon name="timer" size={24} />{changesResult ? 'Go again' : 'Start 1 minute'}
						</button>
					</div>
				</div>
			{/if}
		{/if}
	{:else if t.type === 'song'}
		{#await getOptional<Song | null>(fetch, `/api/songs/${encodeURIComponent(t.id)}`, null)}
			<p class="p-4 text-muted">Loading the song…</p>
		{:then song}
			{#if song}
				<p class="flex flex-wrap gap-2 px-3 pb-2 text-sm short:hidden">
					<span class="chip">Tempo {t.tempoPct}%</span>
					{#if t.loop}<span class="chip"
							>Loop bars {barNumber(t.loop.start, song.pickup)}–{barNumber(
								t.loop.end,
								song.pickup
							)}</span
						>{/if}
				</p>
				<div class="flex min-h-0 flex-1 flex-col border-t border-line">
					<TabPlayer
						tex={song.tex}
						initialTempoPct={t.tempoPct}
						initialLoop={t.loop}
						onplay={(p) => savePlay(song, p.tempoPct, p.loop)}
					/>
				</div>
			{:else}
				<p class="p-4 text-muted">This song is not available offline yet.</p>
			{/if}
		{/await}
	{:else if t.type === 'strum'}
		<div class="flex flex-1 flex-col items-center justify-center overflow-y-auto p-4">
			<div class="w-full max-w-md">
				<StrumPattern
					pattern={t.pattern.split('') as StrumSlot[]}
					bpm={t.bpm}
					chord={t.chord ?? undefined}
				/>
			</div>
		</div>
	{:else if t.type === 'lesson' && lesson && practice}
		<!-- The lesson's practical part, right here: goal, steps, its first widget. -->
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto" data-testid="lesson-practice">
			<div class="flex flex-col gap-2 px-3 pb-3 md:px-6">
				{#if practice.steps.length}
					<details
						class="rounded-2xl bg-surface-2 px-3 py-2"
						open={!inner || inner.target.type === 'strum'}
						data-testid="lesson-steps"
					>
						<summary class="cursor-pointer py-1 font-semibold">How to practise this</summary>
						<ul class="mt-1 flex list-disc flex-col gap-1 pl-5 leading-snug marker:text-accent">
							{#each practice.steps as step, i (i)}
								<li><Inlines nodes={step} /></li>
							{/each}
						</ul>
					</details>
				{/if}
				<a
					href="{base}/learn/{lesson.id}?from=session"
					class="inline-flex min-h-11 items-center gap-1 self-start text-sm text-accent underline underline-offset-2"
					data-testid="open-lesson"><Icon name="book" size={18} />Read the full lesson</a
				>
			</div>
			{#if inner}
				<div
					class="flex flex-col border-t border-line {inner.target.type === 'exercise'
						? 'min-h-[34rem] md:min-h-[28rem] short:min-h-[22rem]'
						: 'min-h-72'}"
					data-testid="lesson-widget"
					data-widget={inner.target.type}
				>
					<BlockSurface block={inner} {index} {onnote} {onbusy} {onchangesdone} />
				</div>
			{:else if lessonChords.length}
				<div
					class="grid grid-cols-2 gap-2 border-t border-line p-3 sm:grid-cols-3"
					data-testid="lesson-widget"
					data-widget="chords"
				>
					{#each lessonChords as id (id)}
						{@const chord = getChord(id)}
						{#if chord}<ChordCard {chord} />{/if}
					{/each}
				</div>
			{/if}
		</div>
	{:else if t.type === 'tool'}
		<div class="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
			<span class="rounded-2xl bg-surface-2 p-4 text-accent"
				><Icon name={t.id === 'tuner' ? 'tuner' : 'metronome'} size={40} /></span
			>
			<a
				href="{base}/tools/{t.id}?{new URLSearchParams({ ...t.params, from: 'session' })}"
				class="btn btn-primary min-h-14 w-full max-w-sm text-lg"
				data-testid="open-tool"
				><Icon name={t.id === 'tuner' ? 'tuner' : 'metronome'} />Open the {t.id}</a
			>
			<p class="max-w-sm text-sm text-muted">
				The block timer keeps running there; “Back to session” returns here.
			</p>
		</div>
	{:else}
		<p class="p-4 text-muted">This item is not available any more: skip it.</p>
	{/if}
</div>
