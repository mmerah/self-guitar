// The lesson being practised on this screen: the lesson page itself, or a tool / exercise page
// opened from it (?from=<lesson>). Practice results sent from here carry it, so practising a
// lesson starts it while merely opening (previewing) it does not (M7.1). Set by the root layout.

let current: string | null = null;

export const PRACTISED_EVENT = 'sg:practised';

export function setPractising(id: string | null) {
	current = id;
}

export const practising = () => current;

/** A practice write's body with the lesson it belongs to, if any. */
export function withLesson<T extends object>(body: T): T & { lesson?: string } {
	return current ? { ...body, lesson: current } : body;
}

/** After a practice result was saved: the lesson page refreshes its state (now started). */
export function notePractised() {
	if (current && typeof dispatchEvent === 'function')
		dispatchEvent(new CustomEvent(PRACTISED_EVENT, { detail: current }));
}
