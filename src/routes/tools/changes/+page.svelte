<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import Sparkline from '$lib/components/Sparkline.svelte';
	import ToolHeader from '$lib/components/ToolHeader.svelte';
	import { getAudioContext } from '$lib/audio/context';
	import { CHANGE_CHORDS, getChord } from '$lib/chords';
	import ChordCard from '$lib/chords/ChordCard.svelte';
	import ChangesRun from '$lib/changes/ChangesRun.svelte';
	import { canonicalPair, MAX_CHANGES, pairKey, type ChangePair } from '$lib/chordChanges';
	import { getOptional } from '$lib/api';

	const PAIR_KEY = 'changes:pair';
	const TAP_KEY = 'changes:tap';
	/** Changes per minute (JustinGuitar-style goals). */
	const GOAL_SOLID = 30;
	const GOAL_MASTERED = 60;
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

	let a = $state('A');
	let b = $state('D');
	/** Voicing shown for each chord (picked on the setup cards, used in the session). */
	let va = $state(0);
	let vb = $state(0);
	/** Count by tapping (screen or pedal) instead of in your head. */
	let tapMode = $state(false);
	/** The 1-minute round is on screen (full screen, over the setup). */
	let running = $state(false);
	let pairs = $state<ChangePair[]>([]);
	let result = $state<{ count: number; newBest: boolean } | null>(null);
	/** Opened from a lesson (?target=N with its pair): the lesson's mastery goal for that pair. */
	let lessonGoal = $state<{ pair: string; target: number } | null>(null);
	let help = $state(false);

	const chordA = $derived(getChord(a)!);
	const chordB = $derived(getChord(b)!);
	const sessionA = $derived(chordA.voicings[Math.min(va, chordA.voicings.length - 1)]);
	const sessionB = $derived(chordB.voicings[Math.min(vb, chordB.voicings.length - 1)]);
	const current = $derived(pairs.find((p) => pairKey(p.chordA, p.chordB) === pairKey(a, b)));
	const goal = $derived(lessonGoal?.pair === pairKey(a, b) ? lessonGoal.target : null);

	onMount(async () => {
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
		// Linked from a lesson: ?a=C&b=G (any chord spelling) preselects the pair.
		const qa = getChord(page.url.searchParams.get('a') ?? '')?.id;
		const qb = getChord(page.url.searchParams.get('b') ?? '')?.id;
		if (qa && qb && qa !== qb && options.includes(qa) && options.includes(qb)) {
			pick([qa, qb]);
			const target = Number(page.url.searchParams.get('target'));
			if (Number.isInteger(target) && target > 0 && target <= MAX_CHANGES)
				lessonGoal = { pair: pairKey(qa, qb), target };
		}
		try {
			tapMode = localStorage.getItem(TAP_KEY) === '1';
		} catch {
			// default: count in your head
		}
		pairs = await getOptional<ChangePair[]>(fetch, '/api/chord-changes', []);
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
		goal !== null
			? best >= goal
				? 'Lesson goal reached!'
				: `Lesson goal: ${goal}`
			: best >= GOAL_MASTERED
				? 'Mastered!'
				: best >= GOAL_SOLID
					? `Solid · next goal ${GOAL_MASTERED}`
					: `Goal ${GOAL_SOLID} = solid · ${GOAL_MASTERED} = mastered`;

	function start() {
		getAudioContext(); // unlock audio inside the tap
		result = null;
		running = true;
	}

	function saved(pair: ChangePair, count: number) {
		const best = current?.best ?? 0;
		pairs = [pair, ...pairs.filter((p) => pairKey(p.chordA, p.chordB) !== pairKey(a, b))];
		result = { count, newBest: count > best && best > 0 };
		running = false;
	}
</script>

<svelte:head><title>1-minute changes · Self-Guitar</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-2 md:p-8">
	<ToolHeader title="1-minute changes">
		{#snippet actions()}
			<button
				class="btn bg-transparent! px-2 text-muted"
				aria-expanded={help}
				aria-label="How it works"
				onclick={() => (help = !help)}
				data-testid="changes-help"><Icon name="help" /></button
			>
		{/snippet}
	</ToolHeader>

	{#if help}
		<p class="mb-2 text-sm text-muted" data-testid="changes-intro">
			Strum one chord, switch, strum the other: how many clean changes in a minute? Count in your
			head and type the total at the end. Daily; {GOAL_SOLID}/min is solid, {GOAL_MASTERED} is mastered.
		</p>
	{/if}

	<div class="mb-2 flex items-center gap-2">
		{@render picker('First chord', a, (v) => pick([v, v === b ? a : b]))}
		<button class="btn shrink-0" aria-label="Swap chords" onclick={() => pick([b, a])}>⇄</button>
		{@render picker('Second chord', b, (v) => pick([v === a ? b : a, v]))}
	</div>

	<div class="grid grid-cols-2 gap-2" data-testid="pair-diagrams">
		<ChordCard chord={chordA} big bind:index={va} />
		<ChordCard chord={chordB} big bind:index={vb} />
	</div>

	<div
		class="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 pb-1 md:mx-0 md:flex-wrap md:px-0"
		aria-label="Suggested pairs"
	>
		{#each SUGGESTED as pair (pair.join())}
			<button
				class="btn min-h-9 shrink-0 rounded-full"
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
		class="mt-2 flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-1.5"
		data-testid="pair-best"
	>
		<span class="min-w-0 leading-tight">
			<span class="text-xs text-muted">Best {canonicalPair(a, b).join(' – ')}</span>
			{#if current}
				<b class="ml-1 text-xl tabular-nums">{current.best}</b><span class="text-xs text-muted"
					>/min · {current.tries}
					{current.tries === 1 ? 'try' : 'tries'}</span
				>
			{:else}
				<b class="ml-1">–</b>
			{/if}
			<span
				class="block text-xs {current && current.best >= (goal ?? GOAL_SOLID)
					? 'text-ok'
					: 'text-muted'}"
				>{#if goal !== null}<b data-testid="lesson-goal">Lesson goal: {goal}</b
					>{#if current && current.best >= goal}
						· reached!{/if}{:else}{goalText(current?.best ?? 0)}{/if}</span
			>
		</span>
		{#if current && current.history.length > 1}
			<Sparkline
				values={current.history.map((h) => h.count)}
				width={100}
				height={30}
				label="Recent results"
			/>
		{/if}
	</div>

	<label class="mt-1 flex min-h-11 items-center justify-between gap-3">
		<span class="text-sm font-medium"
			>Count by tapping <span class="font-normal text-muted">(screen or pedal)</span></span
		>
		<input
			type="checkbox"
			checked={tapMode}
			onchange={(e) => setTapMode(e.currentTarget.checked)}
			class="size-6 accent-(--accent)"
			data-testid="tap-mode"
		/>
	</label>

	<div
		class="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-3 mt-auto bg-linear-to-t from-bg from-70% to-transparent px-3 pt-3 pb-2 md:bottom-0 md:mx-0 md:px-0 md:pb-4"
	>
		<button
			class="btn btn-primary min-h-14 w-full text-lg shadow-lg"
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

{#if running}
	<!-- Full-screen practice view: the whole lower area is the tap target. -->
	<div
		class="fixed inset-0 z-30 flex flex-col bg-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
	>
		<ChangesRun
			{a}
			{b}
			voicingA={sessionA}
			voicingB={sessionB}
			{tapMode}
			best={current?.best ?? null}
			onsaved={saved}
			oncancel={() => (running = false)}
		/>
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
