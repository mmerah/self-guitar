import type { Warmup } from '../content/schema.ts';
import type { EarKind, EarDir } from '../ear/items.ts';
import type { FretboardSpec } from '../theory/fretboard.ts';
// Curriculum shapes shared by the content build, the server and the UI.

export type Skill = { id: string; name: string; description: string };
export type Unit = { id: string; title: string; skills: Skill[] };
export type Level = { id: number; title: string; goal: string; units: Unit[] };

/** Front-matter `mastery`: how a lesson's mastery check is satisfied (evaluated on the server). */
export type Mastery =
	| { type: 'changes'; a: string; b: string; target: number }
	| { type: 'exercise'; id: string; bpm: number }
	| { type: 'self'; items: string[] }
	| { type: 'tuner' }
	/** The last `min` ear answers on items of `set` reach `accuracy` % (every item heard). */
	| { type: 'ear'; kind: EarKind; set: string[]; accuracy: number; min: number }
	/** A passing round of a fretboard quiz in at most `target` seconds. */
	| { type: 'fretboard'; quiz: string; target: number };

// ---- compiled lesson body (rendered by Svelte components: never raw HTML) ----------------------

export type Inline =
	| { t: 'text'; v: string }
	| { t: 'strong'; c: Inline[] }
	| { t: 'em'; c: Inline[] }
	| { t: 'code'; v: string }
	| { t: 'link'; href: string; c: Inline[] };

/** One strum-pattern slot (an 8th or 16th note): down, up or rest. */
export type StrumSlot = 'D' | 'U' | '-';

export type ToolName = 'tuner' | 'metronome' | 'changes' | 'ear' | 'fretboard';

export type Block =
	| { t: 'h'; level: 2 | 3; c: Inline[] }
	| { t: 'p'; c: Inline[] }
	| { t: 'list'; ordered: boolean; items: Inline[][] }
	| { t: 'chord'; id: string; voicing?: string }
	/** `voicings[i]`: the voicing id shown for `ids[i]` (null: its first); only when one is picked. */
	| { t: 'chords'; ids: string[]; voicings?: (string | null)[] }
	| { t: 'exercise'; id: string }
	| { t: 'atex'; tex: string }
	/** `chord` may pin a voicing ("F@1-3-3-2-1-1"); `sub: 16` = 16th-note slots; `ts`: 6/8. */
	| { t: 'strum'; pattern: StrumSlot[]; bpm: number; chord?: string; sub?: 16; ts?: '6/8' }
	| { t: 'tool'; name: ToolName; params: Record<string, string>; label?: string }
	| { t: 'callout'; kind: 'tip' | 'warning'; blocks: Block[] }
	/** A fretboard overlay (scale, arpeggio, CAGED, triads, notes), with an optional caption. */
	| { t: 'fretboard'; spec: FretboardSpec; label?: string }
	/** The fretboard "find the note" quiz, embedded. */
	| { t: 'fretquiz'; quiz: string; target?: number }
	/** A mini ear quiz: `n` questions on `set`. */
	| { t: 'ear'; kind: EarKind; set: string[]; dir: EarDir; n: number; key?: string }
	/** A link card to a library song, with a suggested tempo (% of the score's). */
	| { t: 'song'; id: string; tempo?: number; label?: string };

export type LessonMeta = {
	id: string;
	title: string;
	level: number;
	unit: string;
	skills: string[];
	prereqs: string[];
	minutes: number;
	/** Position inside its unit (lower first; ties by id). */
	order: number;
	mastery?: Mastery;
	/**
	 * Compiled from the body (so lists and the planner need no body): the widget a session's
	 * new-skill block practises with (session/practice), and the exercises it embeds or checks.
	 */
	widget?: Block | null;
	exercises?: string[];
	/** Chords the body shows (::chord, ::chords, ::strum chord=), as written. */
	chords?: string[];
	/** The opening sentence as plain text, and how many "How to practise" steps there are. */
	goal?: string;
	steps?: number;
};

/** A lesson with its body (the per-lesson payload; the index carries LessonMeta only). */
export type Lesson = LessonMeta & { blocks: Block[] };

export type ExerciseMeta = {
	id: string;
	title: string;
	skills: string[];
	startBpm: number;
	targetBpm: number;
	step: number;
	cleanReps: number;
	/** "What to play": 1–3 short steps, shown above the tab. */
	howTo: string[];
	/** Chords used, in order (chord ids or names; shown as small diagrams). */
	chords?: string[];
	/** Strum pattern in ::strum syntax ("D U D U …"), for strummed exercises. */
	strum?: string;
	/** Note checking with the mic: forced on/off (default: on for single-note exercises). */
	listen?: boolean;
};

/** An exercise with its score (the per-exercise payload; the index carries ExerciseMeta only). */
export type Exercise = ExerciseMeta & { tex: string };

/**
 * The curriculum as lists, the planner and the server's rules need it (GET /api/learn, small and
 * precached): lessons and exercises without their bodies. A lesson's body and the scores of its
 * exercises load with the lesson (GET /api/learn/lessons/:id), an exercise's score on its own
 * (GET /api/learn/exercises/:id). The full content (LearnContent) satisfies it too.
 */
export type LearnIndex = {
	levels: Level[];
	lessons: LessonMeta[];
	exercises: ExerciseMeta[];
	/** Warm-up routines (content/warmups): the Library's Warm-ups tab and the session's warm-up block. */
	warmups: Warmup[];
};

/** The compiled curriculum with every body (generated/content.json; the build and the server). */
export type LearnContent = {
	levels: Level[];
	lessons: Lesson[];
	exercises: Exercise[];
	warmups: Warmup[];
};

/** One lesson's payload: its body and the exercises it shows (with their scores). */
export type LessonPayload = { lesson: Lesson; exercises: Exercise[] };

// ---- progress ----------------------------------------------------------------------------------

export type LessonStatus = 'started' | 'completed';
/** Shown in the skill tree: not started, in progress, completed, mastered. */
export type LessonState = 'new' | 'started' | 'completed' | 'mastered';
export type SkillStatus = 'new' | 'learning' | 'mastered';

export type ExerciseStats = {
	/** Best clean BPM, null before the first clean pass. */
	best: number | null;
	/** Highest BPM at which `cleanReps` clean passes in a row were completed, null before. */
	streakBest: number | null;
	/** Where the tempo ladder stands (resumed by the next session), within startBpm..targetBpm. */
	resumeBpm: number;
	attempts: number;
	/** `cleanReps` clean passes in a row at the target tempo, at least once. */
	mastered: boolean;
};

/** One exercise's stats plus the ladder's exact position (streak and misses), for its page. */
/** A rated pass the mic checked: notes heard right of the notes counted. */
export type HeardPass = { hits: number; total: number; clean: boolean; bpm: number };

export type ExerciseDetail = ExerciseStats & {
	streak: number;
	misses: number;
	/** The latest mic-checked passes, oldest first (up to 5). */
	heard?: HeardPass[];
};

export type MasteryProgress = {
	done: boolean;
	/** Changes/min, best clean BPM, ear accuracy % or quiz seconds so far. */
	value?: number;
	target?: number;
	/** Ear checks: answers counted so far (of `min`). */
	count?: number;
};

export type LessonProgress = {
	state: LessonState;
	mastery: MasteryProgress | null;
	/** When the lesson was last opened or completed (ms), for the next-lesson pick. */
	touched?: number;
};

export type LearnProgress = {
	lessons: Record<string, LessonProgress>;
	skills: Record<string, SkillStatus>;
	exercises: Record<string, ExerciseStats>;
	/** Levels whose every skill is mastered. */
	masteredLevels: number[];
	next: { id: string; title: string; level: number } | null;
};
