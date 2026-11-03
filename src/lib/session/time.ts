// Local days and time zones, shared by the browser and the server. A learner's zone travels as an
// IANA name ("Europe/Berlin": DST-safe, offsets are computed per date with Intl) or, from older
// clients, as a fixed offset in minutes (Date.getTimezoneOffset: local + offset = UTC).

export type Tz = string | number;

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** A real calendar day as YYYY-MM-DD (2026-02-31 is not). */
export function isRealDate(s: string): boolean {
	if (!DATE_RE.test(s)) return false;
	const [y, m, d] = s.split('-').map(Number);
	const t = new Date(Date.UTC(y, m - 1, d));
	return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Is this an IANA time zone this runtime knows? */
export function isZone(z: string): boolean {
	if (z.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(z)) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: z });
		return true;
	} catch {
		return false;
	}
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(zone: string) {
	let f = fmtCache.get(zone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		fmtCache.set(zone, f);
	}
	return f;
}

/** Wall-clock parts of an instant in a zone. */
function parts(at: number, zone: string) {
	const p = Object.fromEntries(
		fmt(zone)
			.formatToParts(new Date(at))
			.map((x) => [x.type, x.value])
	);
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Minutes to add to local time to get UTC at an instant (like getTimezoneOffset). */
export function offsetAt(tz: Tz, at: number): number {
	if (typeof tz === 'number') return tz;
	const p = parts(at, tz);
	const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
	return Math.round((Math.floor(at / 1000) * 1000 - asUtc) / 60_000);
}

/** The instant a local wall-clock time (on day `date`, `addDays` later, at 00:00) happens. */
function localMidnight(date: string, tz: Tz, addDays = 0): number {
	const [y, m, d] = date.split('-').map(Number);
	const wall = Date.UTC(y, m - 1, d + addDays);
	// Two passes: the offset at the guess, then at the corrected instant (DST changes).
	const first = wall + offsetAt(tz, wall) * 60_000;
	return wall + offsetAt(tz, first) * 60_000;
}

/** Start of a local day (UTC ms). */
export const startOfDay = (date: string, tz: Tz) => localMidnight(date, tz);

/**
 * End of the learner's local day (UTC ms): skills due before it are due "today". The one helper
 * every review path uses. Without a zone it is `now` (only what is already due).
 */
export function dueBy(date: string | undefined, tz: Tz | undefined, now = Date.now()): number {
	if (tz === undefined) return now;
	return localMidnight(date ?? localDay(now, tz), tz, 1);
}

/** The local day (YYYY-MM-DD) of an instant. */
export function localDay(at: number, tz: Tz): string {
	if (typeof tz === 'number') return new Date(at - tz * 60_000).toISOString().slice(0, 10);
	const p = parts(at, tz);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** The browser's zone: its IANA name, else today's offset. */
export function clientTz(): Tz {
	try {
		const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (z && isZone(z)) return z;
	} catch {
		// fall through
	}
	return new Date().getTimezoneOffset();
}

const toUtc = (date: string) => {
	const [y, m, d] = date.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
};

export const addDays = (date: string, n: number) =>
	new Date(toUtc(date) + n * 86_400_000).toISOString().slice(0, 10);

/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
