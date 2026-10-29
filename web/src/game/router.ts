import { Core, type Game } from 'phaser';
import { EventBus } from './EventBus';
import { GameEvents, type GameScene } from './events';
import { planSceneSwitch } from './routerPlan';

// React picks which table scene is showing (it owns navigation); this swaps them.
export function attachSceneRouter (game: Game): void
{
    const onSwitch = ({ scene }: { scene: GameScene }) =>
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

    EventBus.on(GameEvents.SwitchScene, onSwitch);
    game.events.once(Core.Events.DESTROY, () => EventBus.off(GameEvents.SwitchScene, onSwitch));
}
