// The container MediaRecorder writes: Opus in WebM where it exists (Chrome, Firefox, Android),
// AAC in MP4 on Safari (iOS/macOS), then whatever the browser offers.

export const MIME_PREFERENCE = [
	'audio/webm;codecs=opus',
	'audio/mp4;codecs=mp4a.40.2',
	'audio/mp4',
	'audio/ogg;codecs=opus',
	'audio/webm',
	'audio/aac'
];

/** The best supported type, or '' (the browser's default) when none is known to work. */
export function pickMime(isTypeSupported: (type: string) => boolean): string {
	for (const t of MIME_PREFERENCE) {
		try {
			if (isTypeSupported(t)) return t;
		} catch {
			// an odd browser throwing on the query: try the next one
		}
	}
	return '';
}

/** File extension for a download. */
export function extFor(mime: string): string {
	const base = mime.split(';')[0].trim().toLowerCase();
	if (base === 'audio/webm' || base === 'video/webm') return 'webm';
	if (base === 'audio/mp4' || base === 'video/mp4' || base === 'audio/x-m4a') return 'm4a';
	if (base === 'audio/ogg') return 'ogg';
	if (base === 'audio/aac') return 'aac';
	if (base === 'audio/wav' || base === 'audio/wave') return 'wav';
	return 'audio';
}

/** Whether this browser can record at all. */
export function canRecord(): boolean {
	return typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';
}

export function browserMime(): string {
	return canRecord() && MediaRecorder.isTypeSupported
		? pickMime((t) => MediaRecorder.isTypeSupported(t))
		: '';
}
