// The build's identity (package.json version, short commit sha, build date), injected at build
// time by vite.config.ts and shown on About, the Tools hub and the demo's options.

export interface BuildInfo {
	version: string;
	sha: string;
	date: string;
}

/**
 * The short sha for a raw value: a hex commit sha is cut to 7 characters; any other non-empty
 * value (BUILD_SHA=local in Docker) is kept as is (trimmed, at most 12 safe characters); empty or
 * missing is null.
 */
export function shortSha(raw: string | null | undefined): string | null {
	const s = (raw ?? '').trim();
	if (!s) return null;
	if (/^[0-9a-f]{7,40}$/i.test(s)) return s.slice(0, 7).toLowerCase();
	const safe = s.replace(/[^\w.-]/g, '').slice(0, 12);
	return safe || null;
}

/** BUILD_SHA from the environment if set, else the git commit, else "dev". */
export function resolveBuildSha(env: string | undefined, git: () => string | null): string {
	return shortSha(env) ?? shortSha(safely(git)) ?? 'dev';
}

function safely(f: () => string | null): string | null {
	try {
		return f();
	} catch {
		return null;
	}
}

/** "2026-11-04" (UTC). */
export const buildDate = (d: Date) => d.toISOString().slice(0, 10);

/** "Self-Guitar v0.6.0 · 12e4f7a · 2026-11-04" (empty parts left out). */
export function formatVersion(b: BuildInfo): string {
	return [`Self-Guitar v${b.version.replace(/^v/, '')}`, b.sha, b.date]
		.filter((p) => p.trim())
		.join(' · ');
}

/** This build's identity. */
export const BUILD: BuildInfo = {
	version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
	sha: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev',
	date: typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : ''
};
export const VERSION_TEXT = formatVersion(BUILD);
