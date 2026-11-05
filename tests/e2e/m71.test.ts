// M7.1 on the self-hosted server: lesson previews, Start lesson, attempts, reset; the song page's
// Lyrics | Tab | Both switch. (Phone and desktop share one database: each uses its own lessons.)
import { test } from '@playwright/test';
import { attemptStarts, futureLessons, previewStartReset, songViewSwitch } from './m71-helpers';

const at = (p: string) => `/${p}`;
const lessons = () => futureLessons(test.info().project.name === 'phone' ? 0 : 1);

test('a previewed lesson stays out of the plan; Start lesson, then reset', async ({ page }) => {
	await previewStartReset(page, at, lessons().browse);
});

test('an attempt in a previewed lesson starts it', async ({ page }) => {
	await attemptStarts(page, at, lessons().practise);
});

test('song view: Tab hides the lyrics, keeps playing, is remembered', async ({ page }) => {
	await songViewSwitch(page, at);
});
