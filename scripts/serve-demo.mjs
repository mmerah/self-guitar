// Serves the static demo build the way GitHub Pages does: under the repository's sub-path, with
// `/page` resolving to `page.html` (or `page/index.html`) and 404.html (status 404) for anything
// else. Usage: node scripts/serve-demo.mjs   (PORT=4321 BASE_PATH=/self-guitar DIR=build-demo)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 4321);
const BASE = (process.env.BASE_PATH ?? '/self-guitar').replace(/\/$/, '');
const DIR = path.resolve(process.env.DIR ?? 'build-demo');

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.otf': 'font/otf',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8'
};

function file(p) {
	try {
		return fs.statSync(p).isFile() ? p : null;
	} catch {
		return null;
	}
}

/** The file for a path under the base, as Pages resolves it. */
function resolve(rel) {
	const p = path.join(DIR, rel);
	if (!p.startsWith(DIR)) return null;
	return file(p) ?? file(`${p}.html`) ?? file(path.join(p, 'index.html'));
}

const server = http.createServer((req, res) => {
	const url = new URL(req.url ?? '/', 'http://localhost');
	const pathname = decodeURIComponent(url.pathname);
	if (pathname === BASE) {
		res.writeHead(301, { location: `${BASE}/` }).end();
		return;
	}
	const inBase = pathname.startsWith(`${BASE}/`);
	const found = inBase ? resolve(pathname.slice(BASE.length)) : null;
	const target = found ?? path.join(DIR, '404.html');
	const status = found ? 200 : 404;
	if (!found) console.log(`404 ${req.method} ${pathname}`);
	const type = TYPES[path.extname(target)] ?? 'application/octet-stream';
	res.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache' });
	if (req.method === 'HEAD') res.end();
	else fs.createReadStream(target).pipe(res);
});

server.listen(PORT, () => console.log(`Demo: http://localhost:${PORT}${BASE}/ (from ${DIR})`));
