// Imports a Mutopia Project piece as an auto-fingered tab: content/songs/<slug>/ with meta.json,
// score.atex and REVIEW.md (the human checklist, never shipped).
//
//   node --experimental-strip-types scripts/import/mutopia.mjs <mutopia-id> --slug <song-id> --level <n>
//        [--title "…"] [--composer "Fernando Sor"] [--key "C major"] [--tempo 72] [--shift -12]
//        [--style classical] [--pickup 4] [--force]
//
// Steps: the piece-info page (title, composer and dates, licence, typesetter, file links) → the
// .mid (a piece with only LilyPond files is skipped: LilyPond is not converted) → music21 (MIDI →
// MusicXML, IMPORT_PYTHON) → alphaTab → fingering for the level → compact alphaTex. Downloads go to
// IMPORT_DIR (default data/import): they are data, only ever parsed.
import fs from 'node:fs';
import path from 'node:path';
import { STYLES } from '../../src/lib/content/schema.ts';
import { midiTempo } from '../../src/lib/import/midi.ts';
import {
	download,
	fetchText,
	midiToMusicXml,
	parseFlags,
	sha256,
	summary,
	writeSong
} from './common.mjs';

const SITE = 'https://www.mutopiaproject.org';

const text = (html) =>
	html
		.replace(/<[^>]*>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();

/** Mutopia's licence names → the short form our meta uses. */
export function licence(name) {
	const n = name.trim();
	if (/public domain/i.test(n)) return 'Public Domain';
	const m = /Creative Commons Attribution(-ShareAlike)?\s+(\d\.\d)/i.exec(n);
	if (m) return `CC BY${m[1] ? '-SA' : ''} ${m[2]}`;
	throw new Error(
		`unsupported licence "${n}": only Public Domain, CC BY and CC BY-SA are imported`
	);
}

/** Title, composer, dates, opus, licence, typesetter and file links from a piece-info page. */
export function parseInfo(html) {
	const field = (label) => {
		const m = new RegExp(`<b>${label}:</b>([\\s\\S]*?)</td>`).exec(html);
		return m ? text(m[1]) : null;
	};
	const by = text(/<h4>([\s\S]*?)<\/h4>/.exec(html)?.[1] ?? '').replace(/^by\s+/, '');
	const dates = /\((\d{4})\s*[–-]\s*(\d{4})\)/.exec(by);
	const links = [...html.matchAll(/href="([^"]+\.(?:mid|ly|zip))"/g)].map((m) => m[1]);
	return {
		title: text(/<h2>([\s\S]*?)<\/h2>/.exec(html)?.[1] ?? ''),
		composer: by.replace(/\s*\(.*\)\s*$/, ''),
		dates: dates ? `${dates[1]}–${dates[2]}` : null,
		died: dates ? Number(dates[2]) : null,
		opus: field('Opus'),
		source: field('Source'),
		licence: field('Copyright') ?? '',
		maintainer: field('Maintainer'),
		mid: links.find((l) => l.endsWith('.mid')) ?? null,
		ly: links.find((l) => l.endsWith('.ly')) ?? null
	};
}

/** A LilyPond duration (8, 4., 2*3, 4*2) in quarters. */
export function lyDuration(d) {
	const m = /^(1|2|4|8|16|32)(\.*)(?:\*(\d+)(?:\/(\d+))?)?$/.exec(d.trim());
	if (!m) throw new Error(`--pickup: "${d}" is not a LilyPond duration (8, 4., 4*2)`);
	const base = 4 / Number(m[1]);
	const dotted = base * (2 - 1 / 2 ** m[2].length);
	return (dotted * Number(m[3] ?? 1)) / Number(m[4] ?? 1);
}

/**
 * The first LilyPond `\tempo` with a metronome mark, as a quarter-note BPM (rounded), or null.
 * The beat unit is any LilyPond duration: `\tempo 4 = 120` → 120, `\tempo 2 = 60` → 120,
 * `\tempo 4. = 60` → 90, `\tempo 8 = 132` → 66, `\tempo "Allegro" 2. = 50` → 150. A range
 * (`4 = 100-120`) takes its first number. Pure: no I/O.
 */
export function lyTempo(src) {
	const m = /\\tempo\s+(?:"[^"]*"\s*|\\markup\s*\{[^}]*\}\s*)?(\d+\.*)\s*=\s*(\d+)/.exec(src);
	if (!m) return null;
	return Math.round(Number(m[2]) * lyDuration(m[1]));
}

/** A few header fields of a LilyPond file, read as text (composer's full name, \tempo). */
function lyHeader(src) {
	const get = (k) => new RegExp(`^\\s*${k}\\s*=\\s*"([^"]*)"`, 'm').exec(src)?.[1] ?? null;
	return { composer: get('composer'), opus: get('opus'), tempo: lyTempo(src) };
}

/** Licence deed URLs for the licences an import may carry (CC BY / BY-SA need the link). */
const LICENCE_URLS = {
	'Public Domain': 'https://www.mutopiaproject.org/legal.html',
	'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/'
};

/** The deed URL of a short licence name ("CC BY-SA 3.0" → its creativecommons.org page). */
export function licenceUrl(lic) {
	if (LICENCE_URLS[lic]) return LICENCE_URLS[lic];
	const m = /^CC (BY(?:-SA)?) (\d\.\d)$/.exec(lic);
	if (!m) throw new Error(`no licence URL for "${lic}"`);
	return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/`;
}

/**
 * The attribution line of a Mutopia import: work, typesetter, Mutopia id and page, the edition's
 * licence with its URL, and the tablature's licence (CC0 for a Public Domain edition, else the
 * edition's licence kept) with the change made. `note` adds a known edit (e.g. omitted notes).
 */
export function attribution({ composer, title, maintainer, id, infoUrl, lic, note }) {
	const by = maintainer
		? `Edition typeset by ${maintainer} for the Mutopia Project`
		: 'Mutopia Project edition';
	const edition =
		lic === 'Public Domain' ? `Public Domain (${licenceUrl(lic)})` : `${lic}, ${licenceUrl(lic)}`;
	const tab =
		lic === 'Public Domain'
			? `tablature auto-fingered by Self-Guitar, released under CC0 1.0, ${licenceUrl('CC0 1.0')}`
			: `tablature auto-fingered by Self-Guitar (changes: converted to guitar tablature with fingering), ${lic}, ${licenceUrl(lic)}`;
	return `${composer} - ${title}. ${by} (Mutopia id ${id}, ${infoUrl}), ${edition}; ${tab}${note ? `; ${note}` : ''}.`;
}

async function main() {
	const f = parseFlags(process.argv.slice(2), {
		slug: 'string',
		level: 'string',
		title: 'string',
		composer: 'string',
		key: 'string',
		tempo: 'string',
		shift: 'string',
		style: 'string',
		pickup: 'string',
		force: 'boolean'
	});
	const id = f._[0];
	if (!/^\d+$/.test(id ?? '') || !f.slug || !f.level)
		throw new Error('usage: mutopia.mjs <mutopia-id> --slug <song-id> --level <n> [options]');
	const level = Number(f.level);
	const style = f.style ?? 'classical';
	if (!STYLES.includes(style)) throw new Error(`--style must be one of ${STYLES.join(', ')}`);
	const infoUrl = `${SITE}/cgibin/piece-info.cgi?id=${id}`;
	const info = parseInfo(await fetchText(infoUrl));
	if (!info.mid) {
		console.log(`mutopia ${id}: no MIDI file (LilyPond only): skipped`);
		return;
	}
	const sub = `mutopia/${id}`;
	const midFile = await download(info.mid, sub);
	const bytes = fs.readFileSync(midFile);
	const ly = info.ly ? lyHeader(fs.readFileSync(await download(info.ly, sub), 'utf8')) : null;
	const composer = (f.composer ?? ly?.composer ?? info.composer).replace(/\s*\(.*\)\s*$/, '');
	const lic = licence(info.licence);
	const typeset = info.maintainer
		? `typeset by ${info.maintainer} for the Mutopia Project`
		: 'Mutopia Project';
	const tempo = Number(f.tempo ?? ly?.tempo ?? midiTempo(bytes) ?? 80);
	const tempoFrom = f.tempo
		? '--tempo'
		: ly?.tempo
			? 'the LilyPond \\tempo'
			: midiTempo(bytes)
				? 'the MIDI file (check it)'
				: 'a default (check it)';
	const title = f.title ?? info.title;
	const opus =
		info.opus && !/not known/i.test(info.opus) ? info.opus.replace(/^O\s*/, 'Op. ') : null;
	const edition = info.source && !/^(https?:|unknown)/i.test(info.source) ? info.source : null;
	// --pickup takes the opening \partial as LilyPond writes it (8, 4, 4., 4*2): MIDI has no pickup.
	const pickup = f.pickup ? lyDuration(f.pickup) : 0;
	const lySrc = info.ly ? fs.readFileSync(await download(info.ly, sub), 'utf8') : '';
	const xmlFile = midiToMusicXml(midFile, pickup);
	const tabLicence = lic === 'Public Domain' ? 'tablature CC0' : `tablature ${lic}`;
	const { report } = await writeSong({
		xmlFile,
		level,
		tempo,
		shift: f.shift === undefined ? undefined : Number(f.shift),
		force: !!f.force,
		comment: [
			`${title} - ${composer}${info.dates ? ` (${info.dates})` : ''}.`,
			`Imported from the Mutopia Project (piece ${id}) and auto-fingered for Level ${level}: see REVIEW.md.`
		],
		extra: [
			`Tempo ${tempo} from ${tempoFrom}`,
			`Mutopia licence: ${info.licence}`,
			...(pickup
				? [`Pickup of ${f.pickup} (--pickup): bar 1 is rests then the pickup`]
				: /\\partial/.test(lySrc)
					? ['The .ly has a \\partial: check bar 1 (pass --pickup when the piece opens on one)']
					: [])
		],
		meta: {
			id: f.slug,
			title,
			composer: `${composer}${info.dates ? ` (${info.dates})` : ''}`,
			style,
			...(f.key && { key: f.key }),
			source: `Mutopia Project: ${info.title}${opus ? ` (${opus})` : ''}; ${typeset}${edition ? `, from ${edition}` : ''}`,
			sourceUrl: infoUrl,
			license: `${lic} (Mutopia edition); ${tabLicence}`,
			attribution: attribution({ composer, title, maintainer: info.maintainer, id, infoUrl, lic }),
			import: {
				via: 'mutopia',
				file: info.mid,
				sha256: sha256(bytes),
				...(info.died && { composerDied: info.died })
			}
		}
	});
	console.log(summary(f.slug, report), path.relative(process.cwd(), midFile));
}

// Run only as a script, so tests can import the pure helpers above.
if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
)
	main().catch((e) => {
		console.error(e.message);
		process.exit(1);
	});
