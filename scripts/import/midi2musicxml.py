"""MIDI -> MusicXML with music21, for scripts/import/mutopia.mjs.

Run it from a virtualenv, isolated (-I) and with file paths as arguments:
    python -I scripts/import/midi2musicxml.py in.mid out.musicxml [pickup-quarters]
It only parses the MIDI file as data; nothing in the download is executed.
"""
import sys

from music21 import chord, converter, midi, note, stream
from music21.common.numberTools import opFrac

# Grids tried in order (divisions of a quarter): the first that fits every onset and length.
GRIDS = [(4,), (8,), (4, 3), (8, 3), (16,), (16, 3)]


def load(src: str, pickup: float) -> midi.MidiFile:
    """The MIDI file; with a pickup (quarters), its notes start late so the pickup ends bar 1."""
    mf = midi.MidiFile()
    mf.open(src)
    mf.read()
    mf.close()
    if pickup:
        ts = converter.parse(src, format="midi").recurse().getElementsByClass("TimeSignature")
        bar = ts[0].barDuration.quarterLength if ts else 4.0
        pad = round((bar - pickup) * mf.ticksPerQuarterNote)
        notes = (midi.ChannelVoiceMessages.NOTE_ON, midi.ChannelVoiceMessages.NOTE_OFF)
        for track in mf.tracks:
            # Absolute times; notes and anything after the start move, set-up events stay at 0.
            timed, t = [], 0
            for e in track.events:
                if e.isDeltaTime():
                    t += e.time
                else:
                    timed.append((t + pad if t > 0 or e.type in notes else t, len(timed), e))
            events, t = [], 0
            for at, _, e in sorted(timed, key=lambda x: (x[0], x[1])):
                events += [midi.DeltaTime(track, time=at - t), e]
                t = at
            track.events = events
    return mf


def parse(mf: midi.MidiFile, **kw) -> stream.Score:
    return midi.translate.midiFileToStream(mf, **kw)


def grid(mf: midi.MidiFile) -> tuple:
    """The coarsest grid the MIDI's own timing fits (LilyPond MIDI is exact, so this is lossless).

    Quantising a piece with 32nds to (4, 3) snaps a dotted 16th to a triplet 8th and leaves
    tuplets that do not add up to a bar; a piece without triplets should not get any.
    """
    raw = parse(mf, quantizePost=False)
    times = []
    for n in raw.flatten().notes:
        start = float(n.getOffsetInHierarchy(raw))
        times += [start, start + float(n.quarterLength)]
    for g in GRIDS:
        if all(min(abs(t * d - round(t * d)) / d for d in g) < 0.02 for t in times):
            return g
    return (4, 3)


def tied(n, kinds) -> bool:
    return n.tie is not None and n.tie.type in kinds


def revoice(measure: stream.Measure, others: list, carry: dict) -> dict:
    """Splits a bar's notes (from `measure` and the same bar of `others`) into clean voices.

    music21's MIDI import can leave a held bass and a melody note in the same voice, which the
    MusicXML writer then lays end to end (the voice overflows the bar); a multi-track MIDI gives
    each line its own part. Notes struck together with the same length become one chord; each
    chord goes to the first voice free at its onset (higher notes first, so the melody stays in
    voice 1). A note that would open a third voice joins a chord struck at the same time instead
    (it takes that chord's length: on the guitar both ring). Rests fill the gaps. A tied note
    continues in the voice it was tied from (`carry`: pitch -> voice, returned for the next bar),
    since a tie only joins notes of one voice.
    """
    bar = measure.barDuration.quarterLength
    groups: dict[tuple, list] = {}
    for m in [measure, *others]:
        flat = m.flatten()
        for n in flat.notes:
            start = opFrac(flat.elementOffset(n))
            if start >= bar:
                continue
            length = opFrac(min(n.quarterLength, bar - start))
            for p in n.notes if isinstance(n, chord.Chord) else [n]:
                home = carry.get(p.pitch.ps) if tied(p, ("stop", "continue")) else None
                groups.setdefault((start, length, home), []).append(p)
    for v in list(measure.voices):
        measure.remove(v)
    for n in list(measure.notesAndRests):
        measure.remove(n)
    if not groups:
        measure.insert(0, note.Rest(quarterLength=bar))
        return {}
    items = sorted(
        groups.items(),
        key=lambda kv: (kv[0][2] is None, kv[0][0], -max(p.pitch.ps for p in kv[1])),
    )
    voices: list[list] = []  # per voice: [[start, length, notes]]
    is_free = lambda v, start: not v or opFrac(v[-1][0] + v[-1][1]) <= start
    for (start, length, home), notes in items:
        if home is not None:
            while len(voices) <= home:
                voices.append([])
            if is_free(voices[home], start):
                voices[home].append([start, length, list(notes)])
                continue
        free = [v for v in voices if is_free(v, start)]
        same = [v for v in voices if v and v[-1][0] == start]
        if free:
            free[0].append([start, length, list(notes)])
        elif len(voices) >= 2 and same:
            same[-1][-1][2].extend(notes)
        else:
            voices.append([[start, length, list(notes)]])
    out = {}
    for i, items_ in enumerate(voices):
        v = stream.Voice(id=str(i + 1))
        t = 0.0
        for start, length, notes in items_:
            if start > t:
                v.insert(t, note.Rest(quarterLength=opFrac(start - t)))
            seen = {}
            for n in notes:
                seen.setdefault(n.pitch.ps, n)
                if tied(n, ("start", "continue")):
                    out[n.pitch.ps] = i
            el = notes[0] if len(seen) == 1 else chord.Chord(list(seen.values()))
            el.quarterLength = length
            v.insert(start, el)
            t = opFrac(start + length)
        if t < bar:
            v.insert(t, note.Rest(quarterLength=opFrac(bar - t)))
        measure.insert(0, v)
    return out


def main(src: str, dst: str, pickup: float = 0) -> None:
    mf = load(src, pickup)
    # Quantise to the piece's own grid (16ths, 32nds, triplets only when it has them).
    score = parse(mf, quantizePost=True, quarterLengthDivisors=grid(mf))
    # One guitar part: every track's notes, bar by bar, split into voices that add up to the bar.
    parts = list(score.parts)
    bars = [list(p.getElementsByClass(stream.Measure)) for p in parts]
    carry: dict = {}
    for i, measure in enumerate(bars[0]):
        carry = revoice(measure, [b[i] for b in bars[1:] if i < len(b)], carry)
    for p in parts[1:]:
        score.remove(p)
    score.write("musicxml", fp=dst)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        sys.exit("usage: python -I midi2musicxml.py in.mid out.musicxml [pickup-quarters]")
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) == 4 else 0)
