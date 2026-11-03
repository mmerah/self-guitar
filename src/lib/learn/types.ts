// Curriculum shapes shared by the content build, the server and the UI.

export type Skill = { id: string; name: string; description: string };
export type Unit = { id: string; title: string; skills: Skill[] };
export type Level = { id: number; title: string; goal: string; units: Unit[] };

/** Front-matter `mastery`: how a lesson's mastery check is satisfied (evaluated on the server). */
export type Mastery =
	| { type: 'changes'; a: string; b: string; target: number }
	| { type: 'exercise'; id: string; bpm: number }
	| { type: 'self'; items: string[] }
	| { type: 'tuner' };

// ---- compiled lesson body (rendered by Svelte components: never raw HTML) ----------------------

export type Inline =
	| { t: 'text'; v: string }
	| { t: 'strong'; c: Inline[] }
	| { t: 'em'; c: Inline[] }
	| { t: 'code'; v: string }
	| { t: 'link'; href: string; c: Inline[] };

/** One strum-pattern slot (an 8th note): down, up or rest. */
export type StrumSlot = 'D' | 'U' | '-';

export type ToolName = 'tuner' | 'metronome' | 'changes';

export type Block =
	| { t: 'h'; level: 2 | 3; c: Inline[] }
	| { t: 'p'; c: Inline[] }
	| { t: 'list'; ordered: boolean; items: Inline[][] }
	| { t: 'chord'; id: string; voicing?: string }
	| { t: 'chords'; ids: string[] }
	| { t: 'exercise'; id: string }
	| { t: 'atex'; tex: string }
	| { t: 'strum'; pattern: StrumSlot[]; bpm: number; chord?: string }
	| { t: 'tool'; name: ToolName; params: Record<string, string>; label?: string }
	| { t: 'callout'; kind: 'tip' | 'warning'; blocks: Block[] };

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
};

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
};

export type Exercise = ExerciseMeta & { tex: string };

/** The compiled curriculum (part of generated/content.json, served by GET /api/learn). */
export type LearnIndex = { levels: Level[]; lessons: Lesson[]; exercises: Exercise[] };

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
export type ExerciseDetail = ExerciseStats & { streak: number; misses: number };

export type MasteryProgress = {
	done: boolean;
	/** Changes/min or best clean BPM so far (changes and exercise checks). */
	value?: number;
	target?: number;
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
