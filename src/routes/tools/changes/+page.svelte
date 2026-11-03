<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { playClick } from '$lib/metronome/scheduler';
	import { CHANGE_CHORDS, getChord } from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import ChordDiagram from '$lib/chords/ChordDiagram.svelte';
	import { canonicalPair, MAX_CHANGES, pairKey, type ChangePair } from '$lib/chordChanges';
	import { getOptional } from '$lib/api';
	import { createWakeLock } from '$lib/player/wakeLock';

	const DURATION_S = 60;
	const COUNT_IN = 3;
	const PAIR_KEY = 'changes:pair';
	const TAP_KEY = 'changes:tap';
	/** Changes per minute (JustinGuitar-style goals). */
	const GOAL_SOLID = 30;
	const GOAL_MASTERED = 60;
	/** Space, arrows and PageDown: what Bluetooth page-turner pedals send. */
	const COUNT_KEYS = ['Space', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown'];
	const SUGGESTED: [string, string][] = [
		['A', 'D'],
		['D', 'E'],
		['A', 'E'],
		['C', 'G'],
		['G', 'D'],
		['Am', 'E'],
		['C', 'Am'],
		['Em', 'G'],
		['Dm', 'Am'],
		['C', 'F']
	];
	const options = CHANGE_CHORDS.filter((id) => getChord(id));

	type Phase = 'setup' | 'countin' | 'running' | 'done';

	let a = $state('A');
	let b = $state('D');
	/** Voicing shown for each chord (picked on the setup cards, used in the session). */
	let va = $state(0);
	let vb = $state(0);
	/** Count by tapping (screen or pedal) instead of in your head. */
	let tapMode = $state(false);
	let phase = $state<Phase>('setup');
	let countIn = $state(COUNT_IN);
	let remaining = $state(DURATION_S);
	let count = $state(0);
	let pairs = $state<ChangePair[]>([]);
	let saving = $state(false);
	let saveError = $state('');
	let result = $state<{ count: number; newBest: boolean } | null>(null);

	const chordA = $derived(getChord(a)!);
	const chordB = $derived(getChord(b)!);
	const sessionA = $derived(chordA.voicings[Math.min(va, chordA.voicings.length - 1)]);
	const sessionB = $derived(chordB.voicings[Math.min(vb, chordB.voicings.length - 1)]);
	const current = $derived(pairs.find((p) => pairKey(p.chordA, p.chordB) === pairKey(a, b)));

	let startAt = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let wakeLock: ReturnType<typeof createWakeLock> | null = null;

	onMount(async () => {
		wakeLock = createWakeLock();
		try {
			const saved = JSON.parse(localStorage.getItem(PAIR_KEY) ?? 'null');
			if (
				Array.isArray(saved) &&
				saved.every((id) => options.includes(id)) &&
				saved[0] !== saved[1]
			)
				[a, b] = saved;
		} catch {
			// default pair
		}
		try {
			tapMode = localStorage.getItem(TAP_KEY) === '1';
		} catch {
			// default: count in your head
		}
		pairs = await getOptional<ChangePair[]>(fetch, '/api/chord-changes', []);
	});

	onDestroy(() => {
		clearInterval(timer);
		wakeLock?.destroy();
	});

	function pick(next: [string, string]) {
		[a, b] = next;
		try {
			localStorage.setItem(PAIR_KEY, JSON.stringify(next));
		} catch {
			// not remembered
		}
	}

	function setTapMode(on: boolean) {
		tapMode = on;
		try {
			localStorage.setItem(TAP_KEY, on ? '1' : '0');
		} catch {
			// not remembered
		}
	}

	const goalText = (best: number) =>
		best >= GOAL_MASTERED
			? 'Mastered!'
			: best >= GOAL_SOLID
				? `Solid · next goal ${GOAL_MASTERED}`
				: `Goal ${GOAL_SOLID} = solid · ${GOAL_MASTERED} = mastered`;

	function beep(level: 'accent' | 'beat') {
		const ctx = getAudioContext();
		playClick(ctx, ctx.currentTime + 0.01, level);
	}

	function start() {
		getAudioContext(); // unlock audio inside the tap
		count = 0;
		result = null;
		saveError = '';
		countIn = COUNT_IN;
		phase = 'countin';
		startAt = performance.now();
		beep('beat');
		wakeLock?.set(true);
		clearInterval(timer);
		timer = setInterval(tick, 50);
	}

	function tick() {
		const elapsed = (performance.now() - startAt) / 1000;
		if (phase === 'countin') {
			const left = COUNT_IN - Math.floor(elapsed);
			if (left <= 0) {
				phase = 'running';
				startAt += COUNT_IN * 1000;
				remaining = DURATION_S;
				beep('accent');
			} else if (left !== countIn) {
				countIn = left;
				beep('beat');
			}
		} else if (phase === 'running') {
			remaining = Math.max(0, DURATION_S - elapsed);
			if (remaining <= 0) finish();
		}
	}

	function finish() {
		clearInterval(timer);
		phase = 'done';
		wakeLock?.set(false);
		beep('accent');
		navigator.vibrate?.([80, 60, 80]);
	}

	function cancel() {
		clearInterval(timer);
		wakeLock?.set(false);
		phase = 'setup';
	}

	function hit(e?: Event) {
		e?.preventDefault();
		if (phase === 'running') count = Math.min(MAX_CHANGES, count + 1);
	}

	async function save() {
		saving = true;
		saveError = '';
		const best = current?.best ?? 0;
		try {
			const res = await fetch('/api/chord-changes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ chordA: a, chordB: b, count })
			});
			if (!res.ok) throw new Error(String(res.status));
			const pair: ChangePair = await res.json();
			pairs = [pair, ...pairs.filter((p) => pairKey(p.chordA, p.chordB) !== pairKey(a, b))];
			result = { count, newBest: count > best && best > 0 };
			phase = 'setup';
		} catch {
			saveError = navigator.onLine
				? 'Could not save. Try again.'
				: 'You are offline: the result could not be saved.';
		} finally {
			saving = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (phase === 'running' && tapMode && COUNT_KEYS.includes(e.code)) hit(e);
		if (e.code === 'Escape' && (phase === 'running' || phase === 'countin')) cancel();
	}
</script>

<svelte:head><title>1-minute changes · Self-Guitar</title></svelte:head>
<svelte:window onkeydown={onKey} />

<main class="mx-auto flex w-full max-w-3xl flex-1 flex-col p-4 md:p-8">
	<ToolHeader title="1-minute changes" />

	<p class="mb-3 text-sm text-muted">
		Strum one chord, switch, strum the other: how many clean changes can you make in a minute? Count
		them in your head and type the total at the end. Do it daily; {GOAL_SOLID} a minute is solid, {GOAL_MASTERED}
		is mastered.
	</p>

	<div class="mb-3 flex items-center gap-2">
		{@render picker('First chord', a, (v) => pick([v, v === b ? a : b]))}
		<button class="btn shrink-0" aria-label="Swap chords" onclick={() => pick([b, a])}>⇄</button>
		{@render picker('Second chord', b, (v) => pick([v === a ? b : a, v]))}
	</div>

	<div class="grid grid-cols-2 gap-3" data-testid="pair-diagrams">
		<ChordCard chord={chordA} big bind:index={va} />
		<ChordCard chord={chordB} big bind:index={vb} />
	</div>

	<div
		class="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
		aria-label="Suggested pairs"
	>
		{#each SUGGESTED as pair (pair.join())}
			<button
				class="btn shrink-0"
				aria-pressed={pairKey(...pair) === pairKey(a, b)}
				onclick={() => pick(pair)}>{pair[0]} – {pair[1]}</button
			>
		{/each}
	</div>

	{#if result}
		<div
			class="card mt-3 flex items-center gap-3 border-ok!"
			role="status"
			data-testid="saved-result"
		>
			<span class="rounded-full bg-ok p-2 text-ok-fg"><Icon name="check" /></span>
			<span>
				<span class="block font-semibold">
					Saved: {result.count} changes{result.newBest ? ' · new personal best!' : ''}
				</span>
				<span class="text-sm text-muted">{canonicalPair(a, b).join(' – ')}</span>
			</span>
		</div>
	{/if}

	<div
		class="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3"
		data-testid="pair-best"
	>
		<span>
			<span class="block text-sm text-muted">Personal best · {canonicalPair(a, b).join(' – ')}</span
			>
			{#if current}
				<span class="text-2xl font-bold tabular-nums">{current.best}</span>
				<span class="text-sm text-muted"
					>/ min · {current.tries}
					{current.tries === 1 ? 'try' : 'tries'}</span
				>
				<span class="block text-sm {current.best >= GOAL_SOLID ? 'text-ok' : 'text-muted'}"
					>{goalText(current.best)}</span
				>
			{:else}
				<span class="block font-semibold">No result yet</span>
				<span class="block text-sm text-muted">{goalText(0)}</span>
			{/if}
		</span>
		{#if current && current.history.length > 1}
			<Sparkline
				values={current.history.map((h) => h.count)}
				width={120}
				height={36}
				label="Recent results"
			/>
		{/if}
	</div>

	<label class="mt-3 flex min-h-11 items-center justify-between gap-3">
		<span>
			<span class="block font-medium">Count by tapping</span>
			<span class="text-sm text-muted">Tap the screen, or press a pedal, per change</span>
		</span>
		<input
			type="checkbox"
			checked={tapMode}
			onchange={(e) => setTapMode(e.currentTarget.checked)}
			class="size-6 accent-(--accent)"
			data-testid="tap-mode"
		/>
	</label>

	<div
		class="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-auto bg-linear-to-t from-bg from-70% to-transparent px-4 pt-6 pb-3 md:bottom-0 md:mx-0 md:px-0 md:pb-4"
	>
		<button
			class="btn btn-primary min-h-16 w-full text-lg shadow-lg"
			onclick={start}
			data-testid="changes-start"
		>
			<Icon name="timer" size={26} /> Start 1 minute
		</button>
	</div>

	{#if pairs.length}
		<section class="mt-6">
			<h2 class="mb-2 text-lg font-semibold">Your pairs</h2>
			<ul class="flex flex-col gap-2" data-testid="pair-list">
				{#each pairs as p (pairKey(p.chordA, p.chordB))}
					<li>
						<button
							class="card flex w-full items-center gap-3 p-3 text-left hover:bg-surface-2"
							onclick={() => pick([p.chordA, p.chordB])}
						>
							<span class="w-24 font-semibold">{p.chordA} – {p.chordB}</span>
							<span class="flex-1 text-sm text-muted">best <b class="text-fg">{p.best}</b></span>
							<Sparkline
								values={p.history.map((h) => h.count)}
								label="{p.chordA}–{p.chordB} history"
							/>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

{#if phase !== 'setup'}
	<!-- Full-screen practice view: the whole lower area is the tap target. -->
	<div
		class="fixed inset-0 z-30 flex flex-col bg-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
		data-testid="changes-session"
		data-phase={phase}
	>
		<div class="mb-2 flex items-center gap-2">
			<span class="flex-1 text-lg font-semibold">{a} ⇄ {b}</span>
			{#if phase !== 'done'}
				<button class="btn" onclick={cancel} aria-label="Cancel"><Icon name="close" /></button>
			{/if}
		</div>
		<div class="flex min-h-0 flex-1 flex-col gap-4 short:flex-row short:items-stretch">
			<div
				class="mx-auto grid w-full max-w-md grid-cols-2 gap-4 lg:max-w-xl short:mx-0 short:w-80 short:shrink-0 short:self-center short:gap-2"
			>
				<div data-testid="session-a" data-voicing={sessionA.id}>
					<p class="text-center text-3xl font-bold short:text-2xl">{a}</p>
					<ChordDiagram voicing={sessionA} label="{a} diagram" />
				</div>
				<div>
					<p class="text-center text-3xl font-bold short:text-2xl">{b}</p>
					<ChordDiagram voicing={sessionB} label="{b} diagram" />
				</div>
			</div>

			{#if phase === 'done'}
				<div
					class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 text-center short:gap-2"
				>
					<p class="text-xl font-semibold">Time! How many changes?</p>
					<div class="flex items-center gap-4">
						<button
							class="btn size-16 rounded-2xl"
							aria-label="One less"
							onclick={() => (count = Math.max(0, count - 1))}
							><Icon name="minus" size={28} /></button
						>
						<input
							type="number"
							inputmode="numeric"
							min="0"
							max={MAX_CHANGES}
							bind:value={count}
							onfocus={(e) => e.currentTarget.select()}
							class="field h-20 w-32 text-center text-5xl font-bold tabular-nums"
							aria-label="Number of changes"
							data-testid="changes-count-input"
						/>
						<button
							class="btn size-16 rounded-2xl"
							aria-label="One more"
							onclick={() => (count = Math.min(MAX_CHANGES, count + 1))}
							><Icon name="plus" size={28} /></button
						>
					</div>
					<p class="text-sm text-muted">
						{tapMode ? 'Adjust if you missed taps' : 'Type the number you counted'}{current
							? ` · best so far ${current.best}`
							: ''}.
					</p>
					{#if saveError}<p class="text-danger" role="alert">{saveError}</p>{/if}
					<div class="mt-auto flex w-full gap-2">
						<button class="btn min-h-14 flex-1" onclick={cancel}>Discard</button>
						<button
							class="btn btn-primary min-h-14 flex-[2] text-lg"
							onclick={save}
							disabled={saving || !Number.isInteger(count) || count < 0 || count > MAX_CHANGES}
							data-testid="changes-save">Save result</button
						>
					</div>
				</div>
			{:else}
				<button
					class="flex flex-1 touch-manipulation flex-col items-center justify-center rounded-3xl border-2 border-line bg-surface select-none {tapMode
						? 'border-dashed active:bg-surface-2'
						: 'cursor-default'}"
					onpointerdown={tapMode ? hit : undefined}
					onclick={(e) => tapMode && e.detail === 0 && hit()}
					disabled={phase !== 'running' || !tapMode}
					data-testid="changes-tap"
					aria-label={tapMode ? 'Tap for each change' : 'Time left'}
				>
					{#if phase === 'countin'}
						<span
							class="text-9xl font-bold text-accent tabular-nums short:text-8xl"
							data-testid="countin">{countIn}</span
						>
						<span class="text-muted">Get ready on {a}</span>
					{:else if tapMode}
						<span
							class="text-2xl font-semibold text-muted tabular-nums"
							data-testid="changes-remaining">{Math.ceil(remaining)} s left</span
						>
						<span class="text-9xl font-bold tabular-nums short:text-8xl" data-testid="changes-count"
							>{count}</span
						>
						<span class="text-muted">tap per change</span>
					{:else}
						<span
							class="text-9xl font-bold tabular-nums short:text-8xl"
							data-testid="changes-remaining">{Math.ceil(remaining)}</span
						>
						<span class="text-xl text-muted">seconds left · keep counting</span>
					{/if}
					<span class="mt-6 h-2 w-3/4 overflow-hidden rounded-full bg-surface-2 short:mt-3">
						<span
							class="block h-full bg-accent"
							style="width: {phase === 'running' ? (remaining / DURATION_S) * 100 : 100}%"
						></span>
					</span>
				</button>
			{/if}
		</div>
	</div>
{/if}

{#snippet picker(label: string, value: string, set: (v: string) => void)}
	<label class="min-w-0 flex-1">
		<span class="sr-only">{label}</span>
		<select
			class="field w-full text-lg font-semibold"
			{value}
			onchange={(e) => set(e.currentTarget.value)}
			aria-label={label}
		>
			{#each options as id (id)}
				<option value={id}>{id}</option>
			{/each}
		</select>
	</label>
{/snippet}
