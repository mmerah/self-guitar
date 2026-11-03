// Shapes shared by the session planner, the API and the Today / session pages.

export const BLOCK_KINDS = ['warmup', 'technique', 'new', 'review', 'song'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const RATINGS = ['hard', 'ok', 'great'] as const;
export type Rating = (typeof RATINGS)[number];
export const RATING_EMOJI: Record<Rating, string> = { hard: '😖', ok: '🙂', great: '😎' };
export const RATING_LABEL: Record<Rating, string> = { hard: 'Hard', ok: 'OK', great: 'Easy' };

export const SESSION_LENGTHS = [5, 10, 15, 20, 30] as const;
export const MIN_SESSION = 5;
export const MAX_SESSION = 30;
export const DEFAULT_SESSION = 15;

export type Loop = { start: number; end: number };
/** How a song is played: picked melody, strummed chords, or fingerpicked. */
export type SongPlay = 'melody' | 'chords' | 'fingerstyle';

export type BlockTarget =
	| { type: 'lesson'; id: string }
	| { type: 'exercise'; id: string }
	| { type: 'changes'; a: string; b: string; target: number }
	| { type: 'song'; id: string; tempoPct: number; loop: Loop | null; play?: SongPlay }
	| { type: 'tool'; id: 'tuner' | 'metronome'; params: Record<string, string> }
	/** A strum pattern with its click (a warm-up on a pattern the learner knows). */
	| { type: 'strum'; pattern: string; bpm: number; chord: string | null };

export type PlanBlock = {
	kind: BlockKind;
	title: string;
	minutes: number;
	target: BlockTarget;
	/** Short human reason, e.g. "Due for review — last practised 7 days ago". */
	why: string;
	/** Skills this block reviews (review blocks): a rating moves their schedule. */
	skills?: string[];
};

export type Plan = {
	date: string;
	minutes: number;
	blocks: PlanBlock[];
	/** Number of skills due today (all of them, not only the ones planned). */
	due: number;
};

/** What happened in a block (sent when it is done or skipped). */
export type BlockResult = {
	actualSec: number;
	rating: Rating | null;
	/** "Clean at ___ BPM" (exercises), or "played cleanly at ___ % speed" (songs). */
	bpm: number | null;
	completed: boolean;
	skipped: boolean;
};

export type SessionSummary = {
	minutes: number;
	blocksDone: number;
	blocksTotal: number;
	pbs: { label: string; value: string }[];
	/** Skills whose next review moved in this session. */
	reviewed: { skillId: string; name: string; dueAt: number; lapsed: boolean }[];
	/** What tomorrow brings: skills due by its end, and the next lesson. */
	tomorrow?: { due: number; next: string | null };
};

/** A session as the server stores it (for resuming on another device or after a reload). */
export type StoredSession = {
	id: string;
	date: string;
	plannedMin: number;
	startedAt: number;
	endedAt: number | null;
	blocks: PlanBlock[];
	results: (BlockResult | null)[];
};

export type Settings = { weeklyDays: number; dailyMin: number; sessionMin: number };
export const DEFAULT_SETTINGS: Settings = { weeklyDays: 5, dailyMin: 15, sessionMin: 15 };

/** Local calendar day as YYYY-MM-DD. */
export function localDate(d = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
