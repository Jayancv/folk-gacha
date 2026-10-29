import { describe, expect, it } from 'vitest';
import type { GameScene } from '../bridge/events';
import { planSceneSwitch } from './routerPlan';

const running = (...scenes: GameScene[]) => (s: GameScene) => scenes.includes(s);

describe('planSceneSwitch', () =>
{
    it('defers while the game is still loading (no table scene running)', () =>
    {
        expect(planSceneSwitch('MergeBoard', running())).toEqual({ kind: 'defer', scene: 'MergeBoard' });
    });

    it('stops the current table scene and starts the requested one', () =>
    {
        expect(planSceneSwitch('MergeBoard', running('PackOpen')))
            .toEqual({ kind: 'switch', stop: ['PackOpen'], start: 'MergeBoard' });
        expect(planSceneSwitch('PackOpen', running('MergeBoard')))
            .toEqual({ kind: 'switch', stop: ['MergeBoard'], start: 'PackOpen' });
    });

    it('does nothing when the requested scene is already showing', () =>
    {
        expect(planSceneSwitch('PackOpen', running('PackOpen')))
            .toEqual({ kind: 'switch', stop: [], start: null });
    });

    it('recovers if both table scenes are somehow running', () =>
    {
        expect(planSceneSwitch('PackOpen', running('PackOpen', 'MergeBoard')))
            .toEqual({ kind: 'switch', stop: ['MergeBoard'], start: null });
    });
});
