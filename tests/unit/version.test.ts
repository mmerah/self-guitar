import { describe, expect, it, vi } from 'vitest';
import { buildDate, formatVersion, resolveBuildSha, shortSha } from '../../src/lib/pwa/version';
import { canAutoApply, createUpdateChecker } from '../../src/lib/pwa/update';

describe('version string', () => {
	it('formats version · sha · date', () => {
		expect(formatVersion({ version: '0.6.0', sha: '12e4f7a', date: '2026-11-04' })).toBe(
			'Self-Guitar v0.6.0 · 12e4f7a · 2026-11-04'
		);
	});
	it('leaves out empty parts and a doubled v', () => {
		expect(formatVersion({ version: 'v0.6.0', sha: 'dev', date: '' })).toBe(
			'Self-Guitar v0.6.0 · dev'
		);
	});
	it('shortens shas and keeps other labels', () => {
		expect(shortSha('12E4F7A0123456789abcdef0123456789abcdef0')).toBe('12e4f7a');
		expect(shortSha(' local ')).toBe('local');
		expect(shortSha('')).toBeNull();
		expect(shortSha(undefined)).toBeNull();
		expect(shortSha('<script>')).toBe('script');
	});
	it('prefers BUILD_SHA, then git, then dev', () => {
		expect(resolveBuildSha('abcdef1234', () => '1111111')).toBe('abcdef1');
		expect(resolveBuildSha(undefined, () => '12e4f7a\n')).toBe('12e4f7a');
		expect(
			resolveBuildSha('', () => {
				throw new Error('not a git repository');
			})
		).toBe('dev');
	});
	it('dates the build in UTC', () => {
		expect(buildDate(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-04');
	});
});

describe('update checks', () => {
	it('run at most once a minute, only while visible', () => {
		let t = 0;
		let visible = true;
		const update = vi.fn(() => Promise.resolve());
		const c = createUpdateChecker({ update, now: () => t, isVisible: () => visible });
		expect(c.check()).toBe(true);
		t = 30_000;
		expect(c.check()).toBe(false);
		t = 61_000;
		visible = false;
		expect(c.check()).toBe(false);
		visible = true;
		expect(c.check()).toBe(true);
		expect(update).toHaveBeenCalledTimes(2);
	});
	it('swallow a failed check', async () => {
		const c = createUpdateChecker({
			update: () => Promise.reject(new Error('offline')),
			isVisible: () => true
		});
		expect(c.check()).toBe(true);
		await Promise.resolve();
	});
});

describe('auto-applying an update', () => {
	const idle = { playing: false, inSession: false };
	it('happens on idle Today, Learn and Library', () => {
		for (const p of ['/', '/learn', '/library', '/learn/'])
			expect(canAutoApply(p, idle)).toBe(true);
	});
	it('never during a session, playback or elsewhere', () => {
		expect(canAutoApply('/session', idle)).toBe(false);
		expect(canAutoApply('/', { playing: true, inSession: false })).toBe(false);
		expect(canAutoApply('/learn', { playing: false, inSession: true })).toBe(false);
		for (const p of ['/play/drunken-sailor', '/tools', '/learn/chord-e', '/practice/x'])
			expect(canAutoApply(p, idle)).toBe(false);
	});
});
