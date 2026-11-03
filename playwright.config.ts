import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Run against the production build (`npm run build` first) with a fresh database each run.
const PORT = 4173;
const dataDir = `test-results/data-${Date.now()}`;
// Use the sandbox's preinstalled Chromium when Playwright's own download is absent.
const localChromium = '/opt/pw-browsers/chromium';
const launchOptions =
	!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localChromium)
		? { executablePath: localChromium }
		: {};

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, launchOptions, serviceWorkers: 'block' },
	webServer: {
		command: `node build`,
		env: { PORT: String(PORT), DATA_DIR: dataDir },
		url: `http://localhost:${PORT}/api/health`,
		reuseExistingServer: false
	},
	projects: [
		{
			name: 'phone',
			use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' }
		},
		{ name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } }
	]
});
