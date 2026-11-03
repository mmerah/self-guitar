// The session planner (VISION §6): turns the learner's state into today's ordered blocks.
// Pure and deterministic for a given state + date (the date rotates tie-breaks), so it is
// unit-tested directly and also runs in the browser as the offline fallback.
//
// Blocks, in order: warm-up · new skill · technique · review · song. Minutes follow the template
// (warm-up 10% · new 30% · technique 25% · review 15% · song 20%) with fixed rules:
//   - warm-up: 1 minute below 10 minutes, else 2+ (never more than ~15%);
//   - every other block at least 2 minutes, a song at least 3; a reading-only lesson at most 5;
//   - 5–6 minute sessions: the warm-up and one main block (a lesson or a song, not both);
//   - spare minutes go to the new skill, then technique, then the song (each up to a cap);
//     when the plan is too long, technique and then review are dropped first.
import { getChord } from '../chords/index.ts';
import { chordIdPair, lessonPairKey, pairKey } from '../chordChanges.ts';
import { DAY_MS, lastReviewed } from '../learn/review.ts';
import type {
	Block,
	Exercise,
	LearnIndex,
	Lesson,
	LessonState,
	SkillStatus
} from '../learn/types.ts';
import { lessonPractice } from './practice.ts';
import { daysBetween } from './time.ts';
import {
	DEFAULT_SESSION,
	MAX_SESSION,
	MIN_SESSION,
	type BlockKind,
	type BlockTarget,
	type Loop,
	type Plan,
	type PlanBlock
} from './types.ts';

export const TEMPLATE: Record<BlockKind, number> = {
	warmup: 0.1,
	new: 0.3,
	technique: 0.25,
	review: 0.15,
	song: 0.2
};
const ORDER: BlockKind[] = ['warmup', 'new', 'technique', 'review', 'song'];
/** 1-minute changes: a round and a retry. */
const CHANGES_MIN = 2;
/** A lesson with nothing to play is read, not practised: this long at most. */
export const READING_MAX = 5;
/** Default changes goal for pairs no lesson sets a goal for (JustinGuitar's "solid"). */
export const CHANGES_GOAL = 30;
/** Recent ladder passes looked at for the clean ratio. */
export const RECENT_ATTEMPTS = 10;
const WEAK_RATIO = 0.6;
/** Tune first when the guitar has not been played for longer than this. */
const TUNE_AFTER_DAYS = 2;

export type ExerciseSignal = {
	attempts: number;
	mastered: boolean;
	best: number | null;
	/** Where the ladder stands. */
	ladderBpm: number;
	/** Clean passes among the last RECENT_ATTEMPTS. */
	recentClean: number;
	recentTotal: number;
	/** The ladder has not moved up over the recent passes. */
	stalled: boolean;
	lastAt: number | null;
};

export type PairSignal = { a: string; b: string; best: number; lastAt: number | null };

export type SongSignal = {
	id: string;
	title: string;
	level: number;
	bars: number;
	pickup: boolean;
	lastPlayedAt: number | null;
	maxTempoPct: number | null;
	loop: Loop | null;
};

export type SkillSignal = {
	id: string;
	status: SkillStatus;
	dueAt: number | null;
	ease: number | null;
};

export type RecentSession = { date: string; blocks: { kind: BlockKind; target: BlockTarget }[] };

export type PlanState = {
	/** Requested length (clamped to 5–30). */
	minutes: number;
	/** The learner's local day (YYYY-MM-DD): rotates tie-breaks. */
	date: string;
	now: number;
	/** Skills due before this instant count as due today (end of the learner's day). */
	dueBy: number;
	index: LearnIndex;
	lessonStates: Record<string, LessonState>;
	/** The next lesson (evaluate/nextLesson), null when every lesson is done. */
	next: string | null;
	skills: SkillSignal[];
	exercises: Record<string, ExerciseSignal>;
	pairs: PairSignal[];
	songs: SongSignal[];
	/** Recent sessions, newest first. */
	recent: RecentSession[];
};

/** Stalled: six or more recent passes (newest first) without the ladder moving up. */
export const isStalled = (mastered: boolean, recentLadderBpm: number[]) =>
	!mastered && recentLadderBpm.length >= 6 && recentLadderBpm[0] <= recentLadderBpm[5];

// ---- helpers -------------------------------------------------------------------------------------

const dayNumber = (date: string) => Math.abs(daysBetween('2000-01-01', date));

/** Highest score first; equal scores in an order rotated by the date. */
function rank<T>(items: T[], score: (t: T) => number, seed: number): T[] {
	const k = items.length ? seed % items.length : 0;
	return [...items.slice(k), ...items.slice(0, k)]
		.map((t, i) => ({ t, i, s: score(t) }))
		.sort((x, y) => y.s - x.s || x.i - y.i)
		.map((x) => x.t);
}

export function targetKey(t: BlockTarget): string {
	switch (t.type) {
		case 'changes':
			return `changes:${pairKey(t.a, t.b)}`;
		case 'song':
			return `song:${t.id}`;
		case 'strum':
			return `strum:${t.pattern}`;
		default:
			return `${t.type}:${t.id}`;
	}
}

const days = (ms: number) => Math.floor(ms / DAY_MS);

function ago(n: number) {
	if (n <= 0) return 'earlier today';
	if (n === 1) return 'yesterday';
	return `${n} days ago`;
}

export const clampMinutes = (m: number) =>
	Number.isFinite(m)
		? Math.min(MAX_SESSION, Math.max(MIN_SESSION, Math.round(m)))
		: DEFAULT_SESSION;

/** Blocks of a lesson, callouts flattened. */
const flatBlocks = (blocks: Block[]): Block[] =>
	blocks.flatMap((b) => (b.t === 'callout' ? flatBlocks(b.blocks) : [b]));

/**
 * Minutes per block kind for the kinds present. Pure arithmetic on the rules in the header;
 * returns only kinds that get time, summing to `minutes`.
 */
export function splitMinutes(
	minutes: number,
	present: Partial<Record<BlockKind, boolean>>,
	opts: { reading?: boolean } = {}
): Partial<Record<BlockKind, number>> {
	const kinds = ORDER.filter((k) => present[k]);
	if (!kinds.length) return {};
	const main = kinds.filter((k) => k !== 'warmup');
	if (!main.length) return { warmup: minutes };
	const warm = present.warmup ? (minutes >= 10 ? Math.max(2, Math.round(minutes * 0.1)) : 1) : 0;
	const left = minutes - warm;
	// Short sessions: one main block (a lesson, else a song, else technique or review).
	if (minutes < 7) {
		const one = (['new', 'song', 'technique', 'review'] as BlockKind[]).find((k) => present[k])!;
		return { ...(warm ? { warmup: warm } : {}), [one]: left };
	}
	const min: Record<BlockKind, number> = { warmup: 1, new: 2, technique: 2, review: 2, song: 3 };
	const cap: Record<BlockKind, number> = {
		warmup: warm,
		new: opts.reading ? READING_MAX : Math.round(minutes * 0.5),
		technique: Math.round(minutes * 0.35),
		review: Math.max(2, Math.round(minutes * 0.15)),
		song: Infinity
	};
	const out: Partial<Record<BlockKind, number>> = {};
	for (const k of main)
		out[k] = Math.min(cap[k], Math.max(min[k], Math.round(TEMPLATE[k] * minutes)));
	const sum = () => main.reduce((a, k) => a + (out[k] ?? 0), 0);
	// Too long: shrink (song, technique, review, new) to their minimums, then drop blocks.
	for (const k of ['song', 'technique', 'review', 'new'] as BlockKind[])
		while (out[k] !== undefined && out[k]! > min[k] && sum() > left) out[k]!--;
	for (const k of ['technique', 'review', 'song'] as BlockKind[])
		if (sum() > left && out[k] !== undefined && Object.keys(out).length > 1) delete out[k];
	// Spare minutes: new skill, then technique, then song, each up to its cap; then anyone.
	const fill = (order: BlockKind[], capped: boolean) => {
		for (const k of order)
			while (out[k] !== undefined && sum() < left && (!capped || out[k]! < cap[k])) out[k]!++;
	};
	fill(['new', 'technique', 'song'], true);
	fill(['song', 'new', 'technique', 'review'], false);
	return { ...(warm ? { warmup: warm } : {}), ...out };
}

// ---- the planner ---------------------------------------------------------------------------------

type Pick = Omit<PlanBlock, 'minutes' | 'kind'>;

export function planSession(state: PlanState): Plan {
	const minutes = clampMinutes(state.minutes);
	const { index } = state;
	const seed = dayNumber(state.date);
	const exById = new Map(index.exercises.map((e) => [e.id, e]));
	const lessonById = new Map(index.lessons.map((l) => [l.id, l]));
	const skillNames = new Map(
		index.levels.flatMap((l) => l.units.flatMap((u) => u.skills)).map((s) => [s.id, s.name])
	);
	const stateOf = (id: string): LessonState => state.lessonStates[id] ?? 'new';
	const reached = (l: Lesson) => stateOf(l.id) !== 'new';
	const used = new Set<string>();
	const use = <T extends Pick>(p: T): T => (used.add(targetKey(p.target)), p);
	const free = (t: BlockTarget) => !used.has(targetKey(t));

	// Items of the last two sessions are avoided where there is a choice.
	const recentKeys = new Set(
		state.recent.slice(0, 2).flatMap((s) => s.blocks.map((b) => targetKey(b.target)))
	);
	const lastSong = state.recent[0]?.blocks.find((b) => b.target.type === 'song')?.target;

	const next = state.next ? (lessonById.get(state.next) ?? null) : null;
	const level =
		next?.level ?? Math.max(0, ...index.lessons.filter((l) => reached(l)).map((l) => l.level));
	/** Lessons an exercise belongs to (embedded in or checked by). */
	const lessonsOf = (exId: string) =>
		index.lessons.filter(
			(l) =>
				(l.mastery?.type === 'exercise' && l.mastery.id === exId) ||
				flatBlocks(l.blocks).some((b) => b.t === 'exercise' && b.id === exId)
		);
	const exReached = (ex: Exercise) =>
		(state.exercises[ex.id]?.attempts ?? 0) > 0 || lessonsOf(ex.id).some(reached);
	const warmEx = index.exercises.find((e) => e.skills.includes('finger-warmup'));
	const nextWidget = next ? lessonPractice(next).widget : null;
	const nextEx = nextWidget?.t === 'exercise' ? nextWidget.id : null;

	// ---- new skill: the next lesson (the only brand-new concept), else consolidation ----
	let newPick: Pick | null = null;
	if (next) {
		const unit = index.levels
			.find((l) => l.id === next.level)
			?.units.find((u) => u.id === next.unit)?.title;
		const where = `Level ${next.level}${unit ? ` · ${unit}` : ''}`;
		newPick = use({
			title: next.title,
			target: { type: 'lesson', id: next.id },
			why:
				stateOf(next.id) === 'started'
					? `Continue where you left off · ${where}`
					: `Next in ${where}: one new idea today`
		});
	}

	// ---- weak exercises and chord pairs below target ----
	const exScore = (ex: Exercise) => {
		const s = state.exercises[ex.id];
		if (!s || s.attempts === 0 || s.mastered) return -1;
		const ratio = s.recentTotal ? s.recentClean / s.recentTotal : 1;
		const weak = ratio < WEAK_RATIO || s.stalled;
		const stale = s.lastAt !== null && state.now - s.lastAt > 3 * DAY_MS ? 0.2 : 0;
		const recent = recentKeys.has(`exercise:${ex.id}`) ? 0.6 : 0;
		// In-progress (not weak) ladders are a fallback: keep climbing.
		return (weak ? 1 + (1 - ratio) + (s.stalled ? 0.5 : 0) : 0.3) + stale - recent;
	};
	const exerciseCands = rank(
		index.exercises.filter((e) => exScore(e) >= -0.5 && exReached(e)),
		exScore,
		seed
	);
	const exPick = (ex: Exercise, why?: string): Pick => {
		const s = state.exercises[ex.id];
		const ratio = s && s.recentTotal ? Math.round((s.recentClean / s.recentTotal) * 100) : null;
		return {
			title: ex.title,
			target: { type: 'exercise', id: ex.id },
			why:
				why ??
				(s?.stalled
					? `Stuck at ${s.ladderBpm} BPM — slow, clean passes move it again`
					: ratio !== null && ratio < WEAK_RATIO * 100
						? `${ratio}% clean lately — steady it at ${s.ladderBpm} BPM`
						: `Ladder at ${s?.ladderBpm ?? ex.startBpm} of ${ex.targetBpm} BPM — keep climbing`)
		};
	};

	const pairTargets = new Map<string, { a: string; b: string; target: number }>();
	for (const l of index.lessons) {
		// The next lesson's own pair is practised in its lesson block.
		if (l.mastery?.type !== 'changes' || !reached(l) || l.id === next?.id) continue;
		if (!getChord(l.mastery.a) || !getChord(l.mastery.b)) continue;
		const [a, b] = chordIdPair(l.mastery.a, l.mastery.b);
		const key = pairKey(a, b);
		const prev = pairTargets.get(key);
		if (!prev || prev.target < l.mastery.target)
			pairTargets.set(key, { a, b, target: l.mastery.target });
	}
	const pairBest = new Map(state.pairs.map((p) => [pairKey(p.a, p.b), p]));
	const nextPair = next?.mastery?.type === 'changes' ? lessonPairKey(next.mastery) : null;
	for (const p of state.pairs) {
		const key = pairKey(p.a, p.b);
		if (key !== nextPair && !pairTargets.has(key) && getChord(p.a) && getChord(p.b))
			pairTargets.set(key, { a: p.a, b: p.b, target: CHANGES_GOAL });
	}
	const changeCands = rank(
		[...pairTargets.entries()]
			.map(([key, t]) => ({ key, ...t, best: pairBest.get(key)?.best ?? 0 }))
			.filter((c) => c.best < c.target),
		(c) => {
			const last = pairBest.get(c.key)?.lastAt ?? null;
			const stale = last === null || state.now - last > 2 * DAY_MS ? 0.2 : 0;
			return 1 - c.best / c.target + stale - (recentKeys.has(`changes:${c.key}`) ? 0.6 : 0);
		},
		seed
	);
	const changesPick = (c: (typeof changeCands)[number]): Pick => {
		const [a, b] = chordIdPair(c.a, c.b);
		return {
			title: `1-minute changes: ${a} – ${b}`,
			target: { type: 'changes', a, b, target: c.target },
			why: c.best
				? `Best ${c.best}/min, goal ${c.target} — a few more each day`
				: `New pair — goal ${c.target} changes a minute`
		};
	};

	if (!newPick) {
		// Every lesson is done: consolidate the weakest ladder or pair still below target.
		const ex = exerciseCands.find((e) => e !== warmEx);
		const ch = changeCands[0];
		if (ex)
			newPick = use(exPick(ex, 'Every lesson so far is done — polish what is still below target'));
		else if (ch)
			newPick = use({
				...changesPick(ch),
				why: 'Every lesson so far is done — push this pair to its goal'
			});
	}

	// ---- warm-up: tune after a break, else a rotation of short loosening-up items ----
	const known = (l: Lesson) => stateOf(l.id) === 'completed' || stateOf(l.id) === 'mastered';
	const strums = new Map<string, Extract<BlockTarget, { type: 'strum' }>>();
	for (const l of index.lessons.filter(known))
		for (const b of flatBlocks(l.blocks))
			if (b.t === 'strum') {
				const pattern = b.pattern.join('');
				strums.set(pattern, {
					type: 'strum',
					pattern,
					bpm: b.bpm,
					chord: b.chord ? (getChord(b.chord)?.id ?? null) : null
				});
			}
	const pulseEx = index.exercises.find((e) => e.skills.includes('open-string-rhythm'));
	const lastDate = state.recent[0]?.date;
	const tuneFirst = !lastDate || daysBetween(lastDate, state.date) > TUNE_AFTER_DAYS;
	const warmCands: Pick[] = [];
	if (warmEx && (exReached(warmEx) || level >= 1)) {
		const s = state.exercises[warmEx.id];
		warmCands.push({
			title: warmEx.title,
			target: { type: 'exercise', id: warmEx.id },
			why: s?.mastered
				? 'Loosen up the fretting hand at the target tempo'
				: `Loosen up the fretting hand · ladder at ${s?.ladderBpm ?? warmEx.startBpm} of ${warmEx.targetBpm} BPM`
		});
	}
	if (pulseEx && exReached(pulseEx) && pulseEx.id !== nextEx)
		warmCands.push({
			title: pulseEx.title,
			target: { type: 'exercise', id: pulseEx.id },
			why: 'Open strings to a steady pulse: wake up the picking hand'
		});
	if (strums.size) {
		const s = [...strums.values()][seed % strums.size];
		warmCands.push({
			title: `Strum warm-up: ${s.pattern.split('').join(' ')}`,
			target: s,
			why: 'A pattern you know, with the click: loosen up the strumming hand'
		});
		warmCands.push({
			title: 'Steady strums with the click',
			target: { type: 'tool', id: 'metronome', params: { bpm: '60' } },
			why: 'One down-strum per click on a chord you know: lock in with the beat'
		});
	}
	const tuner: Pick = {
		title: 'Tune up',
		target: { type: 'tool', id: 'tuner', params: {} },
		why:
			lastDate && tuneFirst
				? 'A few days off: strings drift, so tune first'
				: 'Every session starts in tune'
	};
	// The next lesson tunes the guitar itself: no separate tuning block.
	if (nextWidget?.t === 'tool' && nextWidget.name === 'tuner') used.add(targetKey(tuner.target));
	const rotation = warmCands.filter((p) => free(p.target));
	const warmChoice =
		tuneFirst && free(tuner.target)
			? tuner
			: rotation.length
				? rotation[seed % rotation.length]
				: free(tuner.target)
					? tuner
					: null;
	const warmPick: Pick | null = warmChoice && use(warmChoice);

	// ---- spaced review: due skills, most overdue first, as a representative item ----
	const due = rank(
		state.skills.filter((s) => s.dueAt !== null && s.dueAt <= state.dueBy),
		(s) => -(s.dueAt as number),
		seed
	);
	const reviewItem = (skillId: string): BlockTarget | null => {
		const teaching = index.lessons.filter((l) => l.skills.includes(skillId));
		const options: BlockTarget[] = [];
		for (const l of teaching)
			if (l.mastery?.type === 'changes') {
				const [a, b] = chordIdPair(l.mastery.a, l.mastery.b);
				options.push({ type: 'changes', a, b, target: l.mastery.target });
			}
		for (const l of teaching)
			if (l.mastery?.type === 'exercise' && exById.has(l.mastery.id))
				options.push({ type: 'exercise', id: l.mastery.id });
		for (const ex of index.exercises)
			if (ex.skills.includes(skillId) && exReached(ex))
				options.push({ type: 'exercise', id: ex.id });
		for (const l of teaching)
			if (l.mastery?.type === 'tuner') options.push({ type: 'tool', id: 'tuner', params: {} });
		for (const l of teaching) options.push({ type: 'lesson', id: l.id });
		return options.find(free) ?? null;
	};
	const itemTitle = (t: BlockTarget, fallback: string) =>
		t.type === 'changes'
			? `${t.a} – ${t.b} changes`
			: t.type === 'exercise'
				? (exById.get(t.id)?.title ?? fallback)
				: t.type === 'tool'
					? 'Tune all six strings'
					: t.type === 'lesson'
						? (lessonById.get(t.id)?.title ?? fallback)
						: fallback;
	/** The warm-up item reviews the skills it trains (the finger warm-up, tuning). */
	const warmTrains = (skillId: string) => {
		const t = warmPick?.target;
		if (t?.type === 'exercise') return !!exById.get(t.id)?.skills.includes(skillId);
		if (t?.type === 'tool' && t.id === 'tuner')
			return index.lessons.some((l) => l.mastery?.type === 'tuner' && l.skills.includes(skillId));
		return false;
	};
	const reviewSlot =
		splitMinutes(minutes, { warmup: true, new: true, technique: true, review: true, song: true })
			.review ?? 0;
	const maxReview = reviewSlot >= 4 ? 2 : 1;
	const reviewPicks: (Pick & { skills: string[] })[] = [];
	const addReview = (s: SkillSignal, why: string) => {
		const target = reviewItem(s.id);
		if (!target) return;
		const same = reviewPicks.find((p) => targetKey(p.target) === targetKey(target));
		if (same) return void same.skills.push(s.id);
		if (reviewPicks.length >= maxReview) return;
		const name = skillNames.get(s.id) ?? s.id;
		reviewPicks.push(
			use({ title: `Review: ${itemTitle(target, name)}`, target, skills: [s.id], why })
		);
	};
	for (const s of due) {
		const name = skillNames.get(s.id) ?? s.id;
		const last = lastReviewed(s);
		const lastText = `last practised ${ago(last === null ? 0 : days(state.now - last))}`;
		if (warmPick && warmTrains(s.id)) {
			warmPick.skills = [...(warmPick.skills ?? []), s.id];
			warmPick.why = `Warm-up and review of ${name.toLowerCase()} — ${lastText}`;
			continue;
		}
		addReview(
			s,
			s.status !== 'mastered'
				? `${name} slipped last time — a short refresh`
				: `Due for review — ${lastText}`
		);
	}
	// Every lesson done and nothing due: keep the oldest mastered skills fresh anyway.
	if (!next && !reviewPicks.length) {
		const oldest = rank(
			state.skills.filter((s) => s.status === 'mastered' && s.dueAt !== null),
			(s) => -(lastReviewed(s) ?? 0),
			seed
		);
		for (const s of oldest) {
			if (reviewPicks.length >= maxReview) break;
			// Not what the warm-up already does, and something to play (not a lesson to reread).
			if ((warmPick && warmTrains(s.id)) || reviewItem(s.id)?.type === 'lesson') continue;
			const last = lastReviewed(s);
			addReview(
				s,
				`Keep it fresh — last reviewed ${ago(last === null ? 0 : days(state.now - last))}`
			);
		}
	}

	// ---- technique: a pair below target and/or a ladder still climbing ----
	const techPicks: Pick[] = [];
	const ch = changeCands.find((c) => free({ type: 'changes', a: c.a, b: c.b, target: c.target }));
	if (ch) techPicks.push(changesPick(ch));
	const exFree = (e: Exercise) =>
		free({ type: 'exercise', id: e.id }) && e !== warmEx && e.id !== nextEx;
	const ex = exerciseCands.find(exFree);
	if (ex) techPicks.push(exPick(ex));
	// When only one fits, the more urgent goes first: how far the pair is below its goal vs how
	// weak the ladder is.
	if (ch && ex && exScore(ex) - 1 > 1 - ch.best / ch.target) techPicks.reverse();
	if (!ex) {
		// Nothing climbing: keep a mastered ladder at its target (stalest first), or, before any
		// ladder is reached, a first easy one from this level.
		const kept = rank(
			index.exercises.filter((e) => exReached(e) && exFree(e)),
			(e) => -(state.exercises[e.id]?.lastAt ?? 0),
			seed
		);
		for (const e of kept.slice(0, ch ? 1 : 2))
			techPicks.push(exPick(e, `Keep it at ${e.targetBpm} BPM — a quick, clean refresh`));
		if (!kept.length && !ch) {
			const firstTaste = index.lessons
				.filter((l) => l.level <= level)
				.flatMap((l) => lessonsExercises(l).map((id) => ({ l, e: exById.get(id) })))
				.find(({ e }) => e && exFree(e));
			if (firstTaste?.e)
				techPicks.push(
					exPick(firstTaste.e, `A first taste of “${firstTaste.l.title}”: slow and steady`)
				);
		}
	}

	// ---- song: at or slightly below level, not the one from last session ----
	let songs = state.songs.filter((s) => s.level <= level && s.level >= level - 1);
	if (!songs.length) {
		const lowest = Math.min(...state.songs.map((s) => s.level));
		songs = state.songs.filter((s) => s.level === lowest);
	}
	if (songs.length > 1 && lastSong?.type === 'song')
		songs = songs.filter((s) => s.id !== lastSong.id);
	const song = rank(
		songs,
		(s) => {
			const since =
				s.lastPlayedAt === null ? 0.4 : Math.min(0.5, (state.now - s.lastPlayedAt) / (30 * DAY_MS));
			return (s.level === level ? 0.6 : 0.3) + since;
		},
		seed
	)[0];
	let songPick: Pick | null = null;
	if (song) {
		const atLevel = song.level === level;
		const tempoPct = song.maxTempoPct
			? Math.min(100, Math.max(50, Math.round((song.maxTempoPct + 5) / 5) * 5))
			: atLevel
				? 70
				: 85;
		const first = song.pickup ? 1 : 0;
		const loop =
			song.loop ??
			(song.lastPlayedAt === null && atLevel && song.bars > 8
				? { start: first, end: Math.min(song.bars - 1, first + 3) }
				: null);
		songPick = use({
			title: song.title,
			target: { type: 'song', id: song.id, tempoPct, loop },
			why:
				song.lastPlayedAt === null
					? `${atLevel ? `A Level ${song.level} song` : 'An easy song'}, new to you — ${loop ? 'loop the first phrase' : 'play it through'} at ${tempoPct}%`
					: song.maxTempoPct
						? `Last played at ${song.maxTempoPct}% — try ${tempoPct}%${loop ? ' on your loop' : ''}`
						: `Play it through at ${tempoPct}% — music, not drills`
		});
	}

	// ---- minutes ----
	const reading = !!next && newPick?.target.type === 'lesson' && !nextWidget;
	const slot = splitMinutes(
		minutes,
		{
			warmup: !!warmPick,
			new: !!newPick,
			technique: techPicks.length > 0,
			review: reviewPicks.length > 0,
			song: !!songPick
		},
		{ reading }
	);
	const blocks: PlanBlock[] = [];
	const add = (kind: BlockKind, p: Pick, m: number) => blocks.push({ kind, minutes: m, ...p });
	/** One item, or two splitting the minutes from `from` minutes on (the first gets `firstMin`). */
	const addSplit = (kind: BlockKind, picks: Pick[], m: number, firstMin: number, from: number) => {
		if (picks.length >= 2 && m >= from) {
			add(kind, use(picks[0]), firstMin);
			add(kind, use(picks[1]), m - firstMin);
		} else add(kind, use(picks[0]), m);
	};
	for (const k of ORDER) {
		const m = slot[k];
		if (!m) continue;
		if (k === 'warmup') add(k, warmPick!, m);
		else if (k === 'new') add(k, newPick!, m);
		else if (k === 'song') add(k, songPick!, m);
		else if (k === 'technique') {
			// 1-minute changes first (a round and a retry), the ladder after.
			const sorted =
				m >= 4 ? [...techPicks].sort((a) => (a.target.type === 'changes' ? -1 : 1)) : techPicks;
			const changes = sorted[0].target.type === 'changes';
			addSplit(k, sorted, m, changes ? CHANGES_MIN : Math.floor(m / 2), changes ? 4 : 6);
		} else addSplit(k, reviewPicks, m, m - Math.floor(m / 2), 4);
	}
	return { date: state.date, minutes, blocks, due: due.length };
}

/** Exercises a lesson checks or embeds, in lesson order. */
function lessonsExercises(l: Lesson): string[] {
	const ids = flatBlocks(l.blocks).flatMap((b) => (b.t === 'exercise' ? [b.id] : []));
	if (l.mastery?.type === 'exercise' && !ids.includes(l.mastery.id)) ids.push(l.mastery.id);
	return ids;
}
