import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from './sfx';

const SPEAKER = 'M4 9h4l5-4v14l-5-4H4z';
const WAVES = 'M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11';
const CROSS = 'M16 9l6 6M22 9l-6 6';

// Speaker button: game sounds on/off, remembered on this device.
export function SoundToggle ()
{
    const muted = useSyncExternalStore(subscribeMuted, isMuted);
    return (
        <button
            onClick={() => setMuted(!muted)}
            aria-pressed={!muted}
            aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}
            title={muted ? 'Sound off' : 'Sound on'}
            className="grid h-6 w-6 place-items-center rounded-full text-[#bba595] active:bg-white/20"
        >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={SPEAKER} />
                <path d={muted ? CROSS : WAVES} />
            </svg>
        </button>
    );
}
