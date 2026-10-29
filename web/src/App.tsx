import { lazy, Suspense } from 'react';
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
