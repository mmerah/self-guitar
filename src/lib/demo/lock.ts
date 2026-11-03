// One tab at a time owns the demo's database (each tab holds its own copy in memory, so two
// writers would overwrite each other's saves). The owner holds a Web Lock for its lifetime; other
// tabs show a full-screen notice whose "Use it here" asks the owner (over a BroadcastChannel) to
// save and let go. Browsers without Web Locks fall back to "saved" messages: other tabs reload
// their copy before their next request, and a banner warns about the second tab.
const LOCK = 'self-guitar-demo-db';

export type DemoMessage = { type: 'takeover' } | { type: 'saved' } | { type: 'reset' };

const channel =
	typeof BroadcastChannel === 'function' ? new BroadcastChannel('self-guitar-demo') : undefined;
const handlers: ((m: DemoMessage) => void)[] = [];
if (channel)
	channel.onmessage = (e: MessageEvent<DemoMessage>) => handlers.forEach((h) => h(e.data));

export const post = (m: DemoMessage) => channel?.postMessage(m);
export const onMessage = (h: (m: DemoMessage) => void) => void handlers.push(h);

const locks = () => (globalThis.navigator as Navigator | undefined)?.locks;
/** True where tabs take turns (Web Locks); false in the "saved"-message fallback. */
export const usesLocks = () => typeof locks()?.request === 'function';

let owned: Promise<void> | undefined;
let resolveOwned: () => void = () => {};
let release: (() => void) | undefined;
/** This document had the database before (and gave it away): taking it back reloads. */
let hadIt = false;
let asking = false;
let beforeRelease: () => Promise<void> = async () => {};

/** What the owner does before another tab takes over (save, close). */
export function onHandoff(fn: () => Promise<void>) {
	beforeRelease = fn;
}

/**
 * Marks this tab (sessionStorage survives its reloads) as the owner: reloading it waits for the
 * lock its previous page is letting go of, rather than losing it to the notice.
 */
const OWNER_KEY = 'self-guitar-demo-owner';
function markOwner(on: boolean) {
	try {
		if (on) sessionStorage.setItem(OWNER_KEY, '1');
		else sessionStorage.removeItem(OWNER_KEY);
	} catch {
		// storage blocked: a reload may show the notice
	}
}
function wasOwner() {
	try {
		return sessionStorage.getItem(OWNER_KEY) === '1';
	} catch {
		return false;
	}
}

/** Holds the lock until a takeover; the database is ours meanwhile. */
function hold() {
	markOwner(true);
	return new Promise<void>((done) => {
		release = done;
		hadIt = true;
		asking = false;
		hideNotice();
		resolveOwned();
	});
}

/** Taking the database over reloads the page (its state is stale: another tab reset the demo). */
export function reloadOnTakeover() {
	hadIt = true;
}

/** Resolves once this tab owns the database: at once without Web Locks, else after a takeover. */
export function claim(): Promise<void> {
	owned ??= new Promise<void>((resolve) => {
		resolveOwned = resolve;
		const l = locks();
		if (!l?.request) return resolve();
		const firstTry = () =>
			l.request(LOCK, { ifAvailable: true }, (lock) => (lock ? hold() : showNotice()));
		if (wasOwner()) {
			// A reload of the owner tab: its previous page releases the lock as it unloads.
			const abort = new AbortController();
			const timer = setTimeout(() => abort.abort(), 2000);
			l.request(LOCK, { signal: abort.signal }, () => {
				clearTimeout(timer);
				return hold();
			}).catch(firstTry);
		} else void firstTry();
		onMessage(async (m) => {
			if (m.type !== 'takeover' || !release) return;
			const done = release;
			release = undefined;
			markOwner(false);
			try {
				await beforeRelease();
			} finally {
				done();
				showNotice();
			}
		});
	});
	return owned;
}

/** "Use it here": asks the owner to let go, then takes the lock (reloading if we had it before). */
function takeOver() {
	const l = locks();
	if (!l || asking) return;
	asking = true;
	const button = document.querySelector<HTMLButtonElement>('#sg-tab-notice button');
	if (button) button.disabled = true;
	void l.request(LOCK, () => {
		if (!hadIt) return hold();
		markOwner(true);
		location.reload();
		return new Promise<void>(() => {});
	});
	post({ type: 'takeover' });
}

function showNotice() {
	if (document.getElementById('sg-tab-notice')) return;
	const el = document.createElement('div');
	el.id = 'sg-tab-notice';
	el.setAttribute('role', 'dialog');
	el.setAttribute('aria-modal', 'true');
	el.setAttribute('aria-labelledby', 'sg-tab-notice-title');
	el.dataset.testid = 'tab-notice';
	el.style.cssText =
		'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:24px;' +
		'background:var(--bg,#111318);color:var(--text,#e8eaf0);text-align:center;font:inherit';
	el.innerHTML = `<div style="max-width:22rem">
	<h2 id="sg-tab-notice-title" style="font-size:1.375rem;font-weight:700;margin-bottom:.5rem">Self-Guitar is open in another tab</h2>
	<p style="color:var(--muted,#9aa3b5);margin-bottom:1.25rem">The demo keeps your progress in this browser and runs in one tab at a time.</p>
	<button type="button" data-testid="tab-use-here" style="min-height:44px;padding:0 1.25rem;border-radius:12px;font-weight:600;background:var(--accent,#f5a524);color:var(--accent-text,#1a1206)">Use it here</button>
</div>`;
	el.querySelector('button')!.addEventListener('click', takeOver);
	document.body.append(el);
	el.querySelector('button')!.focus();
}

function hideNotice() {
	document.getElementById('sg-tab-notice')?.remove();
}
