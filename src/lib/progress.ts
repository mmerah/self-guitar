// Shared by the client and the server: tempo bounds and the progress shape returned by the API.
export const TEMPO_MIN = 25;
export const TEMPO_MAX = 150;
export const TEMPO_PRESETS = [50, 60, 75, 90, 100] as const;

export function clampTempo(v: number) {
	return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(v)));
}

export type Progress = {
	songId: string;
	tempoPct: number;
	/** Highest tempo at which playback was actually started. */
	maxPlayedTempoPct: number | null;
	lastPlayedAt: string | null;
	loopStartBar: number | null;
	loopEndBar: number | null;
	/** In the list (GET /api/progress): the song's title and pickup flag. */
	title?: string;
	pickup?: boolean;
};

/** Bar number as printed in the score: a pickup (anacrusis) bar is unnumbered, the next is 1. */
export function barNumber(index: number, pickup: boolean) {
	return pickup ? (index === 0 ? 'pickup' : String(index)) : String(index + 1);
}
