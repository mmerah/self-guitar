// Tab zoom: alphaTab's display scale per player kind, with phone/tablet defaults, a step range for
// the −/+ buttons and pinch, and a per-device memory (localStorage) for each kind.

export type ScaleKind = 'full' | 'compact' | 'ladder';

export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.6;
export const SCALE_STEP = 0.1;
export const SCALE_KEYS: Record<ScaleKind, string> = {
	full: 'player.scale.full',
	compact: 'player.scale.compact',
	ladder: 'player.scale.ladder'
};

/**
 * Phone (short side < 600px): small but legible; tablets and desktops a bit larger. The tempo
 * ladder's few bars fill a big screen at the largest size.
 */
export function defaultScale(kind: ScaleKind, small: boolean): number {
	if (kind === 'compact') return small ? 0.9 : 1.0;
	if (kind === 'ladder') return small ? 1.0 : SCALE_MAX;
	return small ? 1.0 : 1.2;
}

/** Rounds to the 0.1 grid and keeps the scale within range. */
export function clampScale(v: number): number {
	if (!Number.isFinite(v)) return 1;
	const r = Math.round(v * 10) / 10;
	return Math.min(SCALE_MAX, Math.max(SCALE_MIN, r));
}

export const stepScale = (v: number, dir: 1 | -1) => clampScale(v + dir * SCALE_STEP);

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function storage(): Store | null {
	try {
		return globalThis.localStorage ?? null;
	} catch {
		return null;
	}
}

/** The saved scale for this kind, else the default for the screen. */
export function readScale(kind: ScaleKind, small: boolean, store = storage()): number {
	try {
		const raw = store?.getItem(SCALE_KEYS[kind]);
		const v = raw === null || raw === undefined ? NaN : Number(raw);
		if (raw && Number.isFinite(v)) return clampScale(v);
	} catch {
		// storage unavailable
	}
	return defaultScale(kind, small);
}

export function writeScale(kind: ScaleKind, v: number, store = storage()) {
	try {
		store?.setItem(SCALE_KEYS[kind], String(clampScale(v)));
	} catch {
		// per-device convenience only
	}
}
