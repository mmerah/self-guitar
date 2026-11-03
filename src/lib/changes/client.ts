// Saving a 1-minute-changes result (tool page and session blocks).
import type { ChangePair } from '$lib/chordChanges';
import { clientTz } from '$lib/session/time';

export async function saveChanges(
	chordA: string,
	chordB: string,
	count: number
): Promise<ChangePair> {
	let res: Response;
	try {
		res = await fetch('/api/chord-changes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ chordA, chordB, count, tz: clientTz() })
		});
	} catch {
		throw new Error(
			navigator.onLine === false
				? 'You are offline: the result could not be saved.'
				: 'Could not save. Try again.'
		);
	}
	if (!res.ok) throw new Error('Could not save. Try again.');
	return (await res.json()) as ChangePair;
}
