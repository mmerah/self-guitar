import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type { Block, LearnIndex, LearnProgress, Lesson } from '../../src/lib/learn/types';

// Phone and desktop share one server database: tests read the current state instead of
// assuming a fresh one, and look lessons up by role (first L1 lesson, a lesson with a changes
// check…) rather than by name, so content edits don't break them.

async function noHorizontalScroll(page: Page) {
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
	expect(overflow).toBeLessThanOrEqual(0);
}

const blur = (page: Page) =>
	page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

const getIndex = async (r: APIRequestContext) =>
	(await (await r.get('/api/learn')).json()) as LearnIndex;
const getProgress = async (r: APIRequestContext) =>
	(await (await r.get('/api/learn/progress')).json()) as LearnProgress;
const setStatus = (r: APIRequestContext, id: string, status: string) =>
	r.put(`/api/learn/lessons/${id}`, { data: { status } });

function* blocksOf(blocks: Block[]): Generator<Block> {
	for (const b of blocks) {
		yield b;
		if (b.t === 'callout') yield* blocksOf(b.blocks);
	}
}

test('the skill tree lists the levels and leads to the recommended lesson', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('learn-entry').click();
	await expect(page).toHaveURL(/\/learn(\/[\w-]+)?$/);

	await page.goto('/learn');
	await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
	await expect(page.getByTestId('unit')).not.toHaveCount(0);
	await expect(page.getByTestId('lesson-row').first()).toBeVisible();
	if (await page.getByTestId('learn-wide').isVisible()) {
		await expect(page.getByTestId('level-tab')).toHaveCount(10);
		await page.getByTestId('level-tab').nth(2).click();
		await expect(page.getByRole('heading', { name: /^Level 2 · / })).toBeVisible();
	} else {
		// Phone: far-off levels start collapsed and open on tap.
		const open = page.locator('[data-testid=level][data-open=true]');
		const before = await open.count();
		await page
			.locator('[data-testid=level][data-open=false]')
			.first()
			.getByTestId('level-toggle')
			.click();
		await expect(open).toHaveCount(before + 1);
	}
	// Soft gates: a muted pill, no padlocks.
	await expect(page.getByTestId('level-gate').first()).toContainText('Recommended after Level');
	await noHorizontalScroll(page);

	const cta = page.getByTestId('learn-continue');
	const id = await cta.getAttribute('data-lesson');
	await cta.click();
	await expect(page).toHaveURL(new RegExp(`/learn/${id}$`));
	await expect(page.getByTestId('lesson')).toBeVisible();
	await expect(page.getByTestId('lesson-state')).not.toHaveAttribute('data-state', 'new');
	await noHorizontalScroll(page);
});

test('next lesson: latest started wins; mid-L1 never goes back to Level 0', async ({
	page
}, info) => {
	const index = await getIndex(page.request);
	const l1 = index.lessons.filter((l) => l.level === 1);
	const [a, b] = info.project.name === 'phone' ? l1 : l1.slice(2);

	// Open an L1 lesson: as the most recently started lesson, it is what Continue offers.
	await page.goto(`/learn/${b.id}`);
	await expect(page.getByTestId('lesson-state')).toHaveAttribute('data-state', 'started');
	await page.goto('/learn');
	await expect(page.getByTestId('learn-continue')).toHaveAttribute('data-lesson', b.id);
	await page.goto('/');
	await expect(page.getByTestId('learn-entry-title')).toHaveText(b.title);

	// Finish every started lesson (other tests leave some open) and the first two of L1: with
	// Level 0 lessons still unfinished, the pick stays in Level 1 or later.
	const p = await getProgress(page.request);
	for (const [id, l] of Object.entries(p.lessons))
		if (l.state === 'started') await setStatus(page.request, id, 'completed');
	await setStatus(page.request, a.id, 'completed');
	await setStatus(page.request, b.id, 'completed');
	await page.goto('/learn');
	const id = await page.getByTestId('learn-continue').getAttribute('data-lesson');
	const picked = index.lessons.find((l) => l.id === id)!;
	expect(picked.level).toBeGreaterThanOrEqual(1);
	expect(index.lessons.indexOf(picked)).toBeGreaterThan(index.lessons.indexOf(b));
	await page.goto('/');
	await expect(page.getByTestId('learn-entry-title')).toHaveText(picked.title);
});

test('a strum pattern plays in sync with the click', async ({ page }) => {
	const index = await getIndex(page.request);
	const lesson = index.lessons.find((l) =>
		[...blocksOf(l.blocks)].some((b) => b.t === 'strum' && b.pattern.length === 8)
	)!;
	const block = [...blocksOf(lesson.blocks)].find((b) => b.t === 'strum')!;
	await page.goto(`/learn/${lesson.id}`);
	const strum = page.getByTestId('strum').first();
	await expect(strum.locator('li')).toHaveCount(8);
	// Opens at the lesson's tempo.
	if (block.t === 'strum')
		await expect(strum.getByTestId('strum-bpm')).toHaveText(String(block.bpm));
	await expect(strum.getByTestId('strum-count').first()).toHaveText('1');
	await strum.getByTestId('strum-play').click();
	await expect(strum).toHaveAttribute('data-playing', 'true');
	await expect(strum).toHaveAttribute('data-slot', /^[0-7]$/, { timeout: 5000 });
	await expect(strum.locator('li[data-active=true]')).toHaveCount(1);
	const bpm = Number(await strum.getByTestId('strum-bpm').textContent());
	await strum.getByRole('button', { name: 'Faster' }).click();
	await expect(strum.getByTestId('strum-bpm')).toHaveText(String(bpm + 5));
	await strum.getByTestId('strum-play').click();
	await expect(strum).toHaveAttribute('data-playing', 'false');
	await expect(strum).toHaveAttribute('data-slot', '-1');
});

test('lessons render chords, inline tab and tool links that lead back', async ({ page }) => {
	await page.goto('/learn/reading-tab-and-diagrams');
	await expect(page.getByTestId('lesson-chords').getByTestId('chord-card')).not.toHaveCount(0);
	const tab = page.locator('[data-testid=tab-player][data-compact=true]').first();
	await tab.scrollIntoViewIfNeeded();
	await expect(tab).toHaveAttribute('data-rendered', 'true', { timeout: 20_000 });
	// Compact players: one tempo (BPM only), and no synth until Play is tapped.
	await expect(tab.getByTestId('tempo-value')).toHaveText(/^\d+ BPM$/);
	await expect(tab).toHaveAttribute('data-ready', 'false');
	await expect(tab.getByTestId('play-button')).toBeEnabled();

	const index = await getIndex(page.request);
	const metronome = index.lessons.find((l) =>
		[...blocksOf(l.blocks)].some((b) => b.t === 'tool' && b.name === 'metronome' && b.params.bpm)
	)!;
	const tool = [...blocksOf(metronome.blocks)].find(
		(b) => b.t === 'tool' && b.name === 'metronome'
	);
	await page.goto(`/learn/${metronome.id}`);
	await page.locator('[data-testid=tool-link][data-tool=metronome]').first().click();
	await expect(page).toHaveURL(new RegExp(`/tools/metronome\\?.*from=${metronome.id}`));
	if (tool?.t === 'tool') await expect(page.getByTestId('bpm-value')).toHaveText(tool.params.bpm);
	await page.getByTestId('tool-back').click();
	await expect(page).toHaveURL(new RegExp(`/learn/${metronome.id}$`));
});

test('a changes card carries the lesson goal; back returns to the lesson', async ({ page }) => {
	const index = await getIndex(page.request);
	let found: { lesson: Lesson; target: number } | null = null;
	for (const l of index.lessons) {
		const m = l.mastery;
		if (m?.type !== 'changes') continue;
		if ([...blocksOf(l.blocks)].some((b) => b.t === 'tool' && b.name === 'changes'))
			found = { lesson: l, target: m.target };
		if (found) break;
	}
	test.skip(!found, 'no lesson links a changes card');
	const { lesson, target } = found!;
	await page.goto(`/learn/${lesson.id}`);
	const card = page.locator('[data-testid=tool-link][data-tool=changes]', {
		hasText: `goal ${target}/min`
	});
	await card.first().click();
	await expect(page).toHaveURL(new RegExp(`target=${target}&from=${lesson.id}`));
	await expect(page.getByTestId('lesson-goal')).toHaveText(`Lesson goal: ${target}`);
	// The active tab stays Learn.
	const current = page.locator('nav [aria-current=page]:visible');
	await expect(current).toHaveText(/Learn/);
	await page.getByTestId('tool-back').click();
	await expect(page).toHaveURL(new RegExp(`/learn/${lesson.id}$`));
});

test('ladder: one miss resets the streak, two drop a step; it resumes after reload', async ({
	page
}) => {
	const index = await getIndex(page.request);
	const lesson = index.lessons.find((l) => l.mastery?.type === 'exercise')!;
	const ex = index.exercises.find(
		(e) => lesson.mastery?.type === 'exercise' && e.id === lesson.mastery.id
	)!;
	await page.goto(`/learn/${lesson.id}`);
	await page
		.locator(`[data-testid=exercise-card][data-exercise=${ex.id}]`)
		.getByTestId('exercise-practice')
		.click();
	await expect(page).toHaveURL(new RegExp(`/practice/exercise/${ex.id}\\?from=${lesson.id}$`));
	await expect(page.locator('[data-testid=tab-player][data-rendered=true]')).toBeVisible({
		timeout: 20_000
	});
	await expect(page.getByTestId('clean-definition')).toBeVisible();

	const ladder = page.getByTestId('ladder');
	const bpm = page.getByTestId('ladder-bpm');
	// Climb to start + 2 steps (the other project may have left it anywhere on the ladder).
	const start = Number(await ladder.getAttribute('data-bpm'));
	const clean = page.getByTestId('ladder-clean');
	const miss = page.getByTestId('ladder-miss');
	for (let i = 0; i < ex.cleanReps; i++) await clean.click();
	const up = Math.min(ex.targetBpm, start + ex.step);
	await expect(bpm).toHaveText(String(up));
	if (up < ex.targetBpm)
		await expect(page.getByTestId('ladder-feedback')).toContainText(`Up to ${up}`);

	await clean.click();
	await expect(ladder).toHaveAttribute('data-streak', '1');
	await miss.click();
	await expect(ladder).toHaveAttribute('data-streak', '0');
	await expect(bpm).toHaveText(String(up));
	await expect(page.getByTestId('ladder-feedback')).toContainText('streak reset');
	await miss.click();
	const down = Math.max(ex.startBpm, up - ex.step);
	await expect(bpm).toHaveText(String(down));

	// Pedal / keyboard: right arrow and Space are "clean", left arrow is "miss".
	await blur(page);
	await page.keyboard.press('ArrowRight');
	await expect(ladder).toHaveAttribute('data-streak', '1');
	const saved = page.waitForResponse((r) => r.url().includes('/attempts') && r.ok());
	await page.keyboard.press('ArrowLeft');
	await saved;
	await expect(ladder).toHaveAttribute('data-streak', '0');
	await expect(ladder).toHaveAttribute('data-misses', '1');

	// Stored: a reload resumes at the same tempo and miss count.
	await page.reload();
	await expect(bpm).toHaveText(String(down));
	await expect(ladder).toHaveAttribute('data-misses', '1');
});

test('exercise page: keyboard users can start playback', async ({ page }) => {
	const index = await getIndex(page.request);
	const ex = index.exercises[0];
	await page.goto(`/practice/exercise/${ex.id}`);
	const player = page.getByTestId('tab-player');
	await expect(player).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
	const play = page.getByTestId('play-button');
	const streak = await page.getByTestId('ladder').getAttribute('data-streak');
	// Enter on the focused Play button plays (it is not taken as a "clean" rating).
	await play.focus();
	await page.keyboard.press('Enter');
	await expect(play).toHaveAttribute('data-playing', 'true', { timeout: 10_000 });
	await expect(page.getByTestId('ladder')).toHaveAttribute('data-streak', streak!);
	// P toggles playback from anywhere.
	await blur(page);
	await page.keyboard.press('p');
	await expect(play).toHaveAttribute('data-playing', 'false');
});

test('the mastery check and Next update the skill tree', async ({ page }, info) => {
	const index = await getIndex(page.request);
	const selfChecks = index.lessons.filter((l) => l.mastery?.type === 'self' && l.level === 0);
	const lesson = selfChecks[info.project.name === 'phone' ? 0 : 1] ?? selfChecks[0];
	const at = index.lessons.indexOf(lesson);
	await page.goto(`/learn/${lesson.id}`);
	await expect(page.getByTestId('lesson-state')).not.toHaveAttribute('data-state', 'new');

	await page.getByTestId('mastery-open').click();
	const sheet = page.getByTestId('mastery-sheet');
	await expect(sheet).toBeVisible();
	if ((await sheet.getAttribute('data-done')) !== 'true') {
		const confirm = sheet.getByTestId('mastery-confirm');
		await expect(confirm).toBeDisabled();
		for (const box of await sheet.getByTestId('mastery-item').all()) await box.check();
		await confirm.click();
	}
	await expect(sheet.getByTestId('mastery-passed')).toBeVisible();
	await sheet.getByRole('button', { name: 'Close' }).click();
	await expect(page.getByTestId('lesson-state')).toHaveAttribute('data-state', 'mastered');
	await expect(page.getByTestId('lesson-bar-state')).toContainText('Mastered');

	// The one primary action: "Next: <title>".
	const next = index.lessons[at + 1];
	await expect(page.getByTestId('next-lesson')).toContainText(`Next: ${next.title}`);
	await page.getByTestId('next-lesson').click();
	await expect(page).toHaveURL(new RegExp(`/learn/${next.id}$`));

	await page.goto('/learn');
	if (await page.getByTestId('learn-wide').isVisible())
		await page.getByTestId('level-tab').nth(lesson.level).click();
	await expect(page.locator(`[data-testid=lesson-row][data-lesson=${lesson.id}]`)).toHaveAttribute(
		'data-state',
		'mastered'
	);
});

test('the exercise practice view fits a phone and a desktop', async ({ page }) => {
	const index = await getIndex(page.request);
	await page.goto(`/practice/exercise/${index.exercises[1].id}`);
	await expect(page.getByTestId('ladder-clean')).toBeInViewport();
	await expect(page.getByTestId('ladder-miss')).toBeInViewport();
	await noHorizontalScroll(page);
});
