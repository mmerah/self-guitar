<script lang="ts">
	// After a take: it plays at once. Primary: play/pause, "Compare with the tab" (one toggle: the
	// take plays with the player's backing, in sync), three emoji ratings, Keep, Delete. The
	// take ↔ tab balance, the note and the name are under "More". In landscape (a short screen)
	// it is a compact bar along the bottom, so the tab stays in view while Compare plays.
	import { base } from '$app/paths';
	import { onDestroy, onMount, untrack } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { suspendKeys } from '$lib/keys';
	import { recordingsHref } from './context';
	import { decodeTake, forgetTake, TakePlayer } from './playback';
	import { formatBytes, formatDuration } from './quota';
	import type { Reference } from './RecordControl.svelte';
	import { deleteTake, updateTake } from './store';
	import { RATINGS, type Take, type TakeRating } from './types';
	import Waveform from './Waveform.svelte';

	let {
		take,
		reference,
		notice = '',
		autoplay = false,
		onclose
	}: {
		take: Take;
		reference?: Reference;
		notice?: string;
		/** Play the take as soon as the sheet opens (a take just recorded). */
		autoplay?: boolean;
		onclose: () => void;
	} = $props();

	const canCompare = $derived(!!reference && take.itemType !== 'free');
	let playing = $state<'none' | 'take' | 'both'>('none');
	let loading = $state(false);
	let progress = $state(-1);
	/** Where a paused take resumes (seconds; take alone only). */
	let resumeAt = $state(0);
	// Initial values only: the sheet is re-created per take. Opened from "Compare" in My
	// recordings (not a fresh take), Compare starts on.
	let compare = $state(untrack(() => !autoplay && !!reference && take.itemType !== 'free'));
	/** 0 = only the take, 1 = only the tab (More › Balance). */
	let balance = $state(0.5);
	let name = $state(untrack(() => take.name ?? ''));
	let rating = $state<TakeRating | undefined>(untrack(() => take.rating));
	let note = $state(untrack(() => take.note ?? ''));
	let more = $state(false);
	let confirmDelete = $state(false);
	/** Landscape phone: the compact bottom bar. */
	let bar = $state(false);
	let closed = false;
	let raf = 0;
	const player = new TakePlayer();
	player.onend = () => {
		if (playing === 'both') reference?.stop();
		playing = 'none';
		progress = -1;
		resumeAt = 0;
		cancelAnimationFrame(raf);
	};

	const dateLabel = $derived(
		new Date(take.createdAt).toLocaleString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		})
	);
	const meta = $derived(
		[
			formatDuration(take.duration),
			dateLabel,
			take.bpm
				? `${take.bpm} BPM${take.tempoPct && take.tempoPct !== 100 ? ` (${take.tempoPct}%)` : ''}`
				: ''
		]
			.filter(Boolean)
			.join(' · ')
	);

	function follow() {
		cancelAnimationFrame(raf);
		const frame = () => {
			if (!player.playing) return;
			progress = Math.min(1, player.position() / Math.max(0.01, player.duration));
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	function applyBalance() {
		if (playing !== 'both') return player.setVolume(1);
		player.setVolume(Math.min(1, (1 - balance) * 2));
		reference?.volume(Math.min(1, balance * 2));
	}

	function halt() {
		const was = playing;
		playing = 'none';
		player.stop(false);
		if (was === 'both') reference?.stop();
		progress = -1;
		cancelAnimationFrame(raf);
	}

	/** Decoded only now, to play (one decoded take is kept: see playback.ts). */
	async function buffer() {
		loading = true;
		const b = await decodeTake(take.id);
		loading = false;
		return closed ? null : b;
	}

	async function playTake(from = resumeAt) {
		const b = await buffer();
		if (!b) return;
		if (playing === 'both') reference?.stop();
		playing = 'take';
		player.setVolume(1);
		player.play(b, from);
		follow();
	}

	async function playBoth() {
		if (!reference?.ready()) return playTake(0);
		halt();
		const b = await buffer();
		if (!b) return;
		const tempo = reference.baseTempo();
		const speed = take.bpm && tempo ? take.bpm / tempo : undefined;
		loading = true;
		try {
			await reference.play({ countIn: take.countIn, speed });
		} catch {
			loading = false;
			return playTake(0);
		}
		loading = false;
		if (closed) return reference.stop();
		playing = 'both';
		resumeAt = 0;
		applyBalance();
		player.play(b, take.offsetMs / 1000, false);
		follow();
	}

	/** Play / pause (a compare restarts from the top: the tab cannot resume mid-bar in sync). */
	function toggle() {
		if (loading) return;
		if (playing === 'take') {
			resumeAt = player.position();
			halt();
		} else if (playing === 'both') halt();
		else if (compare && canCompare) void playBoth();
		else void playTake();
	}

	/** Compare with the tab: on while the take plays restarts both in sync; off leaves the take. */
	function toggleCompare() {
		compare = !compare;
		if (compare && playing === 'take') void playBoth();
		else if (!compare && playing === 'both') {
			reference?.stop();
			playing = 'take';
			applyBalance();
		}
	}

	function seek(frac: number) {
		if (playing === 'both') return;
		void playTake(frac * Math.max(take.duration, player.duration));
	}

	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function save() {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void updateTake(take.id, { name: name.trim(), note: note.trim() });
		}, 300);
	}
	function rate(r: TakeRating) {
		rating = rating === r ? undefined : r;
		void updateTake(take.id, { rating: rating ?? null });
	}

	function keep() {
		clearTimeout(saveTimer);
		void updateTake(take.id, { name: name.trim(), note: note.trim() });
		close();
	}

	async function remove() {
		if (!confirmDelete) {
			confirmDelete = true;
			return;
		}
		clearTimeout(saveTimer);
		halt();
		forgetTake(take.id);
		await deleteTake(take.id);
		close();
	}

	function close() {
		closed = true;
		halt();
		onclose();
	}

	onMount(() => {
		suspendKeys(true);
		const short = matchMedia('(max-height: 500px)');
		const onShort = () => (bar = short.matches);
		onShort();
		short.addEventListener('change', onShort);
		if (autoplay) void playTake(0);
		return () => short.removeEventListener('change', onShort);
	});
	onDestroy(() => {
		closed = true;
		suspendKeys(false);
		clearTimeout(saveTimer);
		halt();
		reference?.volume(1);
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && keep()} />

{#snippet playButton(cls: string)}
	<button
		class="btn {cls} {playing !== 'none' ? 'btn-primary' : ''}"
		onclick={toggle}
		disabled={loading && playing === 'none'}
		aria-label={playing !== 'none' ? 'Pause' : compare && canCompare ? 'Play with the tab' : 'Play'}
		data-testid="review-play"
		data-playing={playing !== 'none'}
		data-what={playing}><Icon name={playing !== 'none' ? 'pause' : 'play'} size={24} /></button
	>
{/snippet}

{#snippet compareToggle(cls: string)}
	{#if canCompare}
		<button
			class="btn {cls} {compare ? 'ring-2 ring-accent text-accent' : ''}"
			role="switch"
			aria-checked={compare}
			onclick={toggleCompare}
			disabled={!reference?.ready()}
			data-testid="review-compare"
			data-playing={playing === 'both'}
			><Icon name="tab" size={20} /><span class="whitespace-nowrap">Compare with the tab</span
			></button
		>
	{/if}
{/snippet}

{#snippet ratings()}
	<span class="flex gap-1" role="group" aria-label="How did it go?">
		{#each RATINGS as r (r.value)}
			<button
				class="btn min-h-11 min-w-11 px-1 text-2xl {rating === r.value
					? 'ring-2 ring-accent'
					: 'opacity-70'}"
				aria-pressed={rating === r.value}
				aria-label={r.label}
				title={r.label}
				onclick={() => rate(r.value)}
				data-testid="review-rate">{r.emoji}</button
			>
		{/each}
	</span>
{/snippet}

{#snippet keepDelete(cls: string)}
	<button
		class="btn {cls} {confirmDelete ? 'bg-danger! text-white!' : ''}"
		onclick={remove}
		onblur={() => (confirmDelete = false)}
		data-testid="review-delete"
		><Icon name="close" size={18} />{confirmDelete ? 'Really?' : 'Delete'}</button
	>
	<button class="btn btn-primary {cls}" onclick={keep} data-testid="review-keep"
		><Icon name="check" size={18} />Keep</button
	>
{/snippet}

{#snippet moreBody()}
	<div class="flex flex-col gap-2" data-testid="review-more-body">
		{#if canCompare}
			<label class="flex items-center gap-2" data-testid="review-balance">
				<span class="w-10 text-xs font-medium">Take</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					bind:value={balance}
					oninput={applyBalance}
					class="h-9 min-w-0 flex-1 accent-(--accent)"
					aria-label="Compare balance: take to tab"
					data-testid="review-balance-slider"
				/>
				<span class="w-8 text-xs font-medium">Tab</span>
			</label>
		{/if}
		<input
			class="field min-h-10 text-sm"
			placeholder="Note (what to fix next time)"
			bind:value={note}
			oninput={save}
			maxlength="200"
			aria-label="Note"
			data-testid="review-note"
		/>
		<input
			class="field min-h-10 text-sm"
			placeholder="Name (optional): {dateLabel}"
			bind:value={name}
			oninput={save}
			maxlength="60"
			aria-label="Name"
			data-testid="review-name"
		/>
		<p class="flex items-center justify-between text-xs text-muted">
			<span>{formatBytes(take.size)} in this browser</span>
			<a
				class="font-medium text-accent underline"
				href={recordingsHref(base, take)}
				data-testid="review-library">My recordings</a
			>
		</p>
	</div>
{/snippet}

{#snippet moreButton(cls: string)}
	<button
		class="btn {cls} {more ? 'text-accent' : ''}"
		onclick={() => (more = !more)}
		aria-expanded={more}
		aria-label="More: balance, note, name"
		title="More: balance, note, name"
		data-testid="review-more"><Icon name="more" size={20} />{bar ? '' : 'More'}</button
	>
{/snippet}

{#if bar}
	<!-- Landscape: a compact bar, no backdrop; the tab above stays visible (and follows). -->
	<div
		class="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-1.5 border-t border-line bg-surface px-3 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
		role="dialog"
		aria-label="Review the take: {take.title}"
		data-testid="review-sheet"
		data-layout="bar"
		data-take={take.id}
	>
		{#if more}
			<div class="mx-auto w-full max-w-3xl">
				{#if notice}<p class="mb-1 text-sm" role="status">{notice}</p>{/if}
				{@render moreBody()}
			</div>
		{/if}
		<div class="mx-auto flex w-full max-w-5xl items-center gap-1.5">
			{@render playButton('min-h-11 min-w-12 rounded-full px-2')}
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<p class="truncate text-xs text-muted tabular-nums" data-testid="review-meta">
					<b class="text-fg">{take.title}</b> · {meta}
				</p>
				<Waveform
					{take}
					height={28}
					progress={playing === 'none' ? -1 : progress}
					onseek={playing === 'both' ? undefined : seek}
				/>
			</div>
			{@render compareToggle('min-h-11 gap-1 px-2 text-sm')}
			{@render ratings()}
			{@render keepDelete('min-h-11 gap-1 px-2 text-sm')}
			{@render moreButton('min-h-11 min-w-11 px-1')}
		</div>
	</div>
{:else}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && keep()}
	>
		<div
			class="flex max-h-full w-full max-w-lg flex-col gap-3 overflow-auto rounded-t-3xl border border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-3xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby="review-title"
			data-testid="review-sheet"
			data-layout="sheet"
			data-take={take.id}
		>
			<header class="flex items-start gap-2">
				<div class="min-w-0 flex-1">
					<h2 id="review-title" class="text-lg leading-tight font-bold">{take.title}</h2>
					<p class="text-sm text-muted tabular-nums" data-testid="review-meta">{meta}</p>
				</div>
				<button class="btn px-2" onclick={keep} aria-label="Close"><Icon name="close" /></button>
			</header>

			{#if notice}<p class="rounded-xl bg-surface-2 px-3 py-2 text-sm" role="status">
					{notice}
				</p>{/if}

			<div class="flex items-center gap-2">
				{@render playButton('size-14 shrink-0 rounded-full p-0')}
				<div class="min-w-0 flex-1">
					<Waveform
						{take}
						progress={playing === 'none' ? -1 : progress}
						onseek={playing === 'both' ? undefined : seek}
					/>
				</div>
			</div>

			{@render compareToggle('min-h-12 w-full gap-2')}

			<div class="flex items-center justify-between gap-2">
				{@render ratings()}
				{@render moreButton('min-h-11 gap-1 px-3 text-sm')}
			</div>

			{#if more}{@render moreBody()}{/if}

			<div class="flex gap-2">
				{@render keepDelete('min-h-12 flex-1')}
			</div>
		</div>
	</div>
{/if}
