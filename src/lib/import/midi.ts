// The few facts the importer reads straight from a MIDI file (parsed as bytes, never executed).

/** Quarter-note BPM of the first Set Tempo event (FF 51 03), or null when the file has none. */
export function midiTempo(bytes: Uint8Array): number | null {
	for (let i = 0; i + 5 < bytes.length; i++) {
		if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) {
			const us = (bytes[i + 3] << 16) | (bytes[i + 4] << 8) | bytes[i + 5];
			return us > 0 ? Math.round(60_000_000 / us) : null;
		}
	}
	return null;
}

/** A MIDI file starts with the "MThd" chunk. */
export const isMidi = (bytes: Uint8Array) =>
	bytes.length > 14 && String.fromCharCode(...bytes.slice(0, 4)) === 'MThd';
