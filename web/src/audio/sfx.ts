// Plays the game sounds (sounds.ts) with the Web Audio API. No Phaser here: scenes
// call sfx.play(...), and React's sound button calls setMuted. Silent until the first
// tap (browsers only allow audio after one), and whenever the player muted it.

import type { Rarity } from '../game/cards/model';
import { anticipationSound, CHARGE, soundFor, type Sound, type SoundName } from './sounds';

const MUTED_KEY = 'fg.sound.muted';
const MASTER_GAIN = 0.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = readMuted();
const listeners = new Set<() => void>();

// localStorage can be missing or throw (private mode, blocked storage): then sound is on.
function readMuted (): boolean
{
    try
    {
        return localStorage.getItem(MUTED_KEY) === '1';
    }
    catch
    {
        return false;
    }
}

function audio (): AudioContext | null
{
    if (ctx)
    {
        return ctx;
    }
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor)
    {
        return null;
    }
    // iPhone: respect the silent switch and don't stop the player's music (Safari 16.4+).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session)
    {
        session.type = 'ambient';
    }
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    return ctx;
}

/** Starts audio on the first tap or key press (browsers block sound before one). Call once at startup. */
export function unlockAudioOnFirstGesture (): void
{
    const events = ['pointerdown', 'keydown', 'touchend'];
    const unlock = () =>
    {
        // resume() settles asynchronously; keep listening until audio is really running.
        void audio()?.resume().then(() =>
        {
            if (ctx?.state === 'running')
            {
                events.forEach(e => window.removeEventListener(e, unlock, true));
            }
        }, () => undefined);
    };
    events.forEach(e => window.addEventListener(e, unlock, true));
}

function ready (): AudioContext | null
{
    if (muted || !ctx || ctx.state !== 'running')
    {
        return null;
    }
    return ctx;
}

function noiseBuffer (c: AudioContext): AudioBuffer
{
    if (!noise)
    {
        noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++)
        {
            data[i] = Math.random() * 2 - 1;
        }
    }
    return noise;
}

function schedule (c: AudioContext, sound: Sound): void
{
    const now = c.currentTime + 0.005;
    for (const t of sound)
    {
        const start = now + t.at;
        const end = start + t.duration;
        const env = c.createGain();
        const attack = Math.min(t.attack ?? 0.004, t.duration * 0.9);
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(t.gain, start + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, end);
        env.connect(master!);

        if (t.wave === 'noise')
        {
            const src = c.createBufferSource();
            src.buffer = noiseBuffer(c);
            src.loop = true;
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.Q.value = t.q ?? 1;
            filter.frequency.setValueAtTime(t.freq, start);
            if (t.freqEnd)
            {
                filter.frequency.exponentialRampToValueAtTime(t.freqEnd, end);
            }
            src.connect(filter).connect(env);
            src.start(start, Math.random() * 0.5);
            src.stop(end + 0.02);
        }
        else
        {
            const osc = c.createOscillator();
            osc.type = t.wave;
            osc.frequency.setValueAtTime(t.freq, start);
            if (t.freqEnd)
            {
                osc.frequency.exponentialRampToValueAtTime(t.freqEnd, end);
            }
            osc.connect(env);
            osc.start(start);
            osc.stop(end + 0.02);
        }
    }
}

/** Plays a sound now (reveals by rarity). Does nothing while muted or before the first tap. */
export function play (name: SoundName, rarity?: Rarity): void
{
    const c = ready();
    if (c)
    {
        schedule(c, soundFor(name, rarity));
    }
}

/** The build-up before a Rare-or-better flip, as long as the tremble. */
export function playAnticipation (seconds: number, rarity: Rarity): void
{
    const c = ready();
    if (c)
    {
        schedule(c, anticipationSound(seconds, rarity));
    }
}

/** The rising hum while a merge waits for the server. Call the returned function to stop it. */
export function startCharge (): () => void
{
    const c = ready();
    if (!c)
    {
        return () => undefined;
    }
    const now = c.currentTime;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(CHARGE.gain, now + 0.15);
    env.connect(master!);

    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(CHARGE.from, now);
    osc.frequency.exponentialRampToValueAtTime(CHARGE.to, now + CHARGE.seconds);
    const soften = c.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 1400;

    // A fast wobble on the volume makes it feel like energy building.
    const tremolo = c.createOscillator();
    const depth = c.createGain();
    tremolo.frequency.value = CHARGE.tremoloHz;
    depth.gain.value = CHARGE.gain * 0.5;
    tremolo.connect(depth).connect(env.gain);

    osc.connect(soften).connect(env);
    osc.start(now);
    tremolo.start(now);

    let stopped = false;
    return () =>
    {
        if (stopped)
        {
            return;
        }
        stopped = true;
        const t = c.currentTime;
        env.gain.cancelScheduledValues(t);
        env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.stop(t + 0.1);
        tremolo.stop(t + 0.1);
    };
}

export const isMuted = (): boolean => muted;

export function setMuted (value: boolean): void
{
    muted = value;
    try
    {
        localStorage.setItem(MUTED_KEY, value ? '1' : '0');
    }
    catch
    {
        // Not remembered across visits.
    }
    listeners.forEach(fn => fn());
}

export function subscribeMuted (fn: () => void): () => void
{
    listeners.add(fn);
    return () => listeners.delete(fn);
}
