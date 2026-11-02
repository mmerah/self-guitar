<script lang="ts" module>
	// Minimal stroke icon set (24x24, lucide-style paths).
	const paths = {
		home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
		library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.9 1-3.9 15-3.9-1z',
		learn: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
		tools: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
		today: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4',
		play: 'M7 4.5v15l12-7.5z',
		pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z',
		stop: 'M6 6h12v12H6z',
		back: 'M15 5l-7 7 7 7',
		sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
		moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
		loop: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
		metronome: 'M8 3h8l4 18H4zM12 17l5-11M7 15h10',
		countin: 'M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 9v4l2 2M10 2h4',
		mixer: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
		notation:
			'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
		minus: 'M5 12h14',
		plus: 'M12 5v14M5 12h14',
		close: 'M6 6l12 12M18 6 6 18',
		search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5'
	} as const;
	export type IconName = keyof typeof paths;
</script>

<script lang="ts">
	let { name, size = 22 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name]} /></svg
>
