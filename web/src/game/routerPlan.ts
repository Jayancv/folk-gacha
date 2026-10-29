import type { GameScene } from './events';

export const TABLE_SCENES: GameScene[] = ['PackOpen', 'MergeBoard'];

export type SwitchPlan =
    | { kind: 'defer'; scene: GameScene }
    | { kind: 'switch'; stop: GameScene[]; start: GameScene | null };

/**
 * What to do when React asks for a table scene. Pure so it can be tested without Phaser.
 * Before any table scene is running (Boot/Preloader), the request is deferred.
 */
export function planSceneSwitch (target: GameScene, isRunning: (scene: GameScene) => boolean): SwitchPlan
{
    if (!TABLE_SCENES.some(isRunning))
    {
        return { kind: 'defer', scene: target };
    }
    return {
        kind: 'switch',
        stop: TABLE_SCENES.filter(s => s !== target && isRunning(s)),
        start: isRunning(target) ? null : target
    };
}
