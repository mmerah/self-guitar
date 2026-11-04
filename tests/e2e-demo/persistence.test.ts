// The demo's storage: one tab owns the database, saves are prompt, failures never overwrite
// stored progress, old snapshots migrate, and the sample seed is all or nothing. Pages of one
// test share a browser context, so they share IndexedDB like tabs of one browser.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const T = { timeout: 30_000 };

async function open(context: BrowserContext, path: string) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.error(`page error: ${e.message}`));
	await page.goto(path);
	return page;
}

/** One clean pass on an exercise's tempo ladder; returns the streak after it. */
async function clean(page: Page, exercise: string) {
	await page.goto(`practice/exercise/${exercise}`);
	const ladder = page.getByTestId('ladder');
	await expect(ladder).toBeVisible(T);
	const streak = Number(await ladder.getAttribute('data-streak'));
	await page.getByTestId('ladder-clean').click();
	await expect(ladder).toHaveAttribute('data-streak', String(streak + 1));
	return streak + 1;
}

async function streak(page: Page, exercise: string) {
	await page.goto(`practice/exercise/${exercise}`);
	const ladder = page.getByTestId('ladder');
	await expect(ladder).toBeVisible(T);
	return ladder.getAttribute('data-streak');
}

/** The saved snapshot's bytes (null when none), read from IndexedDB in the page. */
const snapshot = (page: Page) =>
	page.evaluate(
		() =>
			new Promise<number[] | null>((resolve, reject) => {
				const r = indexedDB.open('self-guitar-demo', 1);
				r.onupgradeneeded = () => r.result.createObjectStore('kv');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const get = r.result.transaction('kv').objectStore('kv').get('db');
					get.onsuccess = () => {
						r.result.close();
						resolve(get.result ? Array.from(get.result as Uint8Array) : null);
					};
				};
			})
	);

test('a second tab shows the notice; "Use it here" moves the data with it', async ({ context }) => {
	const a = await open(context, './');
	await expect(a.getByTestId('start-card')).toHaveAttribute('data-ready', 'true', T);
	expect(await clean(a, 'chromatic-warm-up')).toBe(1);

	const b = await open(context, './');
	await expect(b.getByTestId('tab-notice')).toBeVisible();
	await expect(b.getByTestId('tab-notice')).toContainText('Self-Guitar is open in another tab');
	await b.getByTestId('tab-use-here').click();
	await expect(b.getByTestId('tab-notice')).toBeHidden();
	await expect(b.getByTestId('start-card')).toHaveAttribute('data-ready', 'true', T);
	await expect(a.getByTestId('tab-notice')).toBeVisible();
	expect(await streak(b, 'chromatic-warm-up')).toBe('1');
	expect(await clean(b, 'chromatic-warm-up')).toBe(2);

	// Back to the first tab: it reloads from what the second one saved.
	await a.getByTestId('tab-use-here').click();
	await expect(a.getByTestId('tab-notice')).toBeHidden(T);
	await expect(b.getByTestId('tab-notice')).toBeVisible();
	expect(await streak(a, 'chromatic-warm-up')).toBe('2');
});

test('Reset data with two tabs open clears both', async ({ context }) => {
	const a = await open(context, 'about/attributions');
	await a.getByTestId('demo-load-sample').click();
	await expect(a.getByTestId('demo-message')).toHaveText(
		'Sample loaded: about 2 weeks in, Level 4',
		T
	);
	await expect(a.getByTestId('demo-toast')).toBeVisible();
	const b = await open(context, 'progress');
	await expect(b.getByTestId('tab-notice')).toBeVisible();

	a.on('dialog', (d) => void d.accept());
	await Promise.all([a.waitForEvent('load'), a.getByTestId('demo-reset').click()]);
	await a.goto('progress');
	await expect(a.getByTestId('progress-empty')).toBeVisible(T);
	await expect(b.getByTestId('tab-notice')).toBeVisible();
	// Taking over reloads the second tab (it was told about the reset).
	await Promise.all([b.waitForEvent('load'), b.getByTestId('tab-use-here').click()]);
	await expect(b.getByTestId('progress-empty')).toBeVisible(T);
	expect(await snapshot(b)).toBeNull();
});

test('a write survives closing or leaving the tab right after it', async ({ context }) => {
	for (const leave of ['close', 'navigate'] as const) {
		const page = await open(context, './');
		const n = await clean(page, 'em-down-strums');
		if (leave === 'close') await page.close();
		else await page.goto('about:blank');
		if (leave === 'navigate') await page.close();
		const next = await open(context, './');
		expect(await streak(next, 'em-down-strums'), leave).toBe(String(n));
		await next.close();
	}
});

test('unreadable storage: read-only, with a banner, and nothing overwritten', async ({
	context
}) => {
	const first = await open(context, './');
	expect(await clean(first, 'chromatic-warm-up')).toBe(1);
	await first.close();

	const broken = await context.newPage();
	await broken.addInitScript(() => {
		IDBObjectStore.prototype.get = () => {
			throw new DOMException('denied', 'UnknownError');
		};
	});
	await broken.goto('./');
	await expect(broken.getByTestId('demo-storage-alert')).toContainText(
		"progress won't be saved",
		T
	);
	// The app still works, in memory (the stored progress is not visible to it).
	expect(await clean(broken, 'chromatic-warm-up')).toBe(1);
	expect(await clean(broken, 'open-string-pulse')).toBe(1);
	await expect(broken.getByTestId('demo-storage-alert')).toBeVisible();
	// Reset does not throw either; storage is untouched by this page.
	await broken.close();

	const after = await open(context, './');
	expect(await streak(after, 'chromatic-warm-up')).toBe('1');
	expect(await streak(after, 'open-string-pulse')).toBe('0');
});

test('a full disk shows a banner', async ({ context }) => {
	const page = await context.newPage();
	await page.addInitScript(() => {
		IDBObjectStore.prototype.put = () => {
			throw new DOMException('full', 'QuotaExceededError');
		};
	});
	await page.goto('./');
	await clean(page, 'chromatic-warm-up');
	await expect(page.getByTestId('demo-storage-alert')).toContainText('storage is full', T);
});

test('an old snapshot (user_version) migrates to the journal and keeps its data', async ({
	context
}) => {
	// The schema of the first three migrations, counted the old way (PRAGMA user_version).
	const require = createRequire(import.meta.url);
	const initSqlJs = require('sql.js') as (o?: object) => Promise<{
		Database: new (b?: Uint8Array) => {
			run(q: string): void;
			exec(q: string): { values: unknown[][] }[];
			export(): Uint8Array;
		};
	}>;
	const SQL = await initSqlJs();
	const old = new SQL.Database();
	const files = fs.readdirSync('drizzle').filter((f) => f.endsWith('.sql'));
	files.sort();
	for (const f of files.slice(0, 3))
		for (const stmt of fs.readFileSync(`drizzle/${f}`, 'utf8').split('--> statement-breakpoint'))
			if (stmt.trim()) old.run(stmt);
	old.run('PRAGMA user_version = 3');
	old.run("INSERT INTO profile (id, name) VALUES (1, 'Default')");
	old.run(
		"INSERT INTO chord_change_record (profile_id, chord_a, chord_b, count) VALUES (1, 'A', 'D', 38)"
	);
	const bytes = Array.from(old.export());

	const page = await open(context, 'manifest.webmanifest');
	await page.evaluate(
		(arr) =>
			new Promise<void>((resolve, reject) => {
				const r = indexedDB.open('self-guitar-demo', 1);
				r.onupgradeneeded = () => r.result.createObjectStore('kv');
				r.onerror = () => reject(r.error);
				r.onsuccess = () => {
					const tx = r.result.transaction('kv', 'readwrite');
					tx.objectStore('kv').put(new Uint8Array(arr), 'db');
					tx.oncomplete = () => (r.result.close(), resolve());
				};
			}),
		bytes
	);
	await page.goto('tools/changes');
	await page.getByLabel('First chord').selectOption('A');
	await page.getByLabel('Second chord').selectOption('D');
	await expect(page.getByTestId('pair-best')).toContainText('38', T);
	// A table from the fourth migration works (and the write saves the migrated database).
	await page.goto('./');
	await page.getByTestId('length-5').click();
	await page.getByTestId('start-session').click();
	await expect(page.getByTestId('session-runner')).toBeVisible(T);
	await expect.poll(async () => (await snapshot(page))?.length !== bytes.length).toBe(true);

	const saved = new SQL.Database(new Uint8Array((await snapshot(page))!));
	const rows = saved.exec('SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at');
	const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
	expect(rows[0].values.map((r) => Number(r[0]))).toEqual(
		journal.entries.map((e: { when: number }) => e.when)
	);
	expect(saved.exec('PRAGMA user_version')[0].values[0][0]).toBe(0);
	expect(saved.exec('SELECT count(*) FROM practice_session')[0].values[0][0]).toBe(1);
});

test('a failing sample seed changes nothing', async ({ context }) => {
	const page = await context.newPage();
	// The seed creates its sessions with crypto.randomUUID, after completing the lessons.
	await page.addInitScript(() => {
		crypto.randomUUID = () => {
			throw new Error('test: seed failure');
		};
	});
	await page.goto('about/attributions');
	await page.getByTestId('demo-load-sample').click();
	await expect(page.getByTestId('demo-message')).toContainText('nothing was changed', T);
	await page.goto('learn');
	await expect(page.getByTestId('lesson-row').first()).toBeVisible(T);
	await expect(page.locator('[data-testid=lesson-row][data-state=completed]')).toHaveCount(0);
	expect(await snapshot(page)).toBeNull();
});
