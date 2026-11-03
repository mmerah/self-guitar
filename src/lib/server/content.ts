// The self-hosted server reads the compiled content from disk (not bundled), so content can
// change without rebuilding the server code.
import fs from 'node:fs';
import path from 'node:path';
import { setContent, type Content } from '$lib/core/content';

const CONTENT_FILE = process.env.CONTENT_FILE ?? path.resolve('generated/content.json');

setContent(() => JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')) as Content);

export { getLearnIndex, getSong, listSongs, loadContent } from '$lib/core/content';
