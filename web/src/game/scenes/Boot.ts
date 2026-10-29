import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        //  Load anything the Preloader itself needs (e.g. a logo for the loading screen) here.
        //  The Boot Scene has no preloader of its own, so keep it tiny.
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
