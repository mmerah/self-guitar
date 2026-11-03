// The Library's lists: song filtering and sorting, warm-ups by goal, exercises by level. Pure, so
// the page stays a thin view (and stays fast with a couple of hundred songs).
import type { SongSummary } from '$lib/content/schema';
import { getChord } from '$lib/chords';
import { walkBlocks } from '$lib/learn/markdown';
import type { Exercise, LearnIndex, LearnProgress } from '$lib/learn/types';
import { resolveChord } from '$lib/sheet/chords';
import type { Progress } from '$lib/progress';
import { GOAL_LABEL } from '$lib/warmups/steps';
import type { Warmup, WarmupGoal } from '$lib/content/schema';

export const TABS = ['songs', 'warmups', 'exercises'] as const;
export type Tab = (typeof TABS)[number];
export const SORTS = { level: 'Level', title: 'Title', recent: 'Recent' } as const;
export type Sort = keyof typeof SORTS;

export type SongFilter = {
	query: string;
	/** A level, every level, or "near": the reader's level ±1 (the default). */
	level: number | 'all' | 'near';
	style: string;
	kind: 'all' | 'sheet' | 'tab';
	play: string;
	sort: Sort;
	/** Only chord sheets whose every chord is in this set (chord ids); null: no such filter. */
	known: Set<string> | null;
	/** The reader's level, for level "near". */
	myLevel: number;
};
export const NO_FILTER: SongFilter = {
	query: '',
	level: 'all',
	style: 'all',
	kind: 'all',
	play: 'all',
	sort: 'level',
	known: null,
	myLevel: 0
};

/** The library chord a sheet's chord is played as ("D/F#" → "D"), or null. */
export function baseChord(name: string): string | null {
	return resolveChord(name)?.chord.id ?? getChord(name)?.id ?? null;
}

/** "g c d" → ["G", "C", "D"] when every word is a chord name, else null (a text search). */
export function chordTerms(query: string): string[] | null {
	const words = query
		.trim()
		.split(/[\s,]+/)
		.filter(Boolean);
	if (!words.length) return null;
	const out: string[] = [];
	for (const w of words) {
		const id = baseChord(w[0].toUpperCase() + w.slice(1));
		if (!id) return null;
		out.push(id);
	}
	return out;
}

/** A song's chords as library chord ids (a sheet's; none for a tab). */
export const songChordIds = (s: SongSummary) =>
	new Set((s.chords ?? []).flatMap((c) => baseChord(c) ?? []));

/** A chord sheet whose every chord is known (tabs are fingerstyle reading, not chords). */
export function canPlay(s: SongSummary, known: Set<string>): boolean {
	if (s.kind !== 'sheet' || !s.chords?.length) return false;
	return [...songChordIds(s)].every((c) => known.has(c));
}

/** The levels "near" covers: the reader's level ±1. */
export const nearLevels = (myLevel: number) => [Math.max(0, myLevel - 1), myLevel + 1] as const;

/**
 * The reader's level: the next lesson's, else the highest level with a completed lesson, else 0.
 */
export function myLevel(index: LearnIndex, progress: LearnProgress): number {
	if (progress.next) return progress.next.level;
	const done = index.lessons.filter((l) => {
		const st = progress.lessons[l.id]?.state;
		return st === 'completed' || st === 'mastered';
	});
	return Math.max(0, ...done.map((l) => l.level));
}

/** Chords taught by the completed lessons (diagrams, strums, changes checks, their exercises). */
export function taughtChords(index: LearnIndex, progress: LearnProgress): string[] {
	const out = new Set<string>();
	const add = (name: string | undefined) => {
		const id = name && baseChord(name.trim().split(/\s+/)[0]);
		if (id) out.add(id);
	};
	const exercises = new Map(index.exercises.map((e) => [e.id, e]));
	for (const l of index.lessons) {
		const st = progress.lessons[l.id]?.state;
		if (st !== 'completed' && st !== 'mastered') continue;
		for (const b of walkBlocks(l.blocks)) {
			if (b.t === 'chord') add(b.id);
			else if (b.t === 'chords') b.ids.forEach(add);
			else if (b.t === 'strum') add(b.chord);
			else if (b.t === 'exercise') exercises.get(b.id)?.chords?.forEach(add);
		}
		if (l.mastery?.type === 'changes') [l.mastery.a, l.mastery.b].forEach(add);
	}
	return [...out];
}

/** Songs matching the filter, in the chosen order (recent: last played first, then by level). */
export function filterSongs(
	songs: SongSummary[],
	f: SongFilter,
	progress: Map<string, Progress>
): SongSummary[] {
	const q = f.query.trim().toLowerCase();
	const terms = chordTerms(f.query);
	const [lo, hi] = nearLevels(f.myLevel);
	const out = songs.filter(
		(s) =>
			(f.level === 'all' ||
				(f.level === 'near' ? s.level >= lo && s.level <= hi : s.level === f.level)) &&
			(f.style === 'all' || s.style === f.style) &&
			(f.kind === 'all' || (f.kind === 'sheet' ? s.kind === 'sheet' : s.hasTab)) &&
			(f.play === 'all' || s.play === f.play) &&
			(!f.known || canPlay(s, f.known)) &&
			(!q ||
				s.title.toLowerCase().includes(q) ||
				s.composer.toLowerCase().includes(q) ||
				(!!terms && terms.every((t) => songChordIds(s).has(t))))
	);
	const played = (s: SongSummary) => progress.get(s.id)?.lastPlayedAt ?? '';
	const byLevel = (a: SongSummary, b: SongSummary) =>
		a.level - b.level || a.title.localeCompare(b.title);
	return out.sort(
		f.sort === 'title'
			? (a, b) => a.title.localeCompare(b.title)
			: f.sort === 'recent'
				? (a, b) => played(b).localeCompare(played(a)) || byLevel(a, b)
				: byLevel
	);
}

/** Songs in runs of one level (for the "Level N" headers of the level sort). */
export function byLevelGroups(songs: SongSummary[]): { level: number; songs: SongSummary[] }[] {
	const out: { level: number; songs: SongSummary[] }[] = [];
	for (const s of songs) {
		const last = out[out.length - 1];
		if (last?.level === s.level) last.songs.push(s);
		else out.push({ level: s.level, songs: [s] });
	}
	return out;
}

/** Warm-ups by goal (in GOAL_LABEL order); routines above `maxLevel` are counted as "later". */
export function warmupGroups(warmups: Warmup[], maxLevel: number) {
	const now = warmups.filter((w) => w.level <= maxLevel);
	const groups = (Object.keys(GOAL_LABEL) as WarmupGoal[])
		.map((goal) => ({
			goal,
			label: GOAL_LABEL[goal],
			items: now.filter((w) => w.goal === goal).sort((a, b) => a.level - b.level)
		}))
		.filter((g) => g.items.length);
	return { groups, later: warmups.filter((w) => w.level > maxLevel) };
}

/** The level an exercise is first met at: its earliest lesson (embedded or as the check). */
export function exerciseLevels(index: LearnIndex): Map<string, number> {
	const out = new Map<string, number>();
	for (const l of index.lessons) {
		const ids = [...walkBlocks(l.blocks)].flatMap((b) => (b.t === 'exercise' ? [b.id] : []));
		if (l.mastery?.type === 'exercise') ids.push(l.mastery.id);
		for (const id of ids) out.set(id, Math.min(out.get(id) ?? Infinity, l.level));
	}
	return out;
}

export function exerciseGroups(index: LearnIndex) {
	const lv = exerciseLevels(index);
	const by = new Map<number, Exercise[]>();
	for (const e of index.exercises) {
		const l = lv.get(e.id) ?? 99;
		by.set(l, [...(by.get(l) ?? []), e]);
	}
	return [...by.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([level, items]) => ({
			level,
			items: items.sort((a, b) => a.title.localeCompare(b.title))
		}));
}
