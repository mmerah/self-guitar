// The JSON API as one table of request handlers, shared by both deployments: the self-hosted
// server mounts each entry as a SvelteKit endpoint (src/routes/api/**/+server.ts via
// $lib/server/endpoint), the static demo calls the same handlers in the browser ($lib/demo/shim).
// Handlers get the database through the context, so they never touch a driver directly.
import { error, json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { lessonPairKey, pairKey } from '$lib/chordChanges';
import { dueBy } from '$lib/session/time';
import { changeInputSchema, listChangePairs, saveChangeRecord } from './chordChanges';
import {
	getExercise,
	getLearnIndex,
	getLesson,
	getSong,
	getSongCredits,
	getSongSummary,
	listSongs
} from './content';
import { DEFAULT_PROFILE_ID as P, type Db } from './db';
import {
	applyReview,
	attemptInputSchema,
	attemptProblem,
	confirmMastery,
	exerciseDetail,
	getLearnProgress,
	lessonStatusInputSchema,
	masteryInputSchema,
	recordAttempt,
	resetInputSchema,
	resetLesson,
	setLessonStatus,
	startPractised,
	syncSkillStates
} from './learn';
import { getProgress, listProgress, progressInputSchema, saveProgress } from './progress';
import {
	earInputSchema,
	earSummary,
	fretboardInputSchema,
	listQuizzes,
	saveEarResult,
	saveQuizResult
} from './ear';
import { EAR_KINDS, isEarKind } from '$lib/ear/items';
import {
	blockResultSchema,
	completeBlock,
	endInputSchema,
	endSession,
	getGoals,
	getHistory,
	getPlan,
	getSession,
	getSettings,
	openSession,
	planQuerySchema,
	queryObject,
	saveSettings,
	SessionConflict,
	sessionOfDay,
	settingsSchema,
	startInputSchema,
	startSession,
	targetProblem
} from './session';
import { body, dayQuerySchema, optionalBody, parse } from './validate';

export type ApiContext = {
	db: Db;
	params: Record<string, string>;
	url: URL;
	request: Request;
};
export type ApiHandler = (ctx: ApiContext) => Response | Promise<Response>;
export type Method = 'GET' | 'POST' | 'PUT';

/** A body checked against a schema (unreadable JSON is a 400 like any other problem). */
async function input<S extends z.ZodType>(schema: S, request: Request): Promise<z.output<S>> {
	return parse(schema, await body(request));
}

function requireSong(id: string) {
	const song = getSongSummary(id);
	if (!song) error(404, 'Song not found');
	return song;
}

/** Route patterns (SvelteKit syntax: `[param]` is one path segment) to their handlers. */
export const routes = {
	'/api/health': {
		GET: ({ db }) => {
			db.get(sql`select 1`);
			return json({ ok: true });
		}
	},

	// ---- songs and player progress ----
	'/api/songs': { GET: () => json(listSongs()) },
	/** Every song's source and license (the attributions page). */
	'/api/credits': { GET: async () => json(await getSongCredits()) },
	'/api/songs/[id]': {
		GET: async ({ params }) => {
			const song = await getSong(params.id);
			if (!song) error(404, 'Song not found');
			return json(song);
		}
	},
	'/api/songs/[id]/progress': {
		GET: ({ db, params }) => {
			requireSong(params.id);
			return json(getProgress(db, P, params.id));
		},
		PUT: async ({ db, params, request }) => {
			const song = requireSong(params.id);
			const data = await input(progressInputSchema, request);
			if (data.loopEndBar !== null && data.loopEndBar >= song.bars)
				error(400, `loop must be within the song's ${song.bars} bars`);
			return json(saveProgress(db, P, params.id, data));
		}
	},
	/** Saved progress for every song touched so far, most recently played first. */
	'/api/progress': {
		// With each song's title and pickup flag, so Today needs no song list for its "Continue".
		GET: ({ db }) =>
			json(
				listProgress(db, P).map((p) => {
					const s = getSongSummary(p.songId);
					return s ? { ...p, title: s.title, pickup: s.pickup } : p;
				})
			)
	},

	// ---- curriculum ----
	/**
	 * The compiled curriculum (levels, lessons, exercises) without lesson bodies or exercise
	 * scores: small, precached by the service worker.
	 */
	'/api/learn': { GET: () => json(getLearnIndex()) },
	/** One exercise with its score (cached by the service worker once opened). */
	'/api/learn/exercises/[id]': {
		GET: async ({ params }) => {
			const ex = await getExercise(params.id);
			if (!ex) error(404, 'Exercise not found');
			return json(ex);
		}
	},
	/** Lesson states, mastery checks, skill status, exercise stats and the next lesson. */
	'/api/learn/progress': { GET: ({ db }) => json(getLearnProgress(db, P, getLearnIndex())) },
	/**
	 * Marks a lesson started (the "Start lesson" button, the session's new-skill block) or completed;
	 * returns the updated progress. Opening a lesson writes nothing.
	 */
	'/api/learn/lessons/[id]': {
		/** The lesson's body and the exercises it shows, with their scores. */
		GET: async ({ params }) => {
			const payload = await getLesson(params.id);
			if (!payload) error(404, 'Lesson not found');
			return json(payload);
		},
		PUT: async ({ db, params, request }) => {
			const index = getLearnIndex();
			if (!index.lessons.some((l) => l.id === params.id)) error(404, 'Lesson not found');
			const { status } = await input(lessonStatusInputSchema, request);
			setLessonStatus(db, P, params.id, status);
			syncSkillStates(db, P, index);
			return json(getLearnProgress(db, P, index));
		}
	},
	/**
	 * Resets a lesson to not started (out of the plan and "Continue"); its history stays. Returns
	 * the updated progress.
	 */
	'/api/learn/lessons/[id]/reset': {
		POST: async ({ db, params, request }) => {
			const index = getLearnIndex();
			if (!index.lessons.some((l) => l.id === params.id)) error(404, 'Lesson not found');
			parse(resetInputSchema, await optionalBody(request));
			resetLesson(db, P, params.id);
			syncSkillStates(db, P, index);
			return json(getLearnProgress(db, P, index));
		}
	},
	/** Confirms a self-assessed mastery check (checklist or tuner); returns the updated progress. */
	'/api/learn/lessons/[id]/mastery': {
		POST: async ({ db, params, request }) => {
			const index = getLearnIndex();
			const lesson = index.lessons.find((l) => l.id === params.id);
			if (!lesson) error(404, 'Lesson not found');
			const { checked } = await input(masteryInputSchema, request);
			const problem = confirmMastery(db, P, lesson, checked);
			if (problem) error(400, problem);
			// Taking the check is practising the lesson.
			startPractised(db, P, index, lesson.id);
			syncSkillStates(db, P, index);
			return json(getLearnProgress(db, P, index), { status: 201 });
		}
	},
	/** One exercise's stats and the ladder's exact position (for the practice page). */
	'/api/exercises/[id]': {
		GET: ({ db, params }) => {
			const ex = getLearnIndex().exercises.find((e) => e.id === params.id);
			if (!ex) error(404, 'Exercise not found');
			return json(exerciseDetail(db, P, ex));
		}
	},
	/** Records one tempo-ladder pass (bpm, clean); returns the exercise's stats and ladder position. */
	'/api/exercises/[id]/attempts': {
		POST: async ({ db, params, request }) => {
			const index = getLearnIndex();
			const ex = index.exercises.find((e) => e.id === params.id);
			if (!ex) error(404, 'Exercise not found');
			const data = await input(attemptInputSchema, request);
			const problem = attemptProblem(ex, data);
			if (problem) error(400, problem);
			startPractised(db, P, index, data.lesson);
			return json(recordAttempt(db, P, ex, data, index), { status: 201 });
		}
	},

	// ---- 1-minute changes ----
	/** Every practised chord pair: personal best and recent history. */
	'/api/chord-changes': {
		GET: ({ db }) => json(listChangePairs(db, P)),
		POST: async ({ db, request }) => {
			const data = await input(changeInputSchema, request);
			const pair = saveChangeRecord(db, P, data);
			// Changes records count toward lessons' changes checks.
			const index = getLearnIndex();
			startPractised(db, P, index, data.lesson);
			syncSkillStates(db, P, index);
			// Reaching a lesson's changes goal again is a good review of that lesson's (due) skills.
			const key = pairKey(pair.chordA, pair.chordB);
			const now = Date.now();
			for (const l of index.lessons) {
				const m = l.mastery;
				if (m?.type !== 'changes' || data.count < m.target || lessonPairKey(m) !== key) continue;
				applyReview(db, P, l.skills, true, now, dueBy(undefined, data.tz, now));
			}
			return json(pair, { status: 201 });
		}
	},

	// ---- ear trainer and fretboard quiz ----
	/** One kind's latest answers (the trainer's history) and per-item accuracy: ?kind=intervals */
	'/api/ear': {
		GET: ({ db, url }) => {
			const kind = url.searchParams.get('kind') ?? '';
			if (!isEarKind(kind)) error(400, `kind must be one of ${EAR_KINDS.join(', ')}`);
			return json(earSummary(db, P, kind));
		},
		/** Stores one answer (it counts toward ear mastery checks); returns the kind's summary. */
		POST: async ({ db, request }) => {
			const data = await input(earInputSchema, request);
			const summary = saveEarResult(db, P, data);
			const index = getLearnIndex();
			startPractised(db, P, index, data.lesson);
			syncSkillStates(db, P, index);
			return json(summary, { status: 201 });
		}
	},
	/** Every quiz played: tries, best passing time, the latest rounds. */
	'/api/fretboard': {
		GET: ({ db }) => json(listQuizzes(db, P)),
		/** Stores one quiz round; returns that quiz's summary. */
		POST: async ({ db, request }) => {
			const data = await input(fretboardInputSchema, request);
			const summary = saveQuizResult(db, P, data);
			const index = getLearnIndex();
			startPractised(db, P, index, data.lesson);
			syncSkillStates(db, P, index);
			return json(summary, { status: 201 });
		}
	},

	// ---- Today: sessions, goals, history ----
	/** The session in progress, if any (resuming on another device). */
	'/api/session': {
		GET: ({ db }) => json(openSession(db, P)),
		/**
		 * Starts a session with the previewed plan (or a fresh one). The id comes from the client, so
		 * a retried or offline-queued start is stored once; an id another profile uses is a 409.
		 */
		POST: async ({ db, request }) => {
			const data = await input(startInputSchema, request);
			const index = getLearnIndex();
			const blocks = data.blocks ?? getPlan(db, P, index, data).blocks;
			for (const b of blocks) {
				const problem = targetProblem(b, index);
				if (problem) error(400, `${b.title}: ${problem}`);
			}
			try {
				return json(startSession(db, P, { ...data, blocks }), { status: 201 });
			} catch (e) {
				if (e instanceof SessionConflict) error(409, 'This session id is already in use');
				throw e;
			}
		}
	},
	/** Today's plan for a length: ?minutes=15&date=2026-11-03&tz=-60 */
	'/api/session/plan': {
		GET: ({ db, url }) =>
			json(getPlan(db, P, getLearnIndex(), parse(planQuerySchema, queryObject(url, ['minutes']))))
	},
	/** The latest session of the learner's day (null if none): ?date=… */
	'/api/session/today': {
		GET: ({ db, url }) => {
			const { date } = parse(dayQuerySchema, queryObject(url, []));
			return json(sessionOfDay(db, P, date));
		}
	},
	'/api/session/[id]': {
		GET: ({ db, params }) => {
			const s = getSession(db, P, params.id);
			if (!s) error(404, 'Session not found');
			return json(s);
		}
	},
	/** Stores a block's result (done or skipped, rating, "clean at BPM"); idempotent. */
	'/api/session/[id]/blocks/[idx]': {
		PUT: async ({ db, params, request }) => {
			if (!/^\d{1,2}$/.test(params.idx)) error(400, 'idx must be a block number');
			const { tz, ...result } = await input(blockResultSchema, request);
			const session = getSession(db, P, params.id);
			if (!session) error(404, 'Session not found');
			const idx = Number(params.idx);
			if (idx >= session.blocks.length) error(400, `idx must be below ${session.blocks.length}`);
			const due = dueBy(session.date, tz);
			return json(completeBlock(db, P, params.id, idx, result, getLearnIndex(), due));
		}
	},
	/** Ends a session; returns the summary (minutes, blocks done, PBs, reviews moved, tomorrow). */
	'/api/session/[id]/end': {
		POST: async ({ db, params, request }) => {
			const data = parse(endInputSchema, await optionalBody(request));
			const summary = endSession(db, P, params.id, getLearnIndex(), data);
			if (!summary) error(404, 'Session not found');
			if (summary === 'early') error(400, 'endedAt must not be before the session started');
			return json(summary);
		}
	},
	/** Weekly goal (days × minutes) and default session length. */
	'/api/settings': {
		GET: ({ db }) => json(getSettings(db, P)),
		PUT: async ({ db, request }) => json(saveSettings(db, P, await input(settingsSchema, request)))
	},
	/** The weekly goal ring: settings, this week's days and minutes, streak. */
	'/api/goals': {
		GET: ({ db, url }) => {
			const { date } = parse(dayQuerySchema, queryObject(url, []));
			return json(getGoals(db, P, date));
		}
	},
	/** Progress charts: minutes per day, BPM records, changes per pair, skills per level, weeks. */
	'/api/history': {
		GET: ({ db, url }) => {
			const q = parse(dayQuerySchema, queryObject(url, []));
			return json(getHistory(db, P, getLearnIndex(), q.date, q.tz));
		}
	}
} satisfies Record<string, Partial<Record<Method, ApiHandler>>>;

export type Route = keyof typeof routes;

/** Exact routes first, then by fewer params: '/api/session/plan' wins over '/api/session/[id]'. */
const table = Object.entries(routes)
	.map(([pattern, methods]) => ({
		segs: pattern.split('/'),
		params: (pattern.match(/\[/g) ?? []).length,
		methods: methods as Partial<Record<string, ApiHandler>>
	}))
	.sort((a, b) => a.params - b.params);

/**
 * The handler for a request path (no query, no base), with its params; null when none. A param
 * that is not valid percent-encoding is a 400 (thrown).
 */
export function matchRoute(
	method: string,
	pathname: string
): { handler: ApiHandler; params: Record<string, string> } | 'method' | null {
	const parts = pathname.replace(/\/$/, '').split('/');
	for (const { segs, methods } of table) {
		if (segs.length !== parts.length) continue;
		if (!segs.every((s, i) => (s.startsWith('[') ? parts[i] !== '' : s === parts[i]))) continue;
		const params: Record<string, string> = {};
		for (const [i, s] of segs.entries()) {
			if (!s.startsWith('[')) continue;
			try {
				params[s.slice(1, -1)] = decodeURIComponent(parts[i]);
			} catch {
				error(400, 'Malformed path');
			}
		}
		const handler = methods[method];
		return handler ? { handler, params } : 'method';
	}
	return null;
}
