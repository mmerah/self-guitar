// Per-device Mic check preferences, kept in the browser: the Mic toggle is a convenience of this
// device (its mic). Pass accuracy is stored with each attempt on the server (hits / total).

const ON = 'listen.on';
const CHORDS = 'listen.chords';
const EXPLAINED = 'listen.explained';

function get(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}
function set(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// private mode: lasts this visit
	}
}

/** The Mic toggle (exercise pages and session blocks share it). */
export const listenOn = () => get(ON) === '1';
export const setListenOn = (on: boolean) => set(ON, on ? '1' : '0');
/** The experimental chord check (strummed exercises). */
export const chordCheckOn = () => get(CHORDS) === '1';
export const setChordCheckOn = (on: boolean) => set(CHORDS, on ? '1' : '0');
/** The mic explainer was accepted once on this device. */
export const explained = () => get(EXPLAINED) === '1';
export const setExplained = () => set(EXPLAINED, '1');
