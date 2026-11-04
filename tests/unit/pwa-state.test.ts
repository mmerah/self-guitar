// The update bar's state with a mocked registerSW (see tests/e2e-demo/update.test.ts for a real
// waiting service worker).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'virtual:pwa-register';

type Idle = { path: string; playing: boolean; inSession: boolean };

async function setup(idleState: Idle) {
	vi.resetModules();
	const mod = await import('../../src/lib/pwa/state.svelte');
	let opts: RegisterSWOptions = {};
	const updateSW = vi.fn(async () => {});
	const registerSW = vi.fn((o: RegisterSWOptions) => {
		opts = o;
		return updateSW;
	});
	const idle = { ...idleState };
	mod.startPwaUpdates(registerSW, () => idle);
	return { mod, opts: () => opts, updateSW, registerSW, idle };
}

describe('update bar state', () => {
	beforeEach(() => {
		vi.stubGlobal('document', {
			visibilityState: 'visible',
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		});
		vi.stubGlobal('addEventListener', vi.fn());
		vi.stubGlobal('removeEventListener', vi.fn());
	});
	afterEach(() => vi.unstubAllGlobals());

	it('shows the bar during a session and reloads only on tap', async () => {
		const { mod, opts, updateSW } = await setup({
			path: '/session',
			playing: false,
			inSession: true
		});
		expect(mod.pwaUpdate.needRefresh).toBe(false);
		opts().onNeedRefresh!();
		expect(mod.pwaUpdate.needRefresh).toBe(true);
		expect(updateSW).not.toHaveBeenCalled();
		await mod.applyUpdate();
		expect(updateSW).toHaveBeenCalledWith(true);
	});

	it('applies at once on an idle screen, not while playing', async () => {
		const a = await setup({ path: '/', playing: false, inSession: false });
		a.opts().onNeedRefresh!();
		expect(a.updateSW).toHaveBeenCalledTimes(1);

		const b = await setup({ path: '/', playing: true, inSession: false });
		b.opts().onNeedRefresh!();
		expect(b.updateSW).not.toHaveBeenCalled();
		// Once playback stops and the app is on an idle screen (a navigation), it applies.
		b.idle.playing = false;
		b.mod.maybeAutoApply(() => b.idle);
		expect(b.updateSW).toHaveBeenCalledTimes(1);
	});

	it('checks for updates on visibility, online and hourly, at most once a minute', async () => {
		vi.useFakeTimers();
		const { opts } = await setup({ path: '/tools', playing: false, inSession: false });
		const update = vi.fn(async () => {});
		opts().onRegisteredSW!('/sw.js', { update } as unknown as ServiceWorkerRegistration);
		const docAdd = (document.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
		const onVisible = docAdd.find((c) => c[0] === 'visibilitychange')![1];
		const winAdd = (addEventListener as unknown as ReturnType<typeof vi.fn>).mock.calls;
		const onOnline = winAdd.find((c) => c[0] === 'online')![1];
		onVisible();
		onOnline();
		expect(update).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(60 * 60_000);
		expect(update).toHaveBeenCalledTimes(2);
		vi.useRealTimers();
	});
});
