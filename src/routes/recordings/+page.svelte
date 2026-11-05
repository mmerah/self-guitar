<script lang="ts">
	// My recordings: every take in this browser, grouped by song / exercise / warm-up, newest
	// first. Each row: title, date, tempo, length (never cut off), and two controls: play, and ⋯
	// for compare with the tab (opens the item at the take's tempo), then-vs-now pick, share,
	// download, rename, delete. "Then vs now" plays two takes of one item back to back.
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { itemHref } from '$lib/record/context';
	import { extFor } from '$lib/record/mime';
	import { decodeTake, forgetTake, TakePlayer } from '$lib/record/playback';
	import { formatBytes, formatDuration } from '$lib/record/quota';
	import {
		deleteAllTakes,
		deleteTake,
		groupTakes,
		listTakes,
		onTakesChanged,
		takeBlob,
		totalSize
	} from '$lib/record/store';
	import { RATINGS, type Take } from '$lib/record/types';
	import { updateTake } from '$lib/record/store';

	let takes = $state<Take[] | null>(null);
	let failed = $state('');
	let playingId = $state<string | null>(null);
	let progress = $state(0);
	let confirmId = $state<string | null>(null);
	let confirmAll = $state(false);
	/** The row whose ⋯ menu is open. */
	let menuId = $state<string | null>(null);
	let menuUp = $state(false);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	/** Then vs now: the two takes picked per group (oldest + newest unless changed). */
	let picks = $state<Record<string, string[]>>({});
	let sequence = $state<string | null>(null);
	let raf = 0;
	const player = new TakePlayer();
	let queue: string[] = [];

	const groups = $derived(takes ? groupTakes(takes) : []);
	let shareable = $state(false);
	const focus = $derived(page.url.searchParams.get('item'));
	const ordered = $derived(
		focus ? [...groups].sort((a, b) => Number(b.key === focus) - Number(a.key === focus)) : groups
	);
	const used = $derived(takes ? totalSize(takes) : 0);
	const KIND: Record<string, string> = {
		song: 'Song',
		exercise: 'Exercise',
		warmup: 'Warm-up',
		free: 'Free'
	};

	async function load() {
		try {
			takes = await listTakes();
		} catch (e) {
			failed = (e as Error).message;
			takes = [];
		}
	}

	onMount(() => {
		shareable = canShareFiles();
		void load().then(async () => {
			if (!focus) return;
			await tick();
			document.querySelector(`[data-group="${CSS.escape(focus)}"]`)?.scrollIntoView();
		});
		const off = onTakesChanged(load);
		return () => {
			off();
			player.stop(false);
			cancelAnimationFrame(raf);
		};
	});

	player.onend = () => {
		cancelAnimationFrame(raf);
		const next = queue.shift();
		if (next) void play(next, true);
		else {
			playingId = null;
			sequence = null;
		}
	};

	function follow() {
		cancelAnimationFrame(raf);
		const frame = () => {
			if (!player.playing) return;
			progress = player.position() / Math.max(0.01, player.duration);
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
	}

	async function play(id: string, keepQueue = false) {
		if (!keepQueue) {
			queue = [];
			sequence = null;
		}
		if (playingId === id && player.playing && !keepQueue) {
			player.stop(false);
			playingId = null;
			return;
		}
		playingId = id;
		progress = 0;
		const buf = await decodeTake(id);
		if (playingId !== id) return;
		if (!buf) {
			failed = 'This browser cannot play that take (download it to play elsewhere).';
			playingId = null;
			return;
		}
		player.play(buf);
		follow();
	}

	function picked(key: string, all: Take[]): string[] {
		const p = picks[key]?.filter((id) => all.some((t) => t.id === id));
		if (p && p.length === 2) return p;
		return [all[all.length - 1].id, all[0].id];
	}
	function togglePick(key: string, all: Take[], id: string) {
		const cur = picked(key, all);
		if (cur.includes(id)) return;
		// Replace the one picked longest ago: [older pick, newer pick] → keep the last tapped.
		picks[key] = [cur[1], id];
	}

	const createdOf = (all: Take[], id: string) => all.find((t) => t.id === id)?.createdAt ?? 0;

	function thenVsNow(key: string, all: Take[]) {
		const ids = [...picked(key, all)].sort((a, b) => createdOf(all, a) - createdOf(all, b));
		if (sequence === key) {
			queue = [];
			player.stop(false);
			playingId = null;
			sequence = null;
			return;
		}
		queue = [ids[1]];
		sequence = key;
		void play(ids[0], true);
	}

	const stamp = (t: number) => {
		const d = new Date(t);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
	};
	const slug = (s: string) =>
		s
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 40) || 'take';
	const fileName = (t: Take) => `${slug(t.title)}-${stamp(t.createdAt)}.${extFor(t.mime)}`;
	const dateLabel = (t: number) =>
		new Date(t).toLocaleString(undefined, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	const tempoLabel = (t: Take) =>
		t.bpm
			? `${t.bpm} BPM${t.tempoPct && t.tempoPct !== 100 ? ` (${t.tempoPct}%)` : ''}`
			: t.tempoPct
				? `${t.tempoPct}%`
				: '';

	const canShareFiles = () => {
		try {
			return (
				typeof navigator.canShare === 'function' &&
				navigator.canShare({ files: [new File([''], 'a.webm', { type: 'audio/webm' })] })
			);
		} catch {
			return false;
		}
	};

	async function share(t: Take) {
		menuId = null;
		const blob = await takeBlob(t.id);
		if (!blob) return;
		const file = new File([blob], fileName(t), { type: blob.type });
		if (canShareFiles() && navigator.canShare({ files: [file] })) {
			try {
				await navigator.share({ files: [file], title: t.name || t.title });
				return;
			} catch (e) {
				if ((e as Error).name === 'AbortError') return;
				// fall back to a download
			}
		}
		save(blob, file.name);
	}

	async function download(t: Take) {
		menuId = null;
		const blob = await takeBlob(t.id);
		if (blob) save(blob, fileName(t));
	}

	function save(blob: Blob, name: string) {
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		document.body.append(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	function startRename(t: Take) {
		menuId = null;
		renaming = t.id;
		renameValue = t.name ?? '';
	}
	async function finishRename(t: Take, keep = true) {
		if (renaming !== t.id) return;
		renaming = null;
		if (keep) await updateTake(t.id, { name: renameValue.trim() });
	}

	function onOutside(e: PointerEvent) {
		if (menuId && !(e.target as Element | null)?.closest('[data-popover=take]')) {
			menuId = null;
			confirmId = null;
		}
	}

	async function remove(id: string) {
		if (confirmId !== id) {
			confirmId = id;
			return;
		}
		confirmId = null;
		menuId = null;
		if (playingId === id) {
			player.stop(false);
			playingId = null;
		}
		forgetTake(id);
		await deleteTake(id);
	}

	async function removeAll() {
		if (!confirmAll) {
			confirmAll = true;
			return;
		}
		confirmAll = false;
		player.stop(false);
		playingId = null;
		for (const t of takes ?? []) forgetTake(t.id);
		await deleteAllTakes();
	}
</script>

<svelte:head><title>My recordings · Self-Guitar</title></svelte:head>
<svelte:window onpointerdown={onOutside} onkeydown={(e) => e.key === 'Escape' && (menuId = null)} />

<main class="mx-auto w-full max-w-3xl px-3 py-2 md:p-8">
	<PageHeader
		title="My recordings"
		back={{ href: `${base}/progress`, label: 'Back to progress' }}
	/>

	{#if takes === null}
		<p class="text-muted">Loading…</p>
	{:else if !takes.length}
		<section
			class="card mx-auto flex max-w-lg flex-col items-center gap-3 py-8 text-center"
			data-testid="recordings-empty"
		>
			<span class="grid size-14 place-items-center rounded-2xl bg-surface-2 text-accent"
				><Icon name="waveform" size={30} /></span
			>
			<h2 class="text-lg font-semibold">No recordings yet</h2>
			<p class="text-sm text-muted">
				Tap <b>Rec</b> in a song or exercise player to record yourself, then hear how it sounds next to
				the tab. Takes stay in this browser only.
			</p>
			<a href="{base}/library" class="btn btn-primary min-h-12 px-6">Open the library</a>
		</section>
	{:else}
		<div
			class="mb-2 flex items-center gap-2 text-sm text-muted tabular-nums"
			data-testid="recordings-summary"
		>
			<span class="min-w-0 flex-1"
				>{takes.length} take{takes.length === 1 ? '' : 's'} · {formatBytes(used)} in this browser</span
			>
			<button
				class="btn min-h-9 px-2 text-xs {confirmAll ? 'bg-danger! text-white!' : ''}"
				onclick={removeAll}
				onblur={() => (confirmAll = false)}
				data-testid="recordings-delete-all"
				>{confirmAll ? 'Really delete all?' : 'Delete all'}</button
			>
		</div>
		{#if failed}<p class="mb-2 text-sm text-danger" role="alert">{failed}</p>{/if}

		<div class="flex flex-col gap-3">
			{#each ordered as g (g.key)}
				{@const href = itemHref(base, g)}
				{@const pick = g.takes.length > 1 ? picked(g.key, g.takes) : []}
				{@const then = pick.reduce(
					(a, id) => (createdOf(g.takes, id) < createdOf(g.takes, a) ? id : a),
					pick[0]
				)}
				<section
					class="card p-0! {focus === g.key ? 'ring-2 ring-accent' : ''}"
					data-group={g.key}
					data-testid="recordings-group"
					aria-label={g.title}
				>
					<header class="flex items-center gap-2 border-b border-line px-3 py-2">
						<div class="min-w-0 flex-1">
							<h2 class="truncate leading-tight font-semibold">
								{#if href}<a class="hover:underline" {href}>{g.title}</a>{:else}{g.title}{/if}
							</h2>
							<p class="text-xs text-muted">
								{KIND[g.itemType]} · {g.takes.length} take{g.takes.length === 1 ? '' : 's'}
							</p>
						</div>
						{#if g.takes.length > 1}
							<button
								class="btn min-h-10 px-2 text-xs font-semibold {sequence === g.key
									? 'btn-primary'
									: ''}"
								onclick={() => thenVsNow(g.key, g.takes)}
								title="Play the two picked takes back to back, older first"
								data-testid="then-vs-now"
								><Icon name={sequence === g.key ? 'stop' : 'play'} size={16} />Then vs now</button
							>
						{/if}
					</header>
					<ul class="divide-y divide-line">
						{#each g.takes as t (t.id)}
							{@const on = playingId === t.id}
							{@const rate = RATINGS.find((r) => r.value === t.rating)}
							<li class="flex items-start gap-2 px-2 py-2" data-testid="recording" data-take={t.id}>
								<button
									class="btn size-11 shrink-0 rounded-full p-0 {on ? 'btn-primary' : ''}"
									onclick={() => play(t.id)}
									aria-label={on ? 'Stop' : `Play ${t.name || t.title}`}
									data-testid="recording-play"
									data-playing={on}><Icon name={on ? 'stop' : 'play'} size={20} /></button
								>
								<div class="min-w-0 flex-1 py-0.5">
									{#if renaming === t.id}
										<input
											class="field min-h-10 w-full text-sm"
											bind:value={renameValue}
											placeholder={t.title}
											maxlength="60"
											aria-label="Name of the take"
											onkeydown={(e) => {
												if (e.key === 'Enter') void finishRename(t);
												if (e.key === 'Escape') void finishRename(t, false);
											}}
											onblur={() => finishRename(t)}
											data-testid="recording-rename-input"
											{@attach (el) => el.focus()}
										/>
									{:else}
										<p class="text-sm leading-snug font-semibold break-words">
											{t.name || t.title}
											{#if rate}<span class="font-normal" title={rate.label}>{rate.emoji}</span
												>{/if}
											{#if pick.includes(t.id)}
												<span
													class="ml-1 align-middle text-[11px] font-semibold tracking-wide text-muted uppercase"
													data-testid="recording-pick-label">{t.id === then ? 'Then' : 'Now'}</span
												>
											{/if}
										</p>
									{/if}
									<p
										class="text-xs leading-snug text-muted tabular-nums"
										data-testid="recording-meta"
									>
										{[
											dateLabel(t.createdAt),
											tempoLabel(t),
											formatDuration(t.duration),
											t.mode === 'solo' && t.itemType !== 'warmup' ? 'solo' : ''
										]
											.filter(Boolean)
											.join(' · ')}
									</p>
									{#if t.note}<p class="text-xs leading-snug break-words">{t.note}</p>{/if}
									{#if on}
										<span class="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2"
											><span class="block h-full bg-accent" style:width="{progress * 100}%"
											></span></span
										>
									{/if}
								</div>
								<span class="relative shrink-0" data-popover="take">
									<button
										class="btn size-11 p-0 {menuId === t.id ? 'text-accent' : ''}"
										onclick={(e) => {
											confirmId = null;
											// Low on the screen: the menu opens upwards (Delete stays in view).
											menuUp = e.currentTarget.getBoundingClientRect().top > innerHeight / 2;
											menuId = menuId === t.id ? null : t.id;
										}}
										aria-expanded={menuId === t.id}
										aria-haspopup="true"
										aria-label="More for this take"
										data-testid="recording-more"><Icon name="more" size={20} /></button
									>
									{#if menuId === t.id}
										<div
											class="absolute right-0 z-30 flex w-64 flex-col rounded-2xl border border-line bg-surface p-1.5 shadow-xl {menuUp
												? 'bottom-full mb-1'
												: 'top-full mt-1'}"
											role="menu"
											data-testid="recording-menu"
										>
											{#if href && g.itemType !== 'warmup'}
												<a
													class="btn justify-start bg-transparent!"
													role="menuitem"
													href={itemHref(base, t, t.id)}
													data-testid="recording-compare"
													><Icon name="tab" size={20} />Compare with the tab</a
												>
											{/if}
											{#if g.takes.length > 1 && !pick.includes(t.id)}
												<button
													class="btn justify-start bg-transparent!"
													role="menuitem"
													onclick={() => {
														togglePick(g.key, g.takes, t.id);
														menuId = null;
													}}
													data-testid="recording-pick"
													><Icon name="check" size={20} />Use for then vs now</button
												>
											{/if}
											{#if shareable}
												<button
													class="btn justify-start bg-transparent!"
													role="menuitem"
													onclick={() => share(t)}
													data-testid="recording-share"><Icon name="up" size={20} />Share…</button
												>
											{/if}
											<button
												class="btn justify-start bg-transparent!"
												role="menuitem"
												onclick={() => download(t)}
												data-testid="recording-download"
												><Icon name="down" size={20} />Download</button
											>
											<button
												class="btn justify-start bg-transparent!"
												role="menuitem"
												onclick={() => startRename(t)}
												data-testid="recording-rename"><Icon name="edit" size={20} />Rename</button
											>
											<button
												class="btn justify-start {confirmId === t.id
													? 'bg-danger! text-white!'
													: 'bg-transparent! text-danger'}"
												role="menuitem"
												onclick={() => remove(t.id)}
												data-testid="recording-delete"
												><Icon name="close" size={20} />{confirmId === t.id
													? 'Really delete?'
													: 'Delete'}</button
											>
										</div>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
		<p class="mt-3 text-center text-xs text-muted">
			Takes are kept in this browser only (never uploaded). Clearing site data deletes them.
		</p>
	{/if}
</main>
