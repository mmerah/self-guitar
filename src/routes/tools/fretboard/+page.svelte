<script lang="ts">
	// The fretboard explorer: scales and their boxes, arpeggios, CAGED shapes, triads on string
	// sets, the notes, and the timed "find the note" quiz. The URL holds the view (the same keys
	// as the ::fretboard directive), so lessons can link straight to one.
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import FingerLegend from '$lib/chords/FingerLegend.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { claimPlayback, releasePlayback } from '$lib/audio/exclusive';
	import { pluck } from '$lib/audio/pluck';
	import { midiToFreq } from '$lib/music/notes';
	import Fretboard from '$lib/fretboard/Fretboard.svelte';
	import FretboardQuiz from '$lib/fretboard/FretboardQuiz.svelte';
	import { QUIZ_CHOICES, isQuiz } from '$lib/fretboard/quiz';
	import {
		CAGED_SHAPES,
		FRETS,
		STRING_SETS,
		TRIAD_TYPES,
		boxCount,
		fretboardParams,
		overlay,
		parseFretboard,
		pretty,
		ROOT_NAMES,
		CHORD_TYPES,
		CHORD_TYPE_IDS,
		NATURALS,
		SCALES,
		SCALE_IDS,
		setStrings,
		type FretboardMode,
		type FretboardSpec,
		type LabelMode
	} from '$lib/theory';

	type Tab = FretboardMode | 'quiz';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'scale', label: 'Scales' },
		{ id: 'chord', label: 'Arpeggios' },
		{ id: 'caged', label: 'CAGED' },
		{ id: 'triads', label: 'Triads' },
		{ id: 'notes', label: 'Notes' },
		{ id: 'quiz', label: 'Quiz' }
	];
	const DEFAULTS: Record<FretboardMode, FretboardSpec> = {
		scale: { mode: 'scale', root: 'A', scale: 'minor-pentatonic', box: 1, labels: 'intervals' },
		chord: { mode: 'chord', root: 'C', chord: 'major', labels: 'intervals' },
		caged: { mode: 'caged', root: 'C', shape: 'all', labels: 'intervals' },
		triads: { mode: 'triads', root: 'C', chord: 'major', strings: [1, 2, 3], labels: 'intervals' },
		note: { mode: 'note', note: 'C', labels: 'notes' },
		notes: { mode: 'notes', notes: 'naturals', labels: 'notes' }
	};
	const LABELS: { id: LabelMode; label: string }[] = [
		{ id: 'intervals', label: 'R 3 5' },
		{ id: 'notes', label: 'Notes' },
		{ id: 'fingers', label: 'Fingers' }
	];
	const BPM_KEY = 'fretboard:bpm';

	let tab = $state<Tab>('scale');
	let spec = $state<FretboardSpec>(DEFAULTS.scale);
	let quiz = $state<string>('string-6');
	let hidden = $state(false);
	let bpm = $state(80);

	onMount(() => {
		const q = Object.fromEntries(page.url.searchParams);
		delete q.from;
		try {
			const b = Number(localStorage.getItem(BPM_KEY));
			if (b >= 40 && b <= 200) bpm = b;
		} catch {
			// no storage
		}
		if (q.quiz && isQuiz(q.quiz)) {
			quiz = q.quiz;
			tab = 'quiz';
			return;
		}
		const parsed = Object.keys(q).length ? parseFretboard(q, []) : null;
		if (parsed) {
			spec = parsed;
			tab = parsed.mode === 'note' ? 'notes' : parsed.mode;
		}
	});

	// The view in the URL (shareable, and the back button of a lesson link keeps it).
	$effect(() => {
		const from = page.url.searchParams.get('from');
		const params = new URLSearchParams({
			...(tab === 'quiz' ? { quiz } : fretboardParams(spec)),
			...(from && { from })
		});
		const next = `${page.url.pathname}?${params}`;
		if (next !== page.url.pathname + page.url.search) {
			try {
				replaceState(next, {});
			} catch {
				// before the router is ready
			}
		}
	});

	const view = $derived(overlay(spec));
	/** Show every fret instead of the cropped view (a box ± a fret, 0–12 for the whole neck). */
	let fullNeck = $state(false);
	const fullWindow = $derived<[number, number]>([0, Math.max(FRETS, view.window[1])]);
	const cropped = $derived(view.window[0] > 0 || view.window[1] < fullWindow[1]);
	const win = $derived<[number, number]>(fullNeck ? fullWindow : view.window);
	const hasFingers = $derived(view.dots.some((d) => d.finger));
	const labels = $derived(spec.labels === 'fingers' && !hasFingers ? 'intervals' : spec.labels);

	function setTab(t: Tab) {
		stopPlay();
		tab = t;
		if (t !== 'quiz') spec = { ...DEFAULTS[t], root: spec.root ?? DEFAULTS[t].root };
		if (t === 'notes' || t === 'note') spec = DEFAULTS.notes;
	}
	const set = (patch: Partial<FretboardSpec>) => {
		stopPlay();
		spec = { ...spec, ...patch };
	};

	// ---- play the scale up and down ----
	let active = $state<string | null>(null);
	let playing = $state(false);
	let timers: ReturnType<typeof setTimeout>[] = [];
	let stops: (() => void)[] = [];

	function stopPlay() {
		for (const t of timers) clearTimeout(t);
		for (const s of stops) s();
		timers = [];
		stops = [];
		active = null;
		playing = false;
		releasePlayback(stopPlay);
	}

	/** The visible notes low to high (one per pitch); a whole neck plays two octaves from the root. */
	function playOrder() {
		const seen = view.dots.filter((d) => d.fret >= win[0] && d.fret <= win[1]);
		let notes = seen
			.filter((d, i) => seen.findIndex((x) => x.midi === d.midi) === i)
			.sort((a, b) => a.midi - b.midi);
		if (notes.length > 16) {
			const root = notes.find((d) => d.root) ?? notes[0];
			notes = notes.filter((d) => d.midi >= root.midi && d.midi <= root.midi + 24);
		}
		return [...notes, ...notes.slice(0, -1).reverse()];
	}

	function play() {
		if (playing) return stopPlay();
		const ctx = getAudioContext();
		claimPlayback(stopPlay);
		const order = playOrder();
		const beat = 60 / bpm;
		const t0 = ctx.currentTime + 0.05;
		playing = true;
		order.forEach((d, i) => {
			stops.push(pluck(ctx, midiToFreq(d.midi), { when: t0 + i * beat, gain: 0.55, seconds: 1.6 }));
			timers.push(setTimeout(() => (active = `${d.string}:${d.fret}`), (0.05 + i * beat) * 1000));
		});
		timers.push(setTimeout(stopPlay, (0.05 + order.length * beat) * 1000 + 300));
	}

	function setBpm(v: number) {
		bpm = Math.max(40, Math.min(200, v));
		try {
			localStorage.setItem(BPM_KEY, String(bpm));
		} catch {
			// no storage
		}
	}

	onDestroy(stopPlay);

	const rootSelect = $derived(spec.root ?? 'C');
	const boxes = $derived(spec.scale ? boxCount(spec.scale) : 0);
	const noteChoice = $derived(
		spec.mode === 'note' ? spec.note! : spec.notes === 'all' ? 'all' : 'naturals'
	);
	const quizNote = $derived(quiz.startsWith('note-') ? quiz.slice(5) : '');
</script>

<svelte:head><title>Fretboard · Self-Guitar</title></svelte:head>

{#snippet playControls()}
	{#if spec.mode !== 'notes' && spec.mode !== 'note'}
		<div class="flex shrink-0 items-center rounded-xl bg-surface-2">
			<button class="btn bg-transparent! px-2" aria-label="Slower" onclick={() => setBpm(bpm - 4)}
				><Icon name="minus" size={18} /></button
			>
			<span class="w-9 text-center text-sm tabular-nums" data-testid="fb-bpm">{bpm}</span>
			<button class="btn bg-transparent! px-2" aria-label="Faster" onclick={() => setBpm(bpm + 4)}
				><Icon name="plus" size={18} /></button
			>
		</div>
		<button
			class="btn btn-primary min-h-10 shrink-0"
			onclick={play}
			aria-pressed={playing}
			data-testid="fb-play"
			><Icon name={playing ? 'stop' : 'play'} size={20} /><span class="hidden sm:inline"
				>{playing ? 'Stop' : 'Play'}</span
			></button
		>
	{/if}
{/snippet}

{#snippet chip(label: string, on: boolean, onclick: () => void, testid?: string)}
	<button
		class="btn min-h-9 shrink-0 rounded-full px-3"
		aria-pressed={on}
		{onclick}
		data-testid={testid}>{label}</button
	>
{/snippet}

<main class="mx-auto w-full max-w-6xl px-3 py-2 md:px-8 md:py-6 short:py-1">
	<div class="short:hidden"><ToolHeader title="Fretboard" /></div>

	<!-- Landscape phones: one scrolling strip of controls over a full-width neck (the quiz's two
	     short rows wrap, so its note picker is never cut off). -->
	<div
		class="mb-1.5 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center short:flex-row {tab ===
		'quiz'
			? 'short:flex-wrap'
			: 'short:-mx-3 short:flex-nowrap short:overflow-x-auto short:px-3 short:[&>*]:shrink-0'}"
		data-testid="fretboard-controls"
	>
		<div
			class="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 sm:mx-0 sm:px-0 sm:pb-0"
			role="group"
			aria-label="Mode"
		>
			{#each TABS as t (t.id)}
				<button
					class="btn min-h-10 shrink-0 rounded-full px-3.5"
					aria-pressed={tab === t.id || (t.id === 'notes' && tab === 'note')}
					onclick={() => setTab(t.id)}
					data-testid="fb-tab-{t.id}">{t.label}</button
				>
			{/each}
		</div>

		{#if tab === 'quiz'}
			<div class="flex flex-wrap items-center gap-1.5" data-testid="quiz-choices">
				{#each QUIZ_CHOICES as id (id)}
					{@render chip(
						id === 'all'
							? 'All strings'
							: id === 'strings-6-5'
								? 'Strings 6+5'
								: `String ${id.slice(7)}`,
						quiz === id,
						() => (quiz = id),
						`quiz-${id}`
					)}
				{/each}
				<label class="flex shrink-0 items-center gap-1 text-sm text-muted">
					Find all
					<select
						class="field min-h-9 py-0"
						value={quizNote}
						onchange={(e) => {
							const v = e.currentTarget.value;
							quiz = v ? `note-${v}` : 'string-6';
						}}
						data-testid="quiz-note-select"
					>
						<option value="">…</option>
						{#each NATURALS as n (n)}<option value={n}>{n}s</option>{/each}
					</select>
				</label>
			</div>
		{:else}
			<div class="flex flex-wrap items-center gap-1.5 short:flex-nowrap">
				{#if spec.mode !== 'notes' && spec.mode !== 'note'}
					<select
						class="field min-h-10 py-0 font-semibold"
						aria-label="Root"
						value={rootSelect}
						onchange={(e) => set({ root: e.currentTarget.value })}
						data-testid="fb-root"
					>
						{#each ROOT_NAMES as r (r)}<option value={r}>{pretty(r)}</option>{/each}
					</select>
				{/if}
				{#if spec.mode === 'scale'}
					<select
						class="field min-h-10 py-0"
						aria-label="Scale"
						value={spec.scale}
						onchange={(e) => {
							const id = e.currentTarget.value as keyof typeof SCALES;
							set({
								scale: id,
								box: spec.box && spec.box <= boxCount(id) ? spec.box : undefined,
								modes: undefined,
								highlight: undefined
							});
						}}
						data-testid="fb-scale"
					>
						{#each SCALE_IDS as id (id)}<option value={id}>{SCALES[id].name}</option>{/each}
					</select>
					<div class="flex gap-1" role="group" aria-label="Box" data-testid="fb-boxes">
						{@render chip('All', !spec.box, () => set({ box: undefined }), 'fb-box-all')}
						{#each Array.from({ length: boxes }, (_, i) => i + 1) as b (b)}
							{@render chip(String(b), spec.box === b, () => set({ box: b }), `fb-box-${b}`)}
						{/each}
					</div>
				{:else if spec.mode === 'chord'}
					<select
						class="field min-h-10 py-0"
						aria-label="Chord type"
						value={spec.chord}
						onchange={(e) => set({ chord: e.currentTarget.value as keyof typeof CHORD_TYPES })}
						data-testid="fb-chord"
					>
						{#each CHORD_TYPE_IDS as id (id)}<option value={id}>{CHORD_TYPES[id].name}</option
							>{/each}
					</select>
				{:else if spec.mode === 'caged'}
					<div class="flex gap-1" role="group" aria-label="Shape">
						{@render chip('All', spec.shape === 'all', () => set({ shape: 'all' }), 'fb-shape-all')}
						{#each CAGED_SHAPES as s (s)}
							{@render chip(s, spec.shape === s, () => set({ shape: s }), `fb-shape-${s}`)}
						{/each}
					</div>
				{:else if spec.mode === 'triads'}
					<select
						class="field min-h-10 py-0"
						aria-label="Triad type"
						value={spec.chord}
						onchange={(e) => set({ chord: e.currentTarget.value as (typeof TRIAD_TYPES)[number] })}
						data-testid="fb-triad"
					>
						{#each TRIAD_TYPES as id (id)}<option value={id}>{CHORD_TYPES[id].name}</option>{/each}
					</select>
					<div class="flex gap-1" role="group" aria-label="Strings">
						{#each STRING_SETS as s (s)}
							{@render chip(
								s,
								spec.strings?.join(',') === [...setStrings(s)].sort().join(','),
								() => set({ strings: [...setStrings(s)].sort() }),
								`fb-set-${s}`
							)}
						{/each}
					</div>
				{:else}
					<select
						class="field min-h-10 py-0"
						aria-label="Notes"
						value={noteChoice}
						onchange={(e) => {
							const v = e.currentTarget.value;
							spec =
								v === 'naturals' || v === 'all'
									? { mode: 'notes', notes: v, labels: 'notes' }
									: { mode: 'note', note: v, labels: 'notes' };
						}}
						data-testid="fb-notes"
					>
						<option value="naturals">Natural notes</option>
						<option value="all">All 12 notes</option>
						{#each ROOT_NAMES as n (n)}<option value={n}>Every {pretty(n)}</option>{/each}
					</select>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-1.5 short:flex-nowrap">
				<div
					class="segmented min-w-0 flex-1 sm:w-64 sm:flex-none short:w-56 [&>button]:whitespace-nowrap"
					role="group"
					aria-label="Labels"
				>
					{#each LABELS as l (l.id)}
						<button
							aria-pressed={labels === l.id}
							disabled={l.id === 'fingers' && !hasFingers}
							onclick={() => set({ labels: l.id })}
							data-testid="fb-labels-{l.id}">{l.label}</button
						>
					{/each}
				</div>
				<button
					class="btn btn-toggle px-2.5"
					aria-pressed={hidden}
					aria-label={hidden ? 'Show names' : 'Hide names (quiz yourself)'}
					title={hidden ? 'Show names' : 'Hide names: tap a dot to check'}
					onclick={() => (hidden = !hidden)}
					data-testid="fb-hide"><Icon name={hidden ? 'eyeoff' : 'eye'} size={20} /></button
				>
			</div>
		{/if}
	</div>

	{#if tab === 'quiz'}
		{#key quiz}
			<FretboardQuiz {quiz} />
		{/key}
	{:else}
		<!-- Always in view: what is shown, the full-neck switch, tempo and Play. -->
		<div
			class="sticky top-0 z-10 -mx-3 mb-1 flex items-center gap-1.5 bg-bg/95 px-3 py-1 backdrop-blur md:mx-0 md:px-0"
			data-testid="fb-bar"
		>
			<h2
				class="min-w-0 flex-1 text-sm leading-tight font-semibold sm:text-base"
				data-testid="fb-title"
			>
				{view.title}
			</h2>
			{#if cropped}
				<button
					class="btn btn-toggle min-h-10 shrink-0 px-2.5 text-sm"
					aria-pressed={fullNeck}
					onclick={() => (fullNeck = !fullNeck)}
					data-testid="fb-full"
					title={fullNeck ? 'Show only these frets' : 'Show the full neck'}
					><Icon name={fullNeck ? 'zoomin' : 'zoomout'} size={18} /><span
						class="hidden min-[420px]:inline">{fullNeck ? 'Zoom' : 'Full neck'}</span
					></button
				>
			{/if}
			{@render playControls()}
		</div>
		<Fretboard
			dots={view.dots}
			regions={view.regions}
			window={win}
			bounds={fullWindow}
			fill
			maxHeight="max(15rem, calc(100dvh - 15rem))"
			{labels}
			{hidden}
			{active}
			label={view.title}
		/>
		<div class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
			{#if labels === 'fingers'}<FingerLegend />{:else}
				<p class="text-xs text-muted">
					<span class="mr-1 inline-block size-2.5 rounded-sm bg-accent align-middle"
					></span>Root{#if view.dots.some((d) => d.accent)}
						· <span class="mr-1 inline-block size-2.5 rounded-full bg-[var(--degree)] align-middle"
						></span>colour note{/if} · tap a dot to hear it{hidden ? ' and see its name' : ''}
				</p>
			{/if}
		</div>
	{/if}
</main>
