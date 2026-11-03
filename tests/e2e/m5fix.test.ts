import { expect, test, type Page } from '@playwright/test';

// M5 review fixes: songs I can play, chord search, level groups and the list kept on "back";
// chord sheets that wrap (never overflow), keep playing on transpose and re-voice with the capo;
// hands-free warm-ups; two-voice tabs without rests on the fret numbers; the split content.

type Summary = { id: string; kind: 'tab' | 'sheet'; chords?: string[]; level: number };

async function waitReady(page: Page) {
	await expect(page.getByTestId('tab-player')).toHaveAttribute('data-ready', 'true', {
		timeout: 30_000
	});
}

/** The chords shown on every visible song row. */
const rowChords = (page: Page) =>
	page
		.getByTestId('song-card')
		.evaluateAll((cards) =>
			cards.map((c) =>
				[...c.querySelectorAll('[data-testid=song-chord]')].map((x) => x.textContent!.trim())
			)
		);

test('library: songs I can play with my chords, several-chord search, level headers', async ({
	page
}) => {
	const songRequests: string[] = [];
	page.on('request', (r) => {
		if (/\/api\/songs\/[^/?]+$/.test(new URL(r.url()).pathname)) songRequests.push(r.url());
	});
	await page.goto('/library?level=all');
	const cards = page.getByTestId('song-card');
	await expect(cards.first()).toBeVisible();
	// Sorted by level, under sticky "Level N" headers.
	const headers = page.getByTestId('level-header');
	await expect(headers.first()).toHaveText('Level 0');
	expect(await headers.count()).toBeGreaterThanOrEqual(4);
	expect(await headers.first().evaluate((h) => getComputedStyle(h).position)).toBe('sticky');
	// Rows say what they are: "Chords" / "Tab" chips, and a sheet's chords.
	const amazing = cards.filter({ hasText: 'Amazing Grace' });
	await expect(amazing.getByTestId('kind-chip')).toHaveText(['Chords', 'Tab']);
	await expect(amazing.getByTestId('song-chord').first()).toBeVisible();

	// My chords (the completed lessons' chords at first): keep only G, C and D.
	await page.getByTestId('my-chords').click();
	await expect(page.getByTestId('chord-picker')).toBeVisible();
	const pressed = page.locator('[data-testid=pick-chord][aria-pressed=true]');
	while ((await pressed.count()) > 0) await pressed.first().click();
	for (const c of ['G', 'C', 'D'])
		await page.locator(`[data-testid=pick-chord][data-chord="${c}"]`).click();
	await page.getByTestId('my-chords-done').click();
	await expect(page.getByTestId('my-chords')).toContainText('3');
	await expect(cards.first()).toBeVisible();
	const shown = await rowChords(page);
	expect(shown.length).toBeGreaterThan(3);
	for (const chords of shown) for (const c of chords) expect(['G', 'C', 'D', 'D/F#']).toContain(c);
	for (const kind of await cards.evaluateAll((cs) => cs.map((c) => c.getAttribute('data-kind'))))
		expect(kind).toBe('sheet');
	// Kept: the list and the picked chords survive a reload.
	await page.reload();
	await expect(page.getByTestId('my-chords')).toHaveAttribute('data-on', 'true');
	await expect(page.getByTestId('my-chords')).toContainText('3');
	expect((await rowChords(page)).length).toBe(shown.length);

	// Several chords in the search box: songs that use all of them.
	await page.getByTestId('my-chords').click();
	await page.getByTestId('my-chords-off').click();
	await page.getByTestId('song-search').fill('G C D7');
	await expect(page).toHaveURL(/q=G\+C\+D7/);
	// Every song using G, C and D7 (a slash chord counts as its chord), and only those.
	const songs = (await (await page.request.get('/api/songs')).json()) as Summary[];
	const base = (c: string) => c.split('/')[0];
	const want = songs.filter((x) =>
		['G', 'C', 'D7'].every((c) => (x.chords ?? []).map(base).includes(c))
	);
	expect(want.length).toBeGreaterThan(0);
	await expect(cards).toHaveCount(want.length);
	// The library never fetched a song's score.
	expect(songRequests).toEqual([]);
});

test('library: filters, search and scroll are kept when coming back from a song', async ({
	page
}) => {
	await page.goto('/library?level=all');
	await page.getByTestId('filter-kind').selectOption('sheet');
	await page.getByTestId('song-search').fill('the');
	await expect(page).toHaveURL(/kind=sheet/);
	const cards = page.getByTestId('song-card');
	const n = await cards.count();
	expect(n).toBeGreaterThan(5);
	await cards.nth(n - 1).scrollIntoViewIfNeeded();
	const y = await page.evaluate(() => scrollY);
	await cards.nth(n - 1).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.goBack();
	await expect(page.getByTestId('song-search')).toHaveValue('the');
	await expect(page.getByTestId('filter-kind')).toHaveValue('sheet');
	await expect(cards).toHaveCount(n);
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(y * 0.8);
});

test('library: the level filter starts at my level ±1 and its chip clears it', async ({ page }) => {
	const songs = (await (await page.request.get('/api/songs')).json()) as Summary[];
	await page.goto('/library');
	await expect(page.getByTestId('level-chip')).toHaveAttribute('data-level', 'near');
	// The reader's level ±1 ("Level 0–1" for a new learner).
	const label = await page
		.getByTestId('filter-level')
		.evaluate((s: HTMLSelectElement) => s.selectedOptions[0].textContent ?? '');
	const [lo, hi] = /Level (\d+)–(\d+)/.exec(label)!.slice(1).map(Number);
	await expect(page.getByTestId('song-card')).toHaveCount(
		songs.filter((s) => s.level >= lo && s.level <= hi).length
	);
	await page.getByTestId('level-chip-clear').click();
	await expect(page.getByTestId('song-card')).toHaveCount(songs.length);
	await expect(page.getByTestId('level-chip-clear')).toHaveCount(0);
});

test('library: exercises say their tempo range and purpose', async ({ page }) => {
	await page.goto('/library?tab=exercises');
	await expect(page.getByTestId('exercise-purpose')).toContainText('Drills from your lessons');
	await expect(page.getByTestId('exercise-bpm').first()).toHaveText(/^\d+→\d+ BPM$/);
});

test('every chord sheet wraps at 390px: nothing runs off the screen', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'phone width');
	test.setTimeout(600_000);
	// No sounds needed to lay out the lyrics.
	await page.route('**/soundfont/**', (r) => r.abort());
	const songs = (await (await page.request.get('/api/songs')).json()) as Summary[];
	const sheets = songs.filter((s) => s.kind === 'sheet');
	expect(sheets.length).toBeGreaterThan(50);
	const bad: string[] = [];
	for (const s of sheets) {
		await page.goto(`/play/${s.id}`);
		await expect(page.getByTestId('sheet-line').first()).toBeVisible();
		const r = await page.evaluate(() => {
			const lyrics = document.querySelector<HTMLElement>('[data-testid=lyrics]')!;
			const right = lyrics.getBoundingClientRect().right;
			const over = [...lyrics.querySelectorAll('[data-testid=sheet-line] span')].filter(
				(el) => el.getBoundingClientRect().right > right + 0.5
			).length;
			return {
				page: document.documentElement.scrollWidth - innerWidth,
				lyrics: lyrics.scrollWidth - lyrics.clientWidth,
				over
			};
		});
		if (r.page > 0 || r.lyrics > 0 || r.over > 0) bad.push(`${s.id} ${JSON.stringify(r)}`);
	}
	expect(bad).toEqual([]);
});

test('a chord sheet: transpose keeps playing from the same bar; the lyrics size is kept', async ({
	page
}) => {
	await page.goto('/play/silent-night');
	await waitReady(page);
	// Start a few lines in.
	await page.getByTestId('sheet-line').nth(3).click();
	await page.getByTestId('play-button').click();
	const play = page.getByTestId('play-button');
	await expect(play).toHaveAttribute('data-playing', 'true');
	const barOf = async () =>
		Number(/Bar (\d+)/.exec((await page.getByTestId('bar-status').textContent()) ?? '')?.[1] ?? 0);
	await expect.poll(barOf).toBeGreaterThan(3);
	const before = await barOf();
	await page.getByTestId('transpose-up').click();
	await expect(page.getByTestId('sheet')).toHaveAttribute('data-transpose', '1');
	await expect(page.getByTestId('sheet-key')).toContainText('Ab');
	// Still playing, from where it was (not back to the top).
	await expect(play).toHaveAttribute('data-playing', 'true');
	await page.waitForTimeout(1500);
	await expect(play).toHaveAttribute('data-playing', 'true');
	expect(await barOf()).toBeGreaterThanOrEqual(before);
	await expect(page.locator('[data-testid=sheet-line][data-current=true]')).toHaveCount(1);
	// Tempo too: a step faster, still playing.
	await page.getByRole('button', { name: 'Faster' }).click();
	await expect(page.getByTestId('tempo-value')).toHaveText('105%');
	await expect(play).toHaveAttribute('data-playing', 'true');
	await play.click();

	// A−/A+: lyrics size, remembered.
	const size = () =>
		page
			.locator('[data-testid=sheet-line] .lyric')
			.first()
			.evaluate((e) => getComputedStyle(e).fontSize);
	expect(await size()).toBe('18px');
	await page.getByTestId('font-up').click();
	expect(await size()).toBe('20px');
	await page.reload();
	await expect(page.getByTestId('sheet-line').first()).toBeVisible();
	expect(await size()).toBe('20px');
	await page.getByTestId('font-down').click();
});

test('a chord sheet: the capo stepper re-voices the shapes and keeps the sounding key', async ({
	page
}) => {
	await page.goto('/play/silent-night');
	const capo = page.getByTestId('capo');
	const bar = page.getByTestId('chord-bar');
	await expect(capo).toHaveText('Capo 1 · sounds in Ab');
	await expect(bar.locator('[data-chord="G"]')).toBeVisible();
	await page.getByTestId('capo-up').click();
	await expect(capo).toHaveText('Capo 2 · sounds in Ab');
	// G shapes one fret lower: F#, C#, B.
	await expect(bar.locator('[data-chord="F#"]')).toBeVisible();
	await expect(page.getByTestId('sheet-line').first()).toContainText('F#');
	// Remembered for this song.
	await page.reload();
	await expect(capo).toHaveText('Capo 2 · sounds in Ab');
	await waitReady(page);
	await page.getByTestId('capo-down').click();
	await page.getByTestId('capo-down').click();
	await expect(capo).toHaveText('No capo · sounds in Ab');
	await expect(bar.locator('[data-chord="Ab"]')).toBeVisible();
	await page.getByTestId('capo-up').click();
	await expect(capo).toHaveText('Capo 1 · sounds in Ab');
	// The notes above verse 1 wait behind ⓘ.
	await expect(page.getByTestId('sheet-notes')).toHaveCount(0);
	await page.getByTestId('sheet-notes-button').click();
	await expect(page.getByTestId('sheet-notes')).toContainText('Capo 1');
});

test('a sheet with a pickup starts on it, under the first line', async ({ page }) => {
	await page.goto('/play/home-on-the-range');
	await waitReady(page);
	await expect(page.getByTestId('bar-status')).toHaveText('Pickup bar');
	await page.getByTestId('play-button').click();
	await expect(page.getByTestId('sheet-line').first()).toHaveAttribute('data-current', 'true', {
		timeout: 5000
	});
	await page.getByTestId('play-button').click();
});

test('warm-ups run hands-free: players start, steps move on by time, a pedal skips', async ({
	page
}) => {
	await page.clock.install();
	await page.goto('/warmups/strum-quarters-to-eighths');
	const runner = page.getByTestId('warmup-runner');
	await page.getByTestId('warmup-start').click();
	await expect(runner).toHaveAttribute('data-step', '0');
	// The strum pattern plays by itself.
	await expect(page.getByTestId('strum')).toHaveAttribute('data-playing', 'true');
	const secs = (t: string) => {
		const [m, s] = t.split(':').map(Number);
		return m * 60 + s;
	};
	const left = secs((await page.getByTestId('warmup-timer').textContent())!.trim());
	expect(left).toBeGreaterThan(5);
	await page.clock.runFor((left + 1) * 1000);
	await expect(runner).toHaveAttribute('data-step', '1');
	await expect(page.getByTestId('strum')).toHaveAttribute('data-playing', 'true');
	// A pedal (PageDown) moves on.
	await page.keyboard.press('PageDown');
	await expect(runner).toHaveAttribute('data-step', '2');
	await page.keyboard.press('PageUp');
	await expect(runner).toHaveAttribute('data-step', '1');

	// A timed stretch shows its time once, and what comes next.
	await page.goto('/warmups/first-warm-up');
	await page.getByTestId('warmup-start').click();
	await expect(page.getByTestId('warmup-stretch')).toBeVisible();
	await expect(page.getByTestId('warmup-timer')).toHaveCount(1);
	await expect(page.getByTestId('warmup-next-preview')).toContainText('Next');
	await page.keyboard.press('PageDown');
	await expect(page.getByTestId('warmup-runner')).toHaveAttribute('data-step', '1');
	await expect(page.getByTestId('warmup-next-preview')).toBeVisible();
});

test('a warm-up tab step starts playing by itself', async ({ page }) => {
	await page.goto('/warmups/changes-em-am-drill');
	await page.getByTestId('warmup-start').click();
	await expect(page.getByTestId('play-button')).toHaveAttribute('data-playing', 'true', {
		timeout: 30_000
	});
});

test('two-voice imported tabs: no rest or triplet mark on a fret number', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'phone', 'one width is enough');
	test.setTimeout(180_000);
	for (const id of ['bach-prelude-bwv999', 'sanz-preludio', 'sor-op60-05', 'giuliani-op50-03']) {
		await page.goto(`/play/${id}`);
		await expect(page.getByTestId('tab-player')).toHaveAttribute('data-rendered', 'true', {
			timeout: 40_000
		});
		// Scroll the tab through, so every lazily drawn line is there.
		await page.getByTestId('tab-viewport').evaluate(async (v) => {
			for (let y = 0; y <= v.scrollHeight; y += 300) {
				v.scrollTop = y;
				await new Promise((r) => setTimeout(r, 100));
			}
			v.scrollTop = 0;
		});
		await page.waitForTimeout(500);
		const r = await page.evaluate(() => {
			const els = [...document.querySelectorAll('[data-testid=tab-viewport] svg text')];
			const digits = els
				.filter((t) => /^\(?\d+\)?$/.test((t.textContent ?? '').trim()))
				.map((t) => t.getBoundingClientRect())
				.filter((b) => b.width > 0);
			const hits: string[] = [];
			for (const t of els as SVGTextElement[]) {
				const c = (t.textContent ?? '').codePointAt(0) ?? 0;
				// SMuFL rests and tuplet numbers (hidden ones are drawn transparent).
				const rest = c >= 0xe4e0 && c <= 0xe4ff;
				const tuplet = c >= 0xe880 && c <= 0xe88f;
				if (!(rest || tuplet) || t.getAttribute('fill') === 'rgba(0,0,0,0)') continue;
				// The glyph's ink, not its font box: around the baseline (a tuplet digit sits on it).
				const b = t.getBoundingClientRect();
				const fs = parseFloat(getComputedStyle(t).fontSize);
				const m = t.getScreenCTM()!;
				const pt = t.ownerSVGElement!.createSVGPoint();
				pt.x = t.x.baseVal[0]?.value ?? 0;
				pt.y = t.y.baseVal[0]?.value ?? 0;
				const y = pt.matrixTransform(m).y;
				const top = y - 0.4 * fs * m.d;
				const bottom = y + (rest ? 0.4 : 0) * fs * m.d;
				for (const d of digits) {
					const ix = Math.min(b.right, d.right) - Math.max(b.left, d.left);
					const iy =
						Math.min(bottom, d.bottom - d.height * 0.2) - Math.max(top, d.top + d.height * 0.2);
					if (ix > 1 && iy > 1)
						hits.push(`${rest ? 'rest' : 'triplet'} on ${Math.round(d.left)},${Math.round(d.top)}`);
				}
			}
			return { digits: digits.length, hits };
		});
		expect(r.digits, id).toBeGreaterThan(50);
		expect(r.hits, id).toEqual([]);
	}
});
