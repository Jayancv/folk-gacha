import { describe, expect, it } from 'vitest';
import { makeCard, TEMPLATES } from '../dev/fakePack';
import { advance, finishesOnNext, findPair, firstStep, spiritName, stepContent, stepNumber, type TutorialEvent, type TutorialStep } from './tutorialModel';

const template = (id: string) => TEMPLATES.find(t => t.templateId === id)!;

describe('tutorial steps', () =>
{
    it('starts at the pack, or at the Board when today\'s pack is already open', () =>
    {
        expect(firstStep(true)).toBe('open-pack');
        expect(firstStep(false)).toBe('go-board');
    });

    it('walks claim → flip → board → merge → done as the player acts', () =>
    {
        let step: TutorialStep = 'open-pack';
        const events: TutorialEvent[] = ['claimed', 'revealed', 'board-with-pair', 'merged'];
        const seen = events.map(e => (step = advance(step, e)));
        expect(seen).toEqual(['flip', 'go-board', 'merge', 'done']);
        expect(finishesOnNext(step)).toBe(true);
    });

    it('explains when there is no pair to merge yet, then finishes', () =>
    {
        expect(advance('go-board', 'board-without-pair')).toBe('no-pair');
        expect(advance('no-pair', 'next')).toBe('done');
    });

    it('ignores events that don\'t belong to the current step', () =>
    {
        expect(advance('open-pack', 'merged')).toBe('open-pack');
        expect(advance('flip', 'claimed')).toBe('flip');
        expect(advance('merge', 'next')).toBe('merge'); // merging is done by dragging, not by a button
        expect(advance('done', 'claimed')).toBe('done');
    });

    it('numbers the steps for the progress dots', () =>
    {
        expect(stepNumber('open-pack')).toBe(1);
        expect(stepNumber('merge')).toBe(4);
        expect(stepNumber('no-pair')).toBe(4);
        expect(stepNumber('done')).toBe(5);
    });
});

describe('merge hint', () =>
{
    it('finds a pair of the same spirit and level', () =>
    {
        const calf = makeCard(template('gaja-calf'));
        const otherCalf = makeCard(template('gaja-calf'));
        const simha = makeCard(template('simha'));
        const levelTwo = makeCard(template('gaja-calf'), 2);
        expect(findPair([simha, calf, levelTwo, otherCalf])).toBe(calf);
        expect(findPair([simha, calf, levelTwo])).toBeNull();
        expect(findPair([])).toBeNull();
    });

    it('names the spirit plainly, not the full trait name', () =>
    {
        const calf = makeCard(template('gaja-calf'));
        const traited = { ...calf, name: 'Brightly Moonlit Gaja Calf of Kandy', season: { seasonCardId: 's1-0001', setNo: 1, setSize: 1500, title: 'Gaja Calf', subtitle: 'Brightly Moonlit · of Kandy', art: {} as never } };
        expect(spiritName(traited)).toBe('Gaja Calf');
        expect(stepContent('merge', traited).body).toContain('Drag one Gaja Calf onto the other');
        expect(stepContent('merge', null).body).toMatch(/same spirit and level/);
    });

    it('spotlights the claim button and the Board tab, and gives buttons only where needed', () =>
    {
        expect(stepContent('open-pack', null).target).toBe('claim');
        expect(stepContent('go-board', null).target).toBe('tab-MergeBoard');
        expect(stepContent('flip', null).button).toBeUndefined();
        expect(stepContent('no-pair', null).button).toBeDefined();
        expect(stepContent('done', null).button).toBeDefined();
    });
});
