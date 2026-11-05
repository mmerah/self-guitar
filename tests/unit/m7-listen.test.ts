import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as at from '@coderline/alphatab';
import {
	buildTimeline,
	countInMs,
	isMonophonic,
	listenable,
	strumWindows,
	tickToMs,
	unroll,
	type TickLookupLike
} from '../../src/lib/listen/timeline';
import {
	centsOff,
	matchPass,
	midiToFreq,
	noteColour,
	summarize,
	summaryText
} from '../../src/lib/listen/match';
import {
	hashString,
	latencyKey,
	offsetsToClicks,
	robustOffset
} from '../../src/lib/listen/latency';
import { OnsetDetector } from '../../src/lib/listen/onset';
import { pitchOf } from '../../src/lib/listen/pitchAt';
import { chordMatches, chordSimilarity, chromaOf } from '../../src/lib/listen/chroma';
import { exerciseMetaSchema } from '../../src/lib/content/schema';
import { pluckSamples, SAMPLE_RATE } from '../fixtures/pluck';

function lookupOf(tex: string): { lookup: TickLookupLike; score: at.model.Score } {
	const settings = new at.Settings();
	const imp = new at.importer.AlphaTexImporter();
	imp.initFromString(tex, settings);
	const score = imp.readScore();
	const gen = new at.midi.MidiFileGenerator(
		score,
		settings,
		new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile())
	);
	gen.generate();
	return { lookup: gen.tickLookup as unknown as TickLookupLike, score };
}

const head =
	'\\tempo 80\n\\track ("Guitar") { instrument acousticguitarsteel }\n\\staff { tabs }\n\\ts (4 4)\n';
const firstNotes = fs.readFileSync('content/exercises/first-notes-e-b/score.atex', 'utf8');

describe('expected timeline', () => {
	it('lists every onset of first-notes-e-b with string, fret and MIDI at the ladder tempo', () => {
		const { lookup } = lookupOf(firstNotes);
		const tl = buildTimeline(lookup, { speed: 52 / 80 });
		expect(tl.notes).toHaveLength(14);
		const beat = 60000 / 52;
		expect(tl.notes[0]).toMatchObject({ t: 0, midi: 59, string: 2, fret: 0, bar: 0 });
		expect(tl.notes[1].t).toBeCloseTo(beat, 6);
		expect(tl.notes[2]).toMatchObject({ midi: 62, string: 2, fret: 3 });
		// Bar 3 starts on the high e, after a half note in bar 2.
		expect(tl.notes[7]).toMatchObject({ midi: 64, string: 1, fret: 0, bar: 2 });
		expect(tl.notes[7].t).toBeCloseTo(8 * beat, 6);
		expect(tl.duration).toBeCloseTo(16 * beat, 6);
		expect(isMonophonic(tl)).toBe(true);
	});

	it('follows tempo changes and unrolls repeats', () => {
		const { lookup } = lookupOf(
			head + '\\ro :4 0.2 1.2 3.2 1.2 | \\rc 2 \\tempo 120 0.2 1.2 :2 0.2 | :1 0.1'
		);
		const tl = buildTimeline(lookup);
		// bar 1 (80) + bar 2 (120) twice, then bar 3.
		expect(tl.notes.map((n) => n.bar)).toEqual([0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 2]);
		const q80 = 750;
		const q120 = 500;
		expect(tl.notes[4].t).toBeCloseTo(4 * q80, 6);
		expect(tl.notes[6].t).toBeCloseTo(4 * q80 + 2 * q120, 6);
		// The repeat plays bar 1 at 80 again (alphaTab restores the bar's tempo).
		expect(tl.notes[7].t).toBeCloseTo(4 * q80 + 4 * q120, 6);
		expect(tl.notes[14].t).toBeCloseTo(8 * q80 + 8 * q120, 6);
		expect(tl.duration).toBeCloseTo(8 * q80 + 12 * q120, 6);
		expect(tickToMs(960, tl.map, 2)).toBeCloseTo(375, 6);
	});

	it('adds the count-in and back-to-back loops', () => {
		const { lookup, score } = lookupOf(head + ':4 0.1 1.1 3.1 1.1');
		const tl = buildTimeline(lookup, { speed: 0.5 });
		const ci = countInMs(score.masterBars[0].calculateDuration(), tl.map, 0.5);
		expect(ci).toBeCloseTo(6000, 6); // 4 beats at 40 BPM
		const all = unroll(tl, { countIn: ci, passes: 3 });
		expect(all).toHaveLength(12);
		expect(all[0].t).toBeCloseTo(6000, 6);
		expect(all[4]).toMatchObject({ pass: 1 });
		expect(all[4].t).toBeCloseTo(6000 + 6000, 6);
		expect(all[11].t).toBeCloseTo(6000 + 2 * 6000 + 3 * 1500, 6);
	});

	it('skips tie targets and dead notes, marks legato targets soft', () => {
		const { lookup } = lookupOf(head + ':4 5.3{h} 7.3 x.3 7.3 | :1 7.3{-}');
		const tl = buildTimeline(lookup);
		expect(tl.notes.map((n) => n.fret)).toEqual([5, 7, 7]);
		expect(tl.notes.map((n) => n.soft)).toEqual([false, true, false]);
	});

	it('detects monophonic exercises; the listen flag overrides', () => {
		const chords = buildTimeline(lookupOf(head + ':4 (0.1 1.2 0.3) r r r').lookup);
		expect(isMonophonic(chords)).toBe(false);
		expect(listenable({}, chords)).toBe(false);
		expect(listenable({ listen: true }, chords)).toBe(true);
		const single = buildTimeline(lookupOf(head + ':4 0.1 r 1.1 r').lookup);
		expect(listenable({}, single)).toBe(true);
		expect(listenable({ listen: false }, single)).toBe(false);
		expect(isMonophonic({ notes: [] })).toBe(false);
		// Strum windows carry the chord's pitch classes (E minor: E G B).
		const em = buildTimeline(lookupOf(head + ':4 (0.1 0.2 0.3 2.4 2.5 0.6) r r r').lookup);
		expect(strumWindows(em)).toEqual([{ t: 0, tick: 0, bar: 0, pcs: [4, 7, 11] }]);
	});

	it('the schema accepts an optional listen flag', () => {
		const base = {
			id: 'x-y',
			title: 'Some exercise',
			skills: ['a'],
			howTo: ['Play it.'],
			startBpm: 50,
			targetBpm: 80
		};
		expect(exerciseMetaSchema.parse({ ...base, listen: false }).listen).toBe(false);
		expect(exerciseMetaSchema.parse(base).listen).toBeUndefined();
		expect(() => exerciseMetaSchema.parse({ ...base, listen: 'yes' })).toThrow();
	});
});

describe('matching and scoring', () => {
	const notes = [0, 500, 1000, 1500].map((t, i) => ({ t, midi: 60 + i }));
	const f = (midi: number) => midiToFreq(midi);

	it('grades timing windows: perfect ≤ 50, ok ≤ 120, else early / late', () => {
		const r = matchPass(notes, [
			{ t: 30, freq: f(60) },
			{ t: 500 - 110, freq: f(61) },
			{ t: 1000 + 180, freq: f(62) },
			{ t: 1500 - 200, freq: f(63) }
		]);
		expect(r.notes.map((n) => n.status)).toEqual(['perfect', 'ok', 'late', 'early']);
		expect(r.notes[0].dt).toBe(30);
		const s = summarize(r);
		expect(s).toMatchObject({ hits: 2, total: 4, late: 1, early: 1, clean: false });
		expect(summaryText(s)).toBe('2/4 notes · 1 late · 1 early');
	});

	it('checks pitch within ±50 cents, folding octave errors', () => {
		expect(centsOff(f(60) * 2, 60)).toBeCloseTo(0, 6);
		expect(centsOff(f(60) / 2, 60)).toBeCloseTo(0, 6);
		const r = matchPass(notes, [
			{ t: 0, freq: f(60) * 2 }, // octave error: fine
			{ t: 500, freq: f(61) * 2 ** (40 / 1200) }, // 40 cents sharp: fine
			{ t: 1000, freq: f(64) }, // wrong note
			{ t: 1500, freq: null } // no clear pitch: timing only, at most ok
		]);
		expect(r.notes.map((n) => n.status)).toEqual(['perfect', 'perfect', 'wrong', 'ok']);
		expect(r.notes[3].unclear).toBe(true);
		const s = summarize(r);
		expect(s.wrong).toBe(1);
		expect(s.clean).toBe(false);
		expect(noteColour('wrong')).toBe('bad');
		expect(noteColour('late')).toBe('off');
		expect(noteColour('ok')).toBe('good');
	});

	it('counts missed notes and extra onsets; one onset never serves two notes', () => {
		const r = matchPass(notes, [
			{ t: 10, freq: f(60) },
			{ t: 250, freq: f(60) }, // between notes: extra
			{ t: 1010, freq: f(62) }
		]);
		expect(r.notes.map((n) => n.status)).toEqual(['perfect', 'missed', 'perfect', 'missed']);
		expect(r.extra).toEqual([{ t: 250, freq: f(60) }]);
		expect(summaryText(summarize(r))).toBe('2/4 notes · 2 missed');
	});

	it('prefers the right pitch among close onsets', () => {
		const r = matchPass(
			[{ t: 0, midi: 60 }],
			[
				{ t: 5, freq: f(65) },
				{ t: 40, freq: f(60) }
			]
		);
		expect(r.notes[0]).toMatchObject({ status: 'perfect', dt: 40 });
		expect(r.extra).toHaveLength(1);
	});

	it('marks open windows pending while the pass plays, and soft notes do not count when unheard', () => {
		const r = matchPass(notes, [{ t: 0, freq: f(60) }], { now: 600 });
		expect(r.notes.map((n) => n.status)).toEqual(['perfect', 'pending', 'pending', 'pending']);
		const soft = matchPass(
			[
				{ t: 0, midi: 60 },
				{ t: 500, midi: 62, soft: true }
			],
			[{ t: 0, freq: f(60) }]
		);
		expect(summarize(soft)).toMatchObject({ total: 1, hits: 1, clean: true });
	});

	it('auto-rates clean at ≥ 90 % hits with no wrong pitch', () => {
		const many = Array.from({ length: 20 }, (_, i) => ({ t: i * 400, midi: 64 }));
		const heard = (skip: number) => many.slice(skip).map((n) => ({ t: n.t + 20, freq: f(64) }));
		expect(summarize(matchPass(many, heard(2))).clean).toBe(true); // 18/20
		expect(summarize(matchPass(many, heard(3))).clean).toBe(false); // 17/20
		expect(summarize(matchPass([], [])).clean).toBe(false);
	});
});

describe('in-order alignment (dense passages)', () => {
	const f = (midi: number) => midiToFreq(midi);
	const run = (n: number, spacing: number, midi = (i: number) => 60 + (i % 5)) =>
		Array.from({ length: n }, (_, i) => ({ t: i * spacing, midi: midi(i) }));

	it('16ths 94 ms apart played 60 ms late are all late-but-ok, not missed + perfect + extra', () => {
		const notes = run(16, 94);
		const heard = notes.map((n) => ({ t: n.t + 60, freq: f(n.midi) }));
		const r = matchPass(notes, heard);
		expect(r.notes.map((n) => n.status)).toEqual(Array(16).fill('ok'));
		expect(r.notes.every((n) => n.dt === 60)).toBe(true);
		expect(r.extra).toHaveLength(0);
		expect(summarize(r)).toMatchObject({ hits: 16, missed: 0, extra: 0, clean: true });
	});

	it('the same at one pitch (no pitch to tell neighbours apart) and 64 notes long', () => {
		const notes = run(64, 94, () => 64);
		const heard = notes.map((n) => ({ t: n.t + 60, freq: f(64) }));
		const r = matchPass(notes, heard);
		expect(r.notes.every((n) => n.status === 'ok' && n.dt === 60)).toBe(true);
		expect(r.extra).toHaveLength(0);
	});

	it('played early the same way: all ok, early side', () => {
		const notes = run(16, 94);
		const r = matchPass(
			notes,
			notes.map((n) => ({ t: n.t - 55, freq: f(n.midi) }))
		);
		expect(r.notes.every((n) => n.status === 'ok' && n.dt === -55)).toBe(true);
	});

	it('a skipped note in a run: that note missed, its neighbours kept in order', () => {
		const notes = run(12, 94);
		const heard = notes.filter((_, i) => i !== 5).map((n) => ({ t: n.t + 30, freq: f(n.midi) }));
		const r = matchPass(notes, heard);
		expect(r.notes[5].status).toBe('missed');
		expect(r.notes.filter((n) => n.status === 'perfect')).toHaveLength(11);
		expect(r.extra).toHaveLength(0);
	});

	it('pairs never cross: a jittered run keeps onsets in order', () => {
		const notes = run(20, 90);
		const jitter = [
			20, -30, 45, -10, 35, 0, -40, 25, 10, -20, 30, -35, 40, 5, -25, 15, -5, 35, -15, 0
		];
		const heard = notes.map((n, i) => ({ t: n.t + 40 + jitter[i], freq: f(n.midi) }));
		const r = matchPass(notes, heard);
		const dts = r.notes.map((n) => n.dt!);
		expect(dts).toEqual(jitter.map((j) => 40 + j));
		expect(r.extra).toHaveLength(0);
	});

	it('a doubled onset (a buzz) becomes one extra, the run still matches', () => {
		const notes = run(8, 120);
		const heard = notes.map((n) => ({ t: n.t + 10, freq: f(n.midi) }));
		heard.splice(3, 0, { t: notes[2].t + 60, freq: f(notes[2].midi) });
		const r = matchPass(notes, heard);
		expect(r.notes.every((n) => n.status === 'perfect')).toBe(true);
		expect(r.extra).toHaveLength(1);
		expect(summarize(r).clean).toBe(true); // one stray onset is allowed
	});
});

describe('unclear pitch and extras', () => {
	const f = (midi: number) => midiToFreq(midi);
	const notes = Array.from({ length: 12 }, (_, i) => ({ t: i * 400, midi: 64 }));

	it('an onset with no clear pitch is at most ok, never perfect (soft notes excepted)', () => {
		const r = matchPass([{ t: 0, midi: 64 }], [{ t: 5, freq: null }]);
		expect(r.notes[0]).toMatchObject({ status: 'ok', unclear: true });
		const soft = matchPass([{ t: 0, midi: 64, soft: true }], [{ t: 5, freq: null }]);
		expect(soft.notes[0].status).toBe('perfect');
	});

	it('clean caps the share of unclear hits', () => {
		const heard = (unclear: number) =>
			notes.map((n, i) => ({ t: n.t + 10, freq: i < unclear ? null : f(64) }));
		expect(summarize(matchPass(notes, heard(3)))).toMatchObject({ unclear: 3, clean: true });
		expect(summarize(matchPass(notes, heard(4)))).toMatchObject({ unclear: 4, clean: false });
		// All unclear: every note "hit" on timing, but nothing proves the notes were right.
		expect(summarize(matchPass(notes, heard(12))).clean).toBe(false);
	});

	it('extra onsets beyond the allowance cost accuracy and the clean rating', () => {
		const heard = notes.map((n) => ({ t: n.t + 10, freq: f(64) }));
		const stray = (k: number) =>
			Array.from({ length: k }, (_, i) => ({ t: notes[i].t + 200, freq: f(64) }));
		const one = summarize(matchPass(notes, [...heard, ...stray(1)]));
		expect(one).toMatchObject({ extra: 1, accuracy: 1, clean: true });
		const many = summarize(matchPass(notes, [...heard, ...stray(5)]));
		expect(many.extra).toBe(5);
		expect(many.accuracy).toBeCloseTo(12 / (12 + 4), 6);
		expect(many.clean).toBe(false);
	});

	it('glyphs go with the colours', async () => {
		const { noteGlyph } = await import('../../src/lib/listen/match');
		expect(
			['perfect', 'ok', 'early', 'late', 'wrong', 'missed', 'pending'].map((s) =>
				noteGlyph(s as never)
			)
		).toEqual(['✓', '✓', '←', '→', '✗', '○', null]);
	});
});

describe('latency calibration', () => {
	it('pairs taps with the nearest click', () => {
		const clicks = [0, 750, 1500, 2250];
		expect(offsetsToClicks([40, 760, 1490, 2700], clicks)).toEqual([40, 10, -10]);
	});

	it('takes the median after rejecting outliers', () => {
		const est = robustOffset([82, 78, 80, 79, 76, 300, 81, -150])!;
		expect(est.ms).toBe(80);
		expect(est.rejected.sort((a, b) => a - b)).toEqual([-150, 300]);
		expect(est.kept).toBe(6);
		expect(est.spread).toBeLessThanOrEqual(3);
	});

	it('refuses an inconsistent run', () => {
		expect(robustOffset([10, 20, 30])).toBeNull();
		expect(robustOffset([0, 300, -300, 0, 600, -600])).toBeNull();
		expect(robustOffset([60, 140, 20, 180, 100, 90, 110, 40])).not.toBeNull();
	});

	it('keys the stored value by device and output', () => {
		expect(hashString('a')).not.toBe(hashString('b'));
		expect(latencyKey('UA', 'Headphones')).not.toBe(latencyKey('UA', 'Speaker'));
		expect(latencyKey('UA')).toMatch(/^listen\.latency\.[0-9a-z]+$/);
	});
});

describe('onset detection and pitch', () => {
	/** A take: notes (time s, MIDI) as decaying plucks over a little noise. */
	function take(notes: { t: number; midi: number }[], seconds: number) {
		const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
		let seed = 1;
		for (let i = 0; i < out.length; i++) {
			seed = (seed * 16807) % 2147483647;
			out[i] = (seed / 2147483647 - 0.5) * 0.002;
		}
		for (const n of notes) {
			const s = pluckSamples(
				midiToFreq(n.midi),
				[
					{ amp: 1, decay: 3 },
					{ amp: 0.5, decay: 4 },
					{ amp: 0.3, decay: 5 }
				],
				1.2
			);
			const at0 = Math.round(n.t * SAMPLE_RATE);
			for (let i = 0; i < s.length && at0 + i < out.length; i++) out[at0 + i] += 0.4 * s[i];
		}
		return out;
	}
	function run(samples: Float32Array) {
		const d = new OnsetDetector({ sampleRate: SAMPLE_RATE });
		const events = [];
		for (let f = 0; f + 128 <= samples.length; f += 128)
			events.push(...d.process(samples.subarray(f, f + 128), f));
		return events;
	}

	it('finds each pluck within a few ms and reads its pitch', () => {
		const notes = [
			{ t: 0.3, midi: 59 },
			{ t: 0.9, midi: 60 },
			{ t: 1.5, midi: 62 },
			{ t: 2.1, midi: 40 },
			{ t: 2.7, midi: 64 }
		];
		const events = run(take(notes, 3.6));
		expect(events).toHaveLength(notes.length);
		events.forEach((e, i) => {
			expect(Math.abs(e.frame / SAMPLE_RATE - notes[i].t)).toBeLessThan(0.006);
			const p = pitchOf(e.samples, SAMPLE_RATE);
			expect(p).not.toBeNull();
			expect(Math.abs(centsOff(p!.freq, notes[i].midi))).toBeLessThan(20);
		});
	});

	it('hears a re-plucked ringing note each time', () => {
		const notes = [0.2, 0.6, 1.0, 1.4].map((t) => ({ t, midi: 45 }));
		const events = run(take(notes, 2));
		expect(events.map((e) => Math.round((e.frame / SAMPLE_RATE) * 100) / 100)).toEqual([
			0.2, 0.6, 1, 1.4
		]);
	});

	it('stays quiet on room noise and a ringing note', () => {
		expect(run(take([], 1))).toHaveLength(0);
		expect(run(take([{ t: 0.1, midi: 52 }], 1.2))).toHaveLength(1);
	});
});

describe('experimental chord check', () => {
	const chord = (midis: number[]) => {
		const out = new Float32Array(8192);
		for (const m of midis) {
			const s = pluckSamples(
				midiToFreq(m),
				[
					{ amp: 1, decay: 2 },
					{ amp: 0.4, decay: 3 },
					{ amp: 0.2, decay: 4 }
				],
				8192 / SAMPLE_RATE
			);
			for (let i = 0; i < out.length; i++) out[i] += s[i] / midis.length;
		}
		return out;
	};
	const EM = [40, 47, 52, 55, 59, 64];
	const G = [43, 47, 50, 55, 59, 67];
	const C = [48, 52, 55, 60, 64];

	it('matches a strummed chord to its pitch classes', () => {
		const em = chromaOf(chord(EM), SAMPLE_RATE);
		expect(chordSimilarity(em, [4, 7, 11])).toBeGreaterThan(0.75);
		expect(chordMatches(em, [4, 7, 11])).toBe(true);
		expect(chordMatches(chromaOf(chord(G), SAMPLE_RATE), [7, 11, 2])).toBe(true);
		expect(chordMatches(chromaOf(chord(C), SAMPLE_RATE), [0, 4, 7])).toBe(true);
	});

	it('rejects the wrong chord', () => {
		expect(chordMatches(chromaOf(chord(C), SAMPLE_RATE), [4, 7, 11])).toBe(false);
		expect(chordMatches(chromaOf(chord(EM), SAMPLE_RATE), [0, 4, 7])).toBe(false);
	});
});

describe('live checker', () => {
	it('anchors passes on playback positions, compensates latency and reports each pass', async () => {
		const { LiveChecker } = await import('../../src/lib/listen/checker');
		const { lookup } = lookupOf(head + ':4 0.1 1.1 3.1 1.1');
		const tl = buildTimeline(lookup); // 4 notes, 750 ms apart, 3 s per pass
		const done: ReturnType<typeof summarize>[] = [];
		const c = new LiveChecker({ update: () => {}, done: (r) => done.push(r.summary) });
		c.setTimeline(tl);
		c.latency = 90;
		const start = 10_000; // first beat of pass 1 (after the count-in)
		// Count-in: tick 0 only.
		for (let t = start - 3000; t < start; t += 50) c.position(0, t);
		// Positions arrive 0–15 ms late.
		const play = (from: number, passStart: number) => {
			for (let t = from; t < passStart + 3000; t += 40) {
				const tick = Math.round(((t - passStart) / 750) * 960);
				if (tick > 0) c.position(tick, t + ((t / 40) % 4) * 5);
			}
		};
		play(start, start);
		// The player heard, 90 ms late (latency), with pitch; the 4th note wrong.
		const midis = [64, 65, 67, 70];
		midis.forEach((m, i) => c.onset({ perf: start + i * 750 + 90 + 10, freq: midiToFreq(m) }));
		c.tick(start + 3000 + 90 + 400);
		expect(done).toHaveLength(1);
		expect(done[0]).toMatchObject({ total: 4, hits: 3, wrong: 1, clean: false });
		// Pass 2: the loop wraps, all right.
		play(start + 3000, start + 3000);
		[64, 65, 67, 65].forEach((m, i) =>
			c.onset({ perf: start + 3000 + i * 750 + 90 - 20, freq: midiToFreq(m) })
		);
		c.tick(start + 6000 + 90 + 400);
		expect(done).toHaveLength(2);
		expect(done[1]).toMatchObject({ hits: 4, perfect: 4, clean: true });
	});

	it('drops a stopped pass; a tempo change mid-pass keeps judging it', async () => {
		const { LiveChecker } = await import('../../src/lib/listen/checker');
		const { lookup } = lookupOf(head + ':4 0.1 1.1 3.1 1.1');
		const done: ReturnType<typeof summarize>[] = [];
		const c = new LiveChecker({ update: () => {}, done: (r) => done.push(r.summary) });
		c.setTimeline(buildTimeline(lookup));
		c.position(480, 1000);
		c.abandon();
		c.tick(10_000);
		expect(done).toHaveLength(0);
		// 80 BPM for two beats, then 160 BPM (speed 2) from tick 1920.
		const start = 20_000;
		for (let t = start + 40; t < start + 1500; t += 40) c.position(((t - start) / 750) * 960, t);
		c.setTimeline(buildTimeline(lookup, { speed: 2 }));
		for (let t = start + 1500; t < start + 2250; t += 40)
			c.position(1920 + ((t - start - 1500) / 375) * 960, t);
		const heardAt = [0, 750, 1500, 1875];
		heardAt.forEach((t, i) =>
			c.onset({ perf: start + t + 15, freq: midiToFreq([64, 65, 67, 65][i]) })
		);
		c.tick(start + 2250 + 400);
		expect(done).toHaveLength(1);
		expect(done[0]).toMatchObject({ hits: 4, perfect: 4, clean: true });
	});
});
