// Saving a 1-minute-changes result (tool page and session blocks).
import type { ChangePair } from '$lib/chordChanges';
import { sendJson } from '$lib/api';
import { clientTz } from '$lib/session/time';
import { notePractised, withLesson } from '$lib/learn/practising';

export async function saveChanges(
	chordA: string,
	chordB: string,
	count: number
): Promise<ChangePair> {
	let res: Response;
	try {
		res = await sendJson(
			'/api/chord-changes',
			'POST',
			withLesson({ chordA, chordB, count, tz: clientTz() })
		);
	} catch {
		throw new Error(
			navigator.onLine === false
				? 'You are offline: the result could not be saved.'
				: 'Could not save. Try again.'
		);
	}
	if (!res.ok) throw new Error('Could not save. Try again.');
	notePractised();
	return (await res.json()) as ChangePair;
}
