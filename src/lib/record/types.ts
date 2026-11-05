// Recordings ("record yourself"): takes stay in this browser (IndexedDB), in both builds. They are
// never uploaded: they are private and can be large.

export type ItemType = 'song' | 'exercise' | 'warmup' | 'free';

/** What a take is a recording of (the page playing it says so). */
export type RecordItem = {
	itemType: ItemType;
	itemId: string;
	title: string;
};

/** How the take was made: over the playing backing (headphones) or alone after a click count-in. */
export type TakeMode = 'along' | 'solo';

/** Self-rating: 1 😖 rough, 2 🙂 fine, 3 😎 nailed it. */
export type TakeRating = 1 | 2 | 3;
export const RATINGS: { value: TakeRating; emoji: string; label: string }[] = [
	{ value: 1, emoji: '😖', label: 'Rough' },
	{ value: 2, emoji: '🙂', label: 'Fine' },
	{ value: 3, emoji: '😎', label: 'Nailed it' }
];

export type Take = RecordItem & {
	id: string;
	/** Tempo as % of the score's (null: no player, e.g. a warm-up). */
	tempoPct: number | null;
	bpm: number | null;
	/** ms since the epoch. */
	createdAt: number;
	/** Seconds (updated while recording, final once stopped). */
	duration: number;
	/** Bytes of audio stored. */
	size: number;
	mime: string;
	/** Audio chunks written (they are saved every few seconds while recording). */
	chunks: number;
	/** 'recording' while the recorder runs; a take left so (tab closed) is finalised on next load. */
	status: 'recording' | 'done';
	mode: TakeMode;
	/** Along: ms from the recording's start to the backing's first tick (count-in included). */
	offsetMs: number;
	/** Along: the backing played with its count-in (a compare plays it the same way). */
	countIn: boolean;
	/** The reader's own name for it (defaults to the date). */
	name?: string;
	rating?: TakeRating;
	note?: string;
	/**
	 * The waveform: the loudest sample per 1/PEAK_RATE s, 0..255, taken from the level meter while
	 * recording (a take is never decoded just to draw it). Missing on takes from before M7's fix or
	 * left by a closed tab: computed once from a low-rate decode, then stored.
	 */
	peaks?: number[];
};

/** Waveform columns per second of take. */
export const PEAK_RATE = 20;

export type TakeInput = Omit<Take, 'id' | 'createdAt' | 'duration' | 'size' | 'chunks' | 'status'> &
	Partial<Pick<Take, 'id' | 'createdAt'>>;
