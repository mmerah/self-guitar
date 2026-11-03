import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The static demo (`npm run build:demo` first), served like GitHub Pages under /self-guitar/.
const PORT = 4322;
export const DEMO_URL = `http://localhost:${PORT}/self-guitar/`;
const localChromium = '/opt/pw-browsers/chromium';
const launchOptions =
	!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(localChromium)
		? { executablePath: localChromium }
		: {};

export default defineConfig({
	testDir: 'tests/e2e-demo',
	timeout: 60_000,
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	// A trailing slash: tests navigate with relative paths ('learn', './') under the base path.
	use: { baseURL: DEMO_URL, launchOptions, serviceWorkers: 'block' },
	webServer: {
		command: 'node scripts/serve-demo.mjs',
		env: { PORT: String(PORT) },
		url: DEMO_URL,
		reuseExistingServer: false
	},
	projects: [
		{
			name: 'demo',
			use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, browserName: 'chromium' }
		}
	]
});
