// `?from=<lesson id>` on tool pages: links opened from a lesson return to it (kept tiny: the
// layout imports it for the active nav tab).

/** The lesson a page was opened from: a slug, else null (never an arbitrary URL). */
export function fromLesson(url: URL): string | null {
	const from = url.searchParams.get('from');
	return from && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(from) ? from : null;
}
