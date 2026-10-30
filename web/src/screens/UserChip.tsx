import { SoundToggle } from '../audio/SoundToggle';
import { useSignOut, type Me } from '../auth/useAuth';

// Signed-in player badge with the sound toggle and sign-out, shown over the game table.
export function UserChip ({ me, onOpenProfile }: { me: Me; onOpenProfile: () => void })
{
    const signOut = useSignOut();
    return (
        <div className="fixed top-2 left-2 flex items-center gap-2 rounded-full bg-black/70 py-1 pr-1 pl-3 text-xs text-white">
            {/* Your full name from Google when there is one (only you see it), else your username. */}
            <button onClick={onOpenProfile} className="max-w-32 truncate underline-offset-2 active:underline" title={`Your profile (@${me.username})`}>
                {me.displayName ?? me.username}
            </button>
            <SoundToggle />
            <button
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[#bba595] active:bg-white/20 disabled:opacity-50"
            >
                Sign out
            </button>
        </div>
    );
}
