// M7.1 on the static demo: the same flows through the in-browser API.
import { test } from '@playwright/test';
import {
	attemptStarts,
	futureLessons,
	previewStartReset,
	songViewSwitch
} from '../e2e/m71-helpers';

const at = (p: string) => p;

test('demo: a previewed lesson stays out of the plan; Start lesson, then reset', async ({
	page
}) => {
	await previewStartReset(page, at, futureLessons().browse);
});

test('demo: an attempt in a previewed lesson starts it', async ({ page }) => {
	await attemptStarts(page, at, futureLessons().practise);
});

test('demo: song view switch hides the lyrics and is remembered', async ({ page }) => {
	await songViewSwitch(page, at);
});
