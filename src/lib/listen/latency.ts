// Latency calibration: the delay between the app's clock and the sound the mic hears of you
// playing along (output latency + input latency + your own bias). Measured by tapping or plucking
// along with clicks, or by letting the mic hear the speaker (loopback). Stored per device.
import { median } from '../tuner/pitch';

export const CAL_BPM = 80;
export const CAL_CLICKS = 8;
/** Fewer usable taps than this: the run was too inconsistent to trust. */
export const MIN_KEPT = 4;
/** Kept offsets spread wider than this (ms, median absolute deviation): not a usable run. */
export const MAX_SPREAD = 60;

export type OffsetEstimate = {
	/** Robust offset (ms): positive = heard after the click. */
	ms: number;
	/** Spread of the kept offsets (median absolute deviation, ms). */
	spread: number;
	kept: number;
	used: number[];
	rejected: number[];
};

/**
 * Pairs each event with the nearest click and returns the signed offsets (ms). Events further
 * than half a beat from every click are dropped.
 */
export function offsetsToClicks(events: readonly number[], clicks: readonly number[]): number[] {
	if (clicks.length < 1) return [];
	const half = clicks.length > 1 ? (clicks[1] - clicks[0]) / 2 : Infinity;
	const out: number[] = [];
	for (const e of events) {
		let best = Infinity;
		for (const c of clicks) if (Math.abs(e - c) < Math.abs(best)) best = e - c;
		if (Math.abs(best) < half) out.push(best);
	}
	return out;
}

/** Median offset after rejecting outliers (beyond 3 scaled MADs, at least 25 ms from the median). */
export function robustOffset(offsets: readonly number[]): OffsetEstimate | null {
	if (offsets.length < MIN_KEPT) return null;
	const m = median(offsets);
	const mad = median(offsets.map((o) => Math.abs(o - m)));
	const limit = Math.max(25, 3 * 1.4826 * mad);
	const used = offsets.filter((o) => Math.abs(o - m) <= limit);
	const rejected = offsets.filter((o) => Math.abs(o - m) > limit);
	if (used.length < MIN_KEPT) return null;
	const ms = median(used);
	const spread = median(used.map((o) => Math.abs(o - ms)));
	if (spread > MAX_SPREAD) return null;
	return {
		ms: Math.round(ms),
		spread: Math.round(spread),
		kept: used.length,
		used,
		rejected
	};
}

// ---- storage (per device and output) ----------------------------------------------------------

export type StoredLatency = { ms: number; spread: number; mode: CalMode; at: string };
export type CalMode = 'tap' | 'pluck' | 'loopback';

/** FNV-1a, as a short base-36 string. */
export function hashString(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}

export const latencyKey = (userAgent: string, outputLabel = '') =>
	`listen.latency.${hashString(`${userAgent}|${outputLabel}`)}`;

/** The default audio output's name (headphones vs speaker matter), once the mic was allowed. */
export async function outputLabel(): Promise<string> {
	try {
		const devices = await navigator.mediaDevices?.enumerateDevices?.();
		const outs = (devices ?? []).filter((d) => d.kind === 'audiooutput');
		return (outs.find((d) => d.deviceId === 'default') ?? outs[0])?.label ?? '';
	} catch {
		return '';
	}
}

function storage(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export async function loadLatency(): Promise<StoredLatency | null> {
	const s = storage();
	if (!s) return null;
	const ua = navigator.userAgent;
	// The output-specific value first, then this device's last one (labels need mic permission).
	for (const key of [latencyKey(ua, await outputLabel()), latencyKey(ua)]) {
		try {
			const v = JSON.parse(s.getItem(key) ?? 'null') as StoredLatency | null;
			if (v && Number.isFinite(v.ms)) return v;
		} catch {
			// unreadable: ignore
		}
	}
	return null;
}

export async function saveLatency(v: StoredLatency) {
	const s = storage();
	if (!s) return;
	const ua = navigator.userAgent;
	const label = await outputLabel();
	try {
		s.setItem(latencyKey(ua, label), JSON.stringify(v));
		if (label) s.setItem(latencyKey(ua), JSON.stringify(v));
	} catch {
		// private mode: the value lasts this visit only
	}
}
