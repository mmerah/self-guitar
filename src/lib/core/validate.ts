import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { isRealDate, isZone } from '$lib/session/time';

/** Parses input with a schema; any problem is a 400 listing the issues (never a 500). */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
	const parsed = schema.safeParse(input);
	if (!parsed.success)
		error(
			400,
			parsed.error.issues
				.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
				.join('; ')
		);
	return parsed.data;
}

/** The JSON body, or null when it is missing or not JSON (the schema then rejects it). */
export const body = (request: Request) => request.json().catch(() => null);

/** The JSON body; an empty body is `{}`, malformed JSON is a 400. */
export async function optionalBody(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text);
	} catch {
		error(400, 'body must be JSON');
	}
}

/** A real calendar day, YYYY-MM-DD (2026-02-31 is rejected). */
export const dateSchema = z.string().refine(isRealDate, 'date must be a real day (YYYY-MM-DD)');

/**
 * The learner's time zone: an IANA name (DST-safe) or a fixed offset in minutes
 * (Date.getTimezoneOffset). Query strings carry numbers as text.
 */
export const tzSchema = z.preprocess(
	(v) => (typeof v === 'string' && /^-?\d{1,3}$/.test(v) ? Number(v) : v),
	z.union([
		z.number().int().min(-840).max(840),
		z.string().refine(isZone, 'tz must be a time zone (e.g. Europe/Berlin) or an offset')
	])
);

/** `?date=…&tz=…`: the learner's day (shared by Today, goals and history). */
export const dayQuerySchema = z.strictObject({ date: dateSchema, tz: tzSchema.optional() });

/**
 * The lesson a practice result was earned in (sent from a lesson page or a tool opened from one):
 * that lesson becomes started. A slug; an unknown lesson is ignored.
 */
export const lessonRefSchema = z
	.string()
	.max(80)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lesson must be a lesson id');
