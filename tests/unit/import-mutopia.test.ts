import { describe, expect, it } from 'vitest';
// A plain .mjs build script: imported by a computed path, so the type check leaves it alone
// (importing it runs nothing).
const MODULE = '../../scripts/import/mutopia.mjs';
type Attribution = {
	composer: string;
	title: string;
	maintainer: string | null;
	id: string;
	infoUrl: string;
	lic: string;
	note?: string;
};
const { attribution, licence, licenceUrl, lyDuration, lyTempo } = (await import(
	/* @vite-ignore */ MODULE
)) as {
	attribution: (a: Attribution) => string;
	licence: (name: string) => string;
	licenceUrl: (lic: string) => string;
	lyDuration: (d: string) => number;
	lyTempo: (src: string) => number | null;
};

describe('Mutopia import: tempo', () => {
	it('reads LilyPond durations in quarters', () => {
		expect(lyDuration('4')).toBe(1);
		expect(lyDuration('2')).toBe(2);
		expect(lyDuration('8')).toBe(0.5);
		expect(lyDuration('4.')).toBe(1.5);
		expect(lyDuration('2.')).toBe(3);
		expect(lyDuration('4*2')).toBe(2);
		expect(() => lyDuration('3')).toThrow();
	});

	it('turns any beat unit into a quarter-note BPM', () => {
		expect(lyTempo('\\tempo 4 = 120')).toBe(120);
		expect(lyTempo('\\tempo 2 = 60')).toBe(120);
		expect(lyTempo('\\tempo 4. = 60')).toBe(90);
		expect(lyTempo('\\tempo 8 = 132')).toBe(66);
		expect(lyTempo('\\tempo "Allegro" 2. = 50')).toBe(150);
		expect(lyTempo('\\tempo \\markup { Andante } 4 = 76')).toBe(76);
		// A range takes its first number; no metronome mark is no tempo.
		expect(lyTempo('\\tempo 4 = 100-120')).toBe(100);
		expect(lyTempo('\\tempo "Andante"')).toBeNull();
		expect(lyTempo("\\relative c' { c4 d e f }")).toBeNull();
	});
});

describe('Mutopia import: licence and attribution', () => {
	it('maps licence names and their deed URLs', () => {
		expect(licence('Public Domain')).toBe('Public Domain');
		expect(licence('Creative Commons Attribution-ShareAlike 3.0')).toBe('CC BY-SA 3.0');
		expect(licence('Creative Commons Attribution 4.0')).toBe('CC BY 4.0');
		expect(() => licence('All rights reserved')).toThrow();
		expect(licenceUrl('CC BY-SA 3.0')).toBe('https://creativecommons.org/licenses/by-sa/3.0/');
		expect(licenceUrl('CC BY 4.0')).toBe('https://creativecommons.org/licenses/by/4.0/');
		expect(licenceUrl('CC0 1.0')).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
		expect(licenceUrl('Public Domain')).toMatch(/^https:\/\/www\.mutopiaproject\.org\//);
		expect(() => licenceUrl('GPL')).toThrow();
	});

	const base = {
		composer: 'Fernando Sor',
		title: 'Lesson No. 5, Op. 60',
		maintainer: 'Jane Doe',
		id: 'Mutopia-2010/01/01-123',
		infoUrl: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=123'
	};

	it('a Public Domain edition: the tablature is released under CC0', () => {
		const a = attribution({ ...base, lic: 'Public Domain' });
		expect(a).toContain('Fernando Sor - Lesson No. 5, Op. 60.');
		expect(a).toContain('Edition typeset by Jane Doe for the Mutopia Project');
		expect(a).toContain(`Mutopia id ${base.id}, ${base.infoUrl}`);
		expect(a).toContain(
			'released under CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/'
		);
		expect(a.endsWith('.')).toBe(true);
	});

	it('a CC BY-SA edition: the tablature keeps the licence, with the change and its URL', () => {
		const a = attribution({
			...base,
			maintainer: null,
			lic: 'CC BY-SA 4.0',
			note: 'two grace notes omitted'
		});
		expect(a).toContain('Mutopia Project edition');
		expect(a).toContain('CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/;');
		expect(a).toContain('changes: converted to guitar tablature with fingering');
		expect(a).not.toContain('CC0');
		expect(a).toMatch(/; two grace notes omitted\.$/);
	});
});
