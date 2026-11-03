import { describe, expect, it } from 'vitest';
import { anchorFingers, changesDo, whatToDo } from '../../src/lib/session/labels';
import type { PlanBlock } from '../../src/lib/session/types';
import { index } from './planner-fixtures';

const block = (target: PlanBlock['target']): PlanBlock => ({
	kind: 'technique',
	title: 'x',
	minutes: 2,
	target,
	why: ''
});

describe('what to do in a block', () => {
	it('changes: the pair, the minute and the fingers that stay down', () => {
		expect(anchorFingers('C', 'Am')).toEqual([1, 2]);
		expect(changesDo('C', 'Am')).toBe(
			'Switch C ↔ Am as many times as you can in 1 minute. Keep fingers 1 and 2 down.'
		);
		expect(whatToDo(block({ type: 'changes', a: 'E', b: 'Em', target: 30 }), index)).toMatch(
			/^Switch E ↔ Em .* Keep fingers 2 and 3 down\.$/
		);
		expect(anchorFingers('G', 'D')).toEqual([]);
		expect(changesDo('G', 'D')).toMatch(/Move all fingers together/);
	});

	it('song: picks the melody or strums the chords, at the planned speed', () => {
		const song = (play?: 'melody' | 'chords' | 'fingerstyle') =>
			whatToDo(block({ type: 'song', id: 's', tempoPct: 70, loop: null, play }), index);
		expect(song('melody')).toMatch(/^Pick the melody.*70% speed/);
		expect(song('chords')).toMatch(/^Strum the chords/);
		expect(song('fingerstyle')).toMatch(/^Fingerpick/);
	});

	it('tuner: says what the hands do', () => {
		expect(whatToDo(block({ type: 'tool', id: 'tuner', params: {} }), index)).toMatch(
			/turn its peg until it says In tune/
		);
	});
});
