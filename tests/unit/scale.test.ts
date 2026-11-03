import { describe, expect, it } from 'vitest';
import {
	clampScale,
	defaultScale,
	readScale,
	SCALE_KEYS,
	stepScale,
	writeScale
} from '../../src/lib/player/scale';

function memory() {
	const m = new Map<string, string>();
	return {
		getItem: (k: string) => m.get(k) ?? null,
		setItem: (k: string, v: string) => void m.set(k, v),
		m
	};
}

describe('tab scale', () => {
	it('defaults: dense on phones, larger on tablets', () => {
		expect(defaultScale('full', true)).toBe(1);
		expect(defaultScale('full', false)).toBe(1.2);
		expect(defaultScale('compact', true)).toBe(0.9);
		expect(defaultScale('compact', false)).toBe(1);
	});

	it('clamps to 0.8–1.6 on a 0.1 grid', () => {
		expect(clampScale(0.5)).toBe(0.8);
		expect(clampScale(2)).toBe(1.6);
		expect(clampScale(1.14)).toBe(1.1);
		expect(clampScale(Number.NaN)).toBe(1);
		expect(stepScale(1, 1)).toBe(1.1);
		expect(stepScale(0.8, -1)).toBe(0.8);
		expect(stepScale(1.6, 1)).toBe(1.6);
		// No float drift after many steps.
		let v = 0.8;
		for (let i = 0; i < 8; i++) v = stepScale(v, 1);
		expect(v).toBe(1.6);
	});

	it('persists per player kind, separately', () => {
		const store = memory();
		expect(readScale('full', true, store)).toBe(1);
		writeScale('full', 1.3, store);
		writeScale('compact', 0.8, store);
		expect(store.m.get(SCALE_KEYS.full)).toBe('1.3');
		expect(readScale('full', true, store)).toBe(1.3);
		expect(readScale('full', false, store)).toBe(1.3);
		expect(readScale('compact', true, store)).toBe(0.8);
	});

	it('ignores junk and unavailable storage', () => {
		const store = memory();
		store.setItem(SCALE_KEYS.full, 'big');
		expect(readScale('full', false, store)).toBe(1.2);
		store.setItem(SCALE_KEYS.full, '9');
		expect(readScale('full', false, store)).toBe(1.6);
		const broken = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		};
		expect(readScale('compact', true, broken)).toBe(0.9);
		expect(() => writeScale('compact', 1, broken)).not.toThrow();
		expect(readScale('full', true, null)).toBe(1);
	});
});
