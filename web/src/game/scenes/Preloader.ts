import { Scenes } from 'phaser';
import { loadSpiritArt } from '../cards/spiritImages';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../layout';
import { ResponsiveScene } from '../ResponsiveScene';

export class Preloader extends ResponsiveScene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        super.init();

        const cx = DESIGN_WIDTH / 2;
        const cy = DESIGN_HEIGHT / 2;

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(cx, cy, 468, 32).setStrokeStyle(1, 0xe7b54a);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(cx - 230, cy, 4, 28, 0xe7b54a);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Card faces are drawn at runtime (game/cards/drawCard.ts); sounds are synthesized (src/audio).
    }

    protected build ()
    {
    }

    create ()
    {
        //  Creature art must be decoded before any card face is drawn (faces are cached as textures).
        //  React may have asked for a different table scene while we were loading (see router.ts).
        //  The game can be destroyed while the art loads (React dev mode mounts it twice): then don't start.
        let destroyed = false;
        this.events.once(Scenes.Events.DESTROY, () => { destroyed = true; });
        void loadSpiritArt().then(() =>
        {
            if (!destroyed)
            {
                this.scene.start(this.registry.get('startScene') ?? 'PackOpen');
            }
        });
    }
}
