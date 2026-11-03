// `?from=<lesson id>` on tool pages: links opened from a lesson return to it; `?from=session`
// returns to the running practice session (kept tiny: the layout imports it for the nav tab).

/** The lesson a page was opened from: a slug, else null (never an arbitrary URL). */
export function fromLesson(url: URL): string | null {
	const from = url.searchParams.get('from');
	return from && from !== 'session' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(from) ? from : null;
}

/** Opened from the session runner (?from=session). */
export const fromSession = (url: URL) => url.searchParams.get('from') === 'session';
