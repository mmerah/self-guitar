<script lang="ts">
	import { base } from '$app/paths';
	import Icon from '$lib/components/Icon.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import DayBars from '$lib/charts/DayBars.svelte';
	import StackedBar, { type Segment } from '$lib/charts/StackedBar.svelte';
	import Trend from '$lib/charts/Trend.svelte';
	import { gains } from '$lib/session/improving';
	import WeekDays from '$lib/session/WeekDays.svelte';

	let { data } = $props();
	const h = $derived(data.history);

	const STATUS = [
		{ key: 'mastered', label: 'mastered', color: 'var(--ok)' },
		{ key: 'due', label: 'due for review', color: 'var(--finger-1)' },
		{ key: 'learning', label: 'learning', color: 'var(--accent)' },
		{ key: 'new', label: 'not started', color: 'var(--border)' }
	] as const;

	const segments = (counts: Record<string, number>): Segment[] =>
		STATUS.map((s) => ({ key: s.key, label: s.label, color: s.color, value: counts[s.key] ?? 0 }));

	const minutes8w = $derived(h ? h.days.reduce((a, d) => a + d.minutes, 0) : 0);
	const activeDays = $derived(h ? h.days.filter((d) => d.minutes > 0).length : 0);
	const empty = $derived(!!h && !h.totals.sessions && !h.exercises.length && !h.pairs.length);
	const improving = $derived(h ? gains(h) : []);
</script>

<svelte:head><title>Progress · Self-Guitar</title></svelte:head>

<main class="mx-auto w-full max-w-5xl p-4 md:p-8">
	<header class="mb-4 flex items-center gap-2">
		<h1 class="flex-1 text-2xl font-bold">Progress</h1>
		<div class="md:hidden"><ThemeToggle /></div>
	</header>

	{#if !h}
		<p class="card text-muted">
			Your history needs the server: it will be here when you are back online.
		</p>
	{:else if empty}
		<section
			class="card mx-auto flex max-w-lg flex-col items-center gap-3 py-8 text-center"
			data-testid="progress-empty"
		>
			<span class="rounded-2xl bg-surface-2 p-4 text-accent"><Icon name="chart" size={40} /></span>
			<h2 class="text-xl font-semibold">Your progress starts with your first session</h2>
			<p class="text-muted">
				Minutes per day, tempo records, chord changes and skills fill in here as you play.
			</p>
			<a href="{base}/" class="btn btn-primary min-h-12 px-6">Go to Today</a>
		</section>
	{:else}
		<div class="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<section class="card lg:col-span-2" aria-labelledby="improving-h" data-testid="improving">
				<h2 id="improving-h" class="mb-2 font-semibold">Am I improving?</h2>
				{#if improving.length}
					<ul class="flex flex-wrap gap-2">
						{#each improving as g (g.text)}
							<li class="rounded-xl bg-surface-2 px-3 py-2 font-semibold">
								<span class="text-ok">▲</span>
								{g.text}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="text-muted">
						Records need a second day to show a trend: rate ladder passes and time your changes
						again soon.
					</p>
				{/if}
				<div class="mt-3 border-t border-line pt-3">
					<WeekDays goals={h.goals} />
				</div>
			</section>

			<section class="grid grid-cols-2 gap-2 lg:col-span-2 lg:grid-cols-4" aria-label="Totals">
				<div class="card flex flex-col justify-center p-3">
					<span class="text-xs text-muted">Last 8 weeks</span>
					<span class="text-3xl font-bold tabular-nums" data-testid="minutes-8w">{minutes8w}</span>
					<span class="text-sm text-muted">minutes</span>
				</div>
				<div class="card flex flex-col justify-center p-3">
					<span class="text-xs text-muted">Days practised</span>
					<span class="text-3xl font-bold tabular-nums">{activeDays}</span>
					<span class="text-sm text-muted">of the last 56</span>
				</div>
				<div class="card flex flex-col justify-center p-3">
					<span class="text-xs text-muted">Sessions</span>
					<span class="text-3xl font-bold tabular-nums" data-testid="sessions-total"
						>{h.totals.sessions}</span
					>
					<span class="text-sm text-muted">{h.totals.minutes} min in all</span>
				</div>
				<div class="card flex flex-col justify-center p-3">
					<span class="text-xs text-muted">Weeks on goal</span>
					<span class="text-3xl font-bold tabular-nums">{h.weeks.filter((w) => w.met).length}</span>
					<span class="text-sm text-muted">of the last 8</span>
				</div>
			</section>

			<section class="card lg:col-span-2" aria-labelledby="minutes-h">
				<h2 id="minutes-h" class="mb-2 font-semibold">Practice minutes per day</h2>
				<DayBars days={h.days} goal={h.goals.week.dailyMin} />
			</section>

			<section class="card" id="skills" aria-labelledby="skills-h">
				<h2 id="skills-h" class="mb-1 font-semibold">Skills by level</h2>
				<ul class="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
					{#each STATUS as st (st.key)}
						<li class="flex items-center gap-1">
							<span class="inline-block size-2.5 rounded-sm" style:background={st.color}
							></span>{st.label}
						</li>
					{/each}
				</ul>
				<ul class="flex flex-col gap-3" data-testid="skill-levels">
					{#each h.levels as lv (lv.id)}
						<li data-testid="skill-level" data-level={lv.id}>
							<div class="mb-1 flex items-center gap-2 text-sm">
								<span class="flex-1 font-medium">Level {lv.id} · {lv.title}</span>
								<span class="text-xs text-muted tabular-nums"
									>{lv.masteredTotal}/{lv.total} mastered{lv.counts.due
										? ` · ${lv.counts.due} due`
										: ''}</span
								>
							</div>
							<StackedBar segments={segments(lv.counts)} label="Level {lv.id} skills" />
						</li>
					{/each}
				</ul>
				<h3 class="mt-4 mb-2 text-sm font-semibold text-muted">Level badges</h3>
				<ul class="flex flex-wrap gap-2" data-testid="badges">
					{#each h.levels as lv (lv.id)}
						{@const pct = Math.round((lv.masteredTotal / lv.total) * 100)}
						<li
							class="flex min-w-20 flex-col items-center gap-1 rounded-2xl border-2 p-2 text-center {lv.mastered
								? 'border-ok'
								: 'border-dashed border-line'}"
							data-earned={lv.mastered}
							title={lv.mastered ? `Level ${lv.id} mastered` : `${pct}% of Level ${lv.id} mastered`}
						>
							<span
								class="flex size-10 items-center justify-center rounded-full {lv.mastered
									? 'bg-ok text-ok-fg'
									: 'bg-surface-2 text-muted'}"
							>
								{#if lv.mastered}<Icon name="star" />{:else}<span
										class="text-xs font-semibold tabular-nums">{pct}%</span
									>{/if}
							</span>
							<span class="text-xs font-medium">Level {lv.id}</span>
						</li>
					{/each}
				</ul>
			</section>

			<div class="flex flex-col gap-4">
				<section class="card" aria-labelledby="bpm-h">
					<h2 id="bpm-h" class="mb-1 font-semibold">Tempo records</h2>
					<p class="mb-2 text-xs text-muted">Best clean BPM per day · dashed line = target</p>
					{#if h.exercises.length}
						<ul class="flex flex-col divide-y divide-line" data-testid="bpm-records">
							{#each h.exercises as ex (ex.id)}
								<li class="flex items-center gap-2 py-2">
									<a href="{base}/practice/exercise/{ex.id}" class="min-w-0 flex-1">
										<span class="block text-sm leading-snug font-medium">{ex.title}</span>
										<span class="text-xs text-muted tabular-nums"
											>best {ex.best} · target {ex.target}{ex.mastered
												? ' · mastered'
												: ex.stalled
													? ` · stuck at ${ex.ladderBpm}`
													: ` · ladder at ${ex.ladderBpm}`}</span
										>
									</a>
									<Trend
										points={ex.points}
										target={ex.target}
										unit="BPM"
										label="{ex.title} best clean BPM"
										width={120}
									/>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-muted">Rate a pass on any tempo ladder to start a record.</p>
					{/if}
				</section>

				<section class="card" aria-labelledby="changes-h">
					<h2 id="changes-h" class="mb-1 font-semibold">Chord changes per minute</h2>
					<p class="mb-2 text-xs text-muted">Best per day · dashed line = goal</p>
					{#if h.pairs.length}
						<ul class="flex flex-col divide-y divide-line" data-testid="pair-records">
							{#each h.pairs as p (`${p.a}|${p.b}`)}
								<li class="flex items-center gap-2 py-2">
									<a
										href="{base}/tools/changes?a={encodeURIComponent(p.a)}&b={encodeURIComponent(
											p.b
										)}"
										class="min-w-0 flex-1"
									>
										<span class="block text-sm font-medium">{p.a} – {p.b}</span>
										<span class="text-xs text-muted tabular-nums"
											>best {p.best} / goal {p.target}</span
										>
									</a>
									<Trend
										points={p.points}
										target={p.target}
										unit="/min"
										label="{p.a}–{p.b} changes per minute"
										width={120}
									/>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-sm text-muted">Time a minute of changes to start a record.</p>
					{/if}
				</section>
			</div>
		</div>
	{/if}
</main>
