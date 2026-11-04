<script lang="ts" module>
	/** Only the quiz started last answers page-wide keys (a lesson can hold several). */
	let keyOwner = 0;
	let nextId = 1;
</script>

<script lang="ts">
	// One ear-training drill: play, answer with big buttons, hear the root, replay. Choices grow
	// with accuracy and confused pairs come back (./trainer). After an answer every choice stays
	// tappable: it plays that option on the same root, so the wrong one and the right one can be
	// compared; Next moves on. Every answer is stored (it counts toward ear mastery checks). Keys:
	// 1–9 answer (then: hear that option), Space replay, R root, Enter / → / PageDown next.
	import { onDestroy } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { focusOwnsKey, keysSuspended } from '$lib/keys';
	import { chordSemis, intervalById, numeralLabel, type ChordType } from '$lib/theory/scales';
	import { loadEar, saveEarAnswer } from './client';
	import {
		EAR_ITEMS,
		PROGRESSION_KEYS,
		itemLabel,
		orderSet,
		type EarDir,
		type EarKind
	} from './items';
	import {
		chordQuestion,
		intervalQuestion,
		progressionQuestion,
		voiceChord,
		type ChordQuestion,
		type IntervalQuestion,
		type ProgressionQuestion
	} from './questions';
	import { playChord, playChords, playNotes, stopEar } from './sound';
	import { EarTrainer, itemStats, type ItemStats } from './trainer';

	let {
		kind,
		set,
		dir = 'mixed',
		key = 'random',
		count = null,
		compact = false,
		onanswer,
		onstats,
		onchoices
	}: {
		kind: Exclude<EarKind, 'playback'>;
		set: string[];
		dir?: EarDir;
		/** Progressions: the key, or "random" per question. */
		key?: string;
		/** Questions per round (null: until stopped). */
		count?: number | null;
		/** Inside a lesson or a session block. */
		compact?: boolean;
		onanswer?: (r: { item: string; answer: string; correct: boolean }) => void;
		/** Per-item accuracy after each saved answer (all stored answers of the kind). */
		onstats?: (s: ItemStats) => void;
		/** The unlocked items (the answer buttons), whenever they change. */
		onchoices?: (active: string[]) => void;
	} = $props();

	const id = nextId++;
	const ordered = $derived(orderSet(kind, set));
	let trainer = $state<EarTrainer | null>(null);
	let loading = $state(true);
	$effect(() => {
		const k = kind;
		const s = ordered;
		loading = true;
		phase = 'idle';
		let stale = false;
		loadEar(k).then((summary) => {
			// A quiz replaced meanwhile (another kind or set) must not report its stats.
			if (stale) return;
			trainer = new EarTrainer(s, summary.history);
			onstats?.(itemStats(summary.history));
			loading = false;
		});
		return () => {
			stale = true;
		};
	});

	type Q = IntervalQuestion | ChordQuestion | ProgressionQuestion;
	let phase = $state<'idle' | 'asking' | 'answered' | 'done'>('idle');
	let q = $state<Q | null>(null);
	/** Progressions: the items asked (chords 2–4), the answers so far. */
	let items = $state<string[]>([]);
	let answers = $state<string[]>([]);
	let asked = $state(0);
	let unlockedMsg = $state<string | null>(null);
	let playingChord = $state(-1);
	let stats = $state({ right: 0, total: 0, streak: 0, best: 0 });
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** Bumped by every answer: the trainer is a plain object, its choices are read again. */
	let version = $state(0);
	const choices = $derived((void version, trainer?.active ?? []));
	$effect(() => onchoices?.(choices));
	/** Set items not unlocked yet. */
	const locked = $derived(ordered.filter((i) => !choices.includes(i)));
	/** The option last heard after an answer (compare mode). */
	let heardOption = $state<string | null>(null);
	const step = $derived(answers.length);
	const current = $derived(items[step] ?? items[items.length - 1]);

	function newQuestion() {
		if (!trainer) return;
		clearTimeout(timer);
		unlockedMsg = null;
		playingChord = -1;
		heardOption = null;
		answers = [];
		if (kind === 'progressions') {
			const picked: string[] = [];
			let prev = 'I';
			for (let i = 0; i < 3; i++) picked.push((prev = trainer.next(prev)));
			items = picked;
			const k =
				key === 'random'
					? PROGRESSION_KEYS[Math.floor(Math.random() * PROGRESSION_KEYS.length)]
					: key;
			q = progressionQuestion(k, picked);
		} else {
			const item = trainer.next();
			items = [item];
			q =
				kind === 'intervals'
					? intervalQuestion(item, dir, Math.random)
					: chordQuestion(item, Math.random);
		}
		asked++;
		phase = 'asking';
		play();
	}

	function play() {
		if (!q) return;
		keyOwner = id;
		if (q.kind === 'intervals') playNotes(q.notes, { together: q.dir === 'harm' });
		else if (q.kind === 'chords') playChord(q.notes);
		else
			playChords(
				q.chords.map((c) => c.notes),
				1.1,
				(i) => (playingChord = i)
			);
	}

	function reference() {
		if (!q) return;
		keyOwner = id;
		if (q.kind === 'intervals') playNotes([q.low]);
		else if (q.kind === 'chords') playNotes([q.root]);
		else playChords([q.chords[0].notes]);
	}

	/** After an answer: plays option `c` the way the question was played (same root, direction). */
	function hearOption(c: string) {
		if (!q) return;
		keyOwner = id;
		heardOption = c;
		clearTimeout(timer);
		if (q.kind === 'intervals') {
			const semis = intervalById(c)?.semis ?? 0;
			const notes = q.dir === 'desc' ? [q.low + semis, q.low] : [q.low, q.low + semis];
			playNotes(notes, { together: q.dir === 'harm' });
		} else if (q.kind === 'chords') {
			const root = q.root;
			const notes = chordSemis(c as ChordType).map((x) => root + x);
			playChord([...notes, root + 12].sort((a, b) => a - b));
		} else {
			playChords([voiceChord(q.key, 'I').notes, voiceChord(q.key, c).notes], 1.1);
		}
	}

	function start() {
		keyOwner = id;
		stats = { right: 0, total: 0, streak: 0, best: 0 };
		asked = 0;
		newQuestion();
	}

	function answer(choice: string) {
		if (!trainer || phase !== 'asking') return;
		const item = current;
		const r = trainer.answer(item, choice);
		answers = [...answers, choice];
		version++;
		stats = {
			right: trainer.right,
			total: trainer.total,
			streak: trainer.streak,
			best: trainer.bestStreak
		};
		if (r.unlockedItem) unlockedMsg = itemLabel(kind, r.unlockedItem);
		onanswer?.({ item, answer: choice, correct: r.correct });
		saveEarAnswer(kind, item, choice).then((s) => s && onstats?.(itemStats(s.history)));
		if (answers.length < items.length) return;
		phase = 'answered';
		const allRight = answers.every((a, i) => a === items[i]);
		if (count !== null && asked >= count) {
			timer = setTimeout(() => (phase = 'done'), allRight ? 700 : 1600);
			return;
		}
		if (allRight) timer = setTimeout(newQuestion, 1200);
	}

	function next() {
		if (phase === 'idle' || phase === 'done') start();
		else if (phase === 'answered') newQuestion();
	}

	function onkey(e: KeyboardEvent) {
		if (keyOwner !== id || keysSuspended() || focusOwnsKey(e) || e.metaKey || e.ctrlKey) return;
		if (/^Digit[1-9]$/.test(e.code) || /^Numpad[1-9]$/.test(e.code)) {
			const c = choices[Number(e.code.slice(-1)) - 1];
			if (c && phase === 'asking') {
				e.preventDefault();
				answer(c);
			} else if (c && phase === 'answered') {
				e.preventDefault();
				hearOption(c);
			}
		} else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'PageUp') {
			if (q && phase !== 'done') {
				e.preventDefault();
				play();
			}
		} else if (e.code === 'KeyR') {
			reference();
		} else if (['Enter', 'NumpadEnter', 'ArrowRight', 'PageDown', 'ArrowDown'].includes(e.code)) {
			if (phase !== 'asking') {
				e.preventDefault();
				next();
			}
		}
	}

	onDestroy(() => {
		clearTimeout(timer);
		if (keyOwner === id) stopEar();
	});

	const label = (i: string) => itemLabel(kind, i);
	const hint = (i: string) => EAR_ITEMS[kind].find((x) => x.id === i)?.hint ?? '';
	const prompt = $derived(
		kind === 'intervals'
			? 'Which interval?'
			: kind === 'chords'
				? 'Which chord?'
				: `Chord ${Math.min(step, 2) + 2} of 4?`
	);
	const stateOf = (c: string) => {
		if (phase === 'asking' || !answers.length) return 'idle';
		const i = kind === 'progressions' ? answers.length - 1 : 0;
		if (c === items[i]) return 'right';
		if (c === answers[i]) return 'wrong';
		return 'idle';
	};
	const refLabel = $derived(
		kind === 'intervals' ? 'Hear root' : kind === 'chords' ? 'Hear root' : 'Hear I'
	);
	const onChoice = (c: string) => {
		if (phase === 'asking') answer(c);
		else if (phase === 'answered') hearOption(c);
	};
</script>

<svelte:window onkeydown={onkey} />

{#snippet setChips()}
	<!-- The answer choices now, and how many more unlock (at 80% right). -->
	<div class="ml-auto flex flex-wrap items-center gap-1" data-testid="ear-set-chips">
		{#each choices as c (c)}
			<span class="chip font-semibold" data-testid="ear-active-chip" data-item={c}>{label(c)}</span>
		{/each}
		{#if locked.length}
			<span
				class="chip gap-1 text-muted"
				title="Unlock at 80% right: {locked.map(label).join(' ')}"
				data-testid="ear-locked-chip"
				data-count={locked.length}><Icon name="lock" size={13} />{locked.length} more at 80%</span
			>
		{/if}
	</div>
{/snippet}

<div
	class="flex flex-col gap-2.5 {compact ? '' : 'md:gap-3'}"
	data-testid="ear-quiz"
	data-kind={kind}
	data-phase={phase}
	data-item={items.join(',')}
	data-asked={asked}
	data-choices={choices.length}
>
	{#if loading}
		<p class="text-sm text-muted">Loading…</p>
	{:else if phase === 'idle'}
		<button class="btn btn-primary min-h-16 text-lg" onclick={start} data-testid="ear-start">
			<Icon name="play" size={26} />Start{count ? ` · ${count} questions` : ''}
		</button>
		{@render setChips()}
	{:else if phase === 'done'}
		<div class="card flex flex-col items-center gap-2 text-center" data-testid="ear-done">
			<p class="text-2xl font-bold tabular-nums">{stats.right} / {stats.total}</p>
			<p class="text-sm text-muted">Best streak {stats.best}</p>
			<button
				class="btn btn-primary min-h-12 w-full max-w-xs"
				onclick={start}
				data-testid="ear-again"><Icon name="loop" />Again</button
			>
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-1 text-sm">
			<span
				class="chip gap-1 {stats.streak >= 3 ? 'chip-accent' : ''}"
				data-testid="ear-streak"
				data-streak={stats.streak}><Icon name="flame" size={14} />{stats.streak}</span
			>
			<span class="chip tabular-nums" data-testid="ear-score">{stats.right}/{stats.total}</span>
			{#if count}<span class="chip tabular-nums">Q {asked}/{count}</span>{/if}
			{#if unlockedMsg}
				<span class="chip bg-ok! text-ok-fg!" role="status" data-testid="ear-unlocked"
					>+ {unlockedMsg}</span
				>
			{/if}
			{@render setChips()}
		</div>

		<div class="grid grid-cols-[3fr_2fr] gap-2">
			<button class="btn btn-primary min-h-14 text-base" onclick={play} data-testid="ear-replay"
				><Icon name="volume" />Replay<span class="hidden text-xs opacity-70 kbd:inline">Space</span
				></button
			>
			<button class="btn min-h-14 px-3" onclick={reference} data-testid="ear-reference"
				><Icon name="listen" />{refLabel}<span class="hidden text-xs text-muted kbd:inline">R</span
				></button
			>
		</div>

		{#if q?.kind === 'progressions'}
			<ol class="grid grid-cols-4 gap-1.5" data-testid="ear-slots">
				{#each q.chords as _chord, i (i)}
					{@const a = i === 0 ? 'I' : answers[i - 1]}
					{@const done = i === 0 || a !== undefined}
					{@const ok = i === 0 || a === items[i - 1]}
					<li
						class="flex min-h-12 flex-col items-center justify-center rounded-xl border-2 text-lg font-bold {playingChord ===
						i
							? 'border-accent'
							: 'border-line'} {done && i > 0
							? ok
								? 'bg-ok text-ok-fg'
								: 'bg-danger text-white'
							: ''}"
					>
						{done ? numeralLabel(a!) : '?'}
						{#if phase === 'answered' && i > 0 && !ok}
							<span class="text-xs font-semibold">was {numeralLabel(items[i - 1])}</span>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		<p
			class="text-center text-sm font-medium text-muted"
			aria-live="polite"
			data-testid="ear-feedback"
		>
			{#if phase === 'answered'}
				{#if answers.every((a, i) => a === items[i])}
					<span class="text-ok">Yes! {items.map(label).join(' – ')}</span>
				{:else if kind !== 'progressions'}
					<span class="text-danger">It was {label(items[0])}</span> · tap any to hear it
				{:else}
					<span class="text-danger">Not quite</span> · tap a numeral to hear I → it
				{/if}
			{:else}
				{prompt}
			{/if}
		</p>

		<div
			class="grid grid-cols-2 gap-2 {choices.length > 6 ? 'sm:grid-cols-3' : ''}"
			data-testid="ear-choices"
		>
			{#each choices as c, i (c)}
				{@const st = stateOf(c)}
				<button
					class="btn flex min-h-14 flex-col gap-0 py-1 text-lg font-bold {st === 'right'
						? 'bg-ok! text-ok-fg!'
						: st === 'wrong'
							? 'bg-danger! text-white!'
							: ''} {phase === 'answered' && heardOption === c ? 'ring-3 ring-accent' : ''}"
					onclick={() => onChoice(c)}
					aria-label={phase === 'answered' ? `Hear ${label(c)}` : undefined}
					data-testid="ear-choice"
					data-choice={c}
					data-state={st}
				>
					<span class="flex items-center gap-1.5"
						>{#if phase === 'answered'}<Icon name="volume" size={16} />{:else}<span
								class="hidden text-xs font-normal text-muted kbd:inline">{i + 1}</span
							>{/if}{label(c)}</span
					>
					{#if !compact || choices.length <= 4}
						<span class="text-xs font-normal opacity-70">{hint(c)}</span>
					{/if}
				</button>
			{/each}
		</div>

		{#if phase === 'answered'}
			<button class="btn btn-primary min-h-14 text-lg" onclick={next} data-testid="ear-next"
				>Next<Icon name="forward" /></button
			>
		{/if}
	{/if}
</div>
