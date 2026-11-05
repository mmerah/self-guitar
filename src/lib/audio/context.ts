// One AudioContext shared by the tools (tuner, metronome, chord sounds). Browsers (iOS above all)
// only let audio start from a user gesture, so call `getAudioContext()` inside a tap handler.
// The tab player's alphaTab synth keeps its own context.
//
// The iOS audio session is set by the mic owner (src/lib/tuner/mic.ts): 'playback' normally,
// 'play-and-record' while something holds the mic. Switching it can change the hardware sample
// rate under a running context, which then plays distorted (a known iOS bug): when the mic's rate
// differs from the context's, the context is rebuilt; take getAudioContext() again after
// acquireMic() resolves.
import { applyAudioSession, onMicRate } from '$lib/tuner/mic';

let ctx: AudioContext | null = null;
/** Contexts already checked against the mic's rate (rebuilt at most once each). */
const checked = new WeakSet<AudioContext>();

onMicRate((rate) => {
	if (!ctx || ctx.state === 'closed' || checked.has(ctx)) return;
	checked.add(ctx);
	// Only where the session exists (iOS Safari): elsewhere the browser resamples the mic fine.
	if (ctx.sampleRate === rate || !('audioSession' in navigator)) return;
	const old = ctx;
	ctx = null;
	old.close().catch(() => {});
});

/**
 * The shared context, resumed. The argument is ignored (kept for older callers): the session
 * follows the mic owners, so playback never switches it away from recording.
 */
export function getAudioContext(_session?: 'playback' | 'play-and-record'): AudioContext {
	applyAudioSession();
	if (!ctx || ctx.state === 'closed') {
		ctx = new AudioContext({ latencyHint: 'interactive' });
	}
	// Resumes a suspended (or iOS "interrupted") context; harmless when already running.
	if (ctx.state !== 'running') ctx.resume().catch(() => {});
	return ctx;
}

/** The context if one exists (no gesture needed, nothing created). */
export function currentAudioContext(): AudioContext | null {
	return ctx && ctx.state !== 'closed' ? ctx : null;
}
