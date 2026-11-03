// Metronome page settings, remembered in localStorage (per device).
import {
	clampBpm,
	TIME_SIGNATURES,
	type SpeedTrainer,
	type Subdivision,
	type TimelineSettings
} from './timeline';

export type MetronomeSettings = TimelineSettings & { trainer: SpeedTrainer };

export const DEFAULT_SETTINGS: MetronomeSettings = {
	bpm: 80,
	timeSignature: '4/4',
	subdivision: 1,
	accent: true,
	trainer: { enabled: false, step: 4, everyBars: 4, target: 120 }
};

const KEY = 'metronome:v1';

export function loadSettings(): MetronomeSettings {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
		const s = {
			...DEFAULT_SETTINGS,
			...raw,
			trainer: { ...DEFAULT_SETTINGS.trainer, ...raw.trainer }
		};
		return {
			...s,
			bpm: clampBpm(Number(s.bpm) || DEFAULT_SETTINGS.bpm),
			timeSignature: s.timeSignature in TIME_SIGNATURES ? s.timeSignature : '4/4',
			subdivision: ([1, 2, 3, 4] as Subdivision[]).includes(s.subdivision) ? s.subdivision : 1,
			accent: s.accent !== false
		};
	} catch {
		return structuredClone(DEFAULT_SETTINGS);
	}
}

export function saveSettings(s: MetronomeSettings) {
	try {
		localStorage.setItem(KEY, JSON.stringify(s));
	} catch {
		// storage unavailable: settings last for this visit only
	}
}
