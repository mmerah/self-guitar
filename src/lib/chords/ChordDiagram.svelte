<script lang="ts">
	import type { Voicing } from './model';
	import { toSvguitar } from './diagram';

	let { voicing, label }: { voicing: Voicing; label: string } = $props();

	let svg = $state('');

	$effect(() => {
		const { chord, settings } = toSvguitar(voicing);
		let cancelled = false;
		// svguitar needs the DOM: load it in the browser only, render detached, inline the markup.
		import('svguitar').then(({ SVGuitarChord }) => {
			if (cancelled) return;
			const c = new SVGuitarChord().configure({ ...settings, svgTitle: label }).chord(chord);
			c.draw();
			svg = c.toSvg();
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<div
	class="chord-diagram w-full text-fg [&_svg]:h-auto [&_svg]:w-full"
	role="img"
	aria-label={label}
>
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- markup generated locally by svguitar -->
	{@html svg}
</div>
