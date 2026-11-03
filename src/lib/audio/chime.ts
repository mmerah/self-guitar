// A soft two-note chime: "time's up, next step" (warm-ups that run hands-free).
import { getAudioContext } from './context';

export function chime() {
	try {
		const ctx = getAudioContext();
		const t0 = ctx.currentTime + 0.01;
		[880, 1318.5].forEach((f, i) => {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			const t = t0 + i * 0.16;
			osc.type = 'sine';
			osc.frequency.value = f;
			gain.gain.setValueAtTime(0, t);
			gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 1);
		});
	} catch {
		// no audio: the step still moves on
	}
}
