import { lazy, Suspense } from 'react';
import { AppNotices } from './app/pwa/AppNotices';
import { useMe } from './auth/useAuth';
import { SignIn } from './screens/SignIn';

// The game (and Phaser with it) loads only after sign-in, so the first screen is fast on phones.
const Game = lazy(() => import('./Game'));

function Splash ({ children }: { children: React.ReactNode })
{
    return (
        <div id="app" className="grid place-items-center bg-[#170e10] px-6 text-center text-sm text-[#bba595]">
            {children}
        </div>
    );
}

function App ()
{
    const me = useMe();
    // Offline at launch: the app shell came from the cache, and TanStack Query pauses the
    // profile request until the network is back, then carries on by itself.
    const offlineAtLaunch = me.isPending && me.fetchStatus === 'paused';
    return (
        <>
            <Screen me={me} offlineAtLaunch={offlineAtLaunch} />
            {/* The full-screen offline message already says it; no second notice on top. */}
            <AppNotices showOffline={!offlineAtLaunch} />
        </>
    );
}

function Screen ({ me, offlineAtLaunch }: { me: ReturnType<typeof useMe>; offlineAtLaunch: boolean })
{
    if (offlineAtLaunch)
    {
        return (
            <Splash>
                <p className="max-w-xs">You're offline. Your pack will be waiting: Folk Gacha picks up as soon as you're back online.</p>
            </Splash>
        );
    }
    if (me.isPending)
    {
        return <Splash>Loading…</Splash>;
    }
    if (me.isError)
    {
        return (
            <Splash>
                <p>
                    Can't reach the game server.{' '}
                    <button className="text-[#e7b54a] underline" onClick={() => me.refetch()}>Retry</button>
                </p>
            </Splash>
        );
    }
    if (!me.data)
    {
        return <SignIn />;
    }
    return (
        <Suspense fallback={<Splash>Loading cards…</Splash>}>
            <Game me={me.data} />
        </Suspense>
    );
}

export default App;
