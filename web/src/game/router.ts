import { Core, type Game } from 'phaser';
import { EventBus } from '../bridge/EventBus';
import { GameEvents, type SetPausedPayload, type SwitchScenePayload } from '../bridge/events';
import { planSceneSwitch } from './routerPlan';

// React picks which table scene is showing (it owns navigation); this swaps them.
export function attachSceneRouter (game: Game): void
{
    const onSwitch = ({ scene }: SwitchScenePayload) =>
    {
        const manager = game.scene;
        const plan = planSceneSwitch(scene, key => manager.isActive(key) || manager.isPaused(key));
        if (plan.kind === 'defer')
        {
            // Still in Boot/Preloader: start there once loading finishes.
            game.registry.set('startScene', plan.scene);
            return;
        }
        plan.stop.forEach(key => manager.stop(key));
        if (plan.start)
        {
            manager.start(plan.start);
        }
    };

    // sleep() stops requestAnimationFrame entirely; tab hide/show (pause/resume) doesn't restart it.
    const onSetPaused = ({ paused }: SetPausedPayload) =>
    {
        if (paused)
        {
            game.loop.sleep();
        }
        else
        {
            // Without this the first frame's delta spans the whole sleep and tweens jump.
            game.loop.resetDelta();
            game.loop.wake();
        }
    };

    EventBus.on(GameEvents.SwitchScene, onSwitch);
    EventBus.on(GameEvents.SetPaused, onSetPaused);
    game.events.once(Core.Events.DESTROY, () =>
    {
        EventBus.off(GameEvents.SwitchScene, onSwitch);
        EventBus.off(GameEvents.SetPaused, onSetPaused);
    });
}
