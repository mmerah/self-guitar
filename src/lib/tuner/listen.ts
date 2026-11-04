// A minimal pitch listener on the tuner's pieces (mic, pitchy, PitchTracker), for drills that
// only need "which note is sounding": the ear trainer's play-back mode. The tuner keeps its own
// loop (gauge, string lock, silence checks).
import { PitchDetector } from 'pitchy';
import { getAudioContext } from '$lib/audio/context';
import { freqToNote, type NoteReading } from '$lib/music/notes';
import { classifyMicError, micPrecheck, openMic, stopStream, type MicProblem } from './mic';
import { PitchTracker, rmsOf } from './pitch';

const WINDOW = 4096;

export class PitchListener {
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private analyser: AnalyserNode | null = null;
	private raf = 0;
	private token = 0;
	private tracker = new PitchTracker();
	private detector = PitchDetector.forFloat32Array(WINDOW);
	private buf = new Float32Array(WINDOW);

	constructor(private onnote: (note: NoteReading | null) => void) {
		this.detector.minVolumeDecibels = -50;
	}

	/** Opens the mic (call from a tap); resolves with a problem to explain, or null when listening. */
	async start(): Promise<MicProblem | null> {
		const pre = micPrecheck();
		if (pre) return pre;
		const token = ++this.token;
		const ctx = getAudioContext('play-and-record');
		let mic: MediaStream;
		try {
			mic = await openMic();
		} catch (e) {
			return classifyMicError(e);
		}
		if (token !== this.token) {
			stopStream(mic);
			return null;
		}
		this.stream = mic;
		this.source = ctx.createMediaStreamSource(mic);
		this.analyser = ctx.createAnalyser();
		this.analyser.fftSize = WINDOW;
		this.source.connect(this.analyser);
		await ctx.resume().catch(() => {});
		this.tracker.reset();
		const frame = () => {
			if (!this.analyser || token !== this.token) return;
			this.analyser.getFloatTimeDomainData(this.buf);
			const [f, clarity] = this.detector.findPitch(this.buf, ctx.sampleRate);
			const freq = this.tracker.push(f, clarity, { rms: rmsOf(this.buf) });
			this.onnote(freq === null ? null : freqToNote(freq));
			this.raf = requestAnimationFrame(frame);
		};
		this.raf = requestAnimationFrame(frame);
		return null;
	}

	stop() {
		this.token++;
		cancelAnimationFrame(this.raf);
		this.source?.disconnect();
		stopStream(this.stream);
		this.source = this.analyser = this.stream = null;
	}
}
