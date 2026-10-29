import { useEffect, useRef, useState, type FormEvent } from 'react';
import { renderGoogleButton } from '../auth/googleIdentity';
import { signInErrorText, useAuthConfig, useDevSignIn, useGoogleSignIn } from '../auth/useAuth';

// First screen for signed-out players. Google is the real sign-in; the dev box
// only appears when the server runs with DEV_LOGIN=1.
export function SignIn ()
{
    const config = useAuthConfig();
    const google = useGoogleSignIn();
    const dev = useDevSignIn();
    const error = google.error ?? dev.error;
    const busy = google.isPending || dev.isPending;

    return (
        <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-[#170e10] px-6 py-10 text-[#f6eadc]">
            <header className="flex flex-col items-center gap-3 text-center">
                <img src="/apple-touch-icon.png" alt="" width={96} height={96} className="rounded-3xl shadow-lg shadow-black/40" />
                <h1 className="font-serif text-4xl font-bold text-[#e7b54a]">Folk Gacha</h1>
                <p className="text-sm text-[#bba595]">Lanka Mythics · a free pack every day</p>
            </header>

            <section className="flex w-full max-w-xs flex-col items-center gap-4" aria-busy={busy}>
                {config.isPending && <p className="text-sm text-[#bba595]">Loading…</p>}
                {config.isError && (
                    <p className="text-center text-sm text-rose-300">
                        Can't reach the game server.{' '}
                        <button className="underline" onClick={() => config.refetch()}>Retry</button>
                    </p>
                )}

                {config.data?.googleClientId && (
                    <GoogleButton clientId={config.data.googleClientId} onCredential={c => google.mutate(c)} />
                )}
                {config.data && !config.data.googleClientId && !config.data.devLogin && (
                    <p className="text-center text-sm text-[#bba595]">
                        Sign-in isn't configured on this server yet (set GOOGLE_CLIENT_ID).
                    </p>
                )}

                {config.data?.devLogin && <DevSignIn busy={busy} onSubmit={name => dev.mutate(name)} />}

                {error && <p role="alert" className="text-center text-sm text-rose-300">{signInErrorText(error)}</p>}
            </section>
        </main>
    );
}

function GoogleButton ({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void })
{
    const ref = useRef<HTMLDivElement>(null);
    const [failed, setFailed] = useState(false);
    // Keep the latest callback without re-rendering Google's button.
    const latest = useRef(onCredential);
    latest.current = onCredential;

    useEffect(() =>
    {
        if (!ref.current)
        {
            return;
        }
        renderGoogleButton(ref.current, clientId, c => latest.current(c)).catch(() => setFailed(true));
    }, [clientId]);

    if (failed)
    {
        return <p className="text-center text-sm text-rose-300">Google sign-in couldn't load. Check your connection or ad blocker.</p>;
    }
    // Google draws its own button (brand rules); reserve its height to avoid a jump.
    return <div ref={ref} className="flex min-h-11 justify-center" />;
}

function DevSignIn ({ busy, onSubmit }: { busy: boolean; onSubmit: (name: string) => void })
{
    const [name, setName] = useState('');
    const submit = (e: FormEvent) =>
    {
        e.preventDefault();
        if (name.trim())
        {
            onSubmit(name.trim());
        }
    };

    return (
        <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-2xl border border-dashed border-[#3b2529] p-4">
            <label htmlFor="dev-name" className="text-xs font-bold tracking-wide text-[#bba595] uppercase">
                Dev sign-in (local only)
            </label>
            <div className="flex gap-2">
                <input
                    id="dev-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="asha"
                    autoComplete="off"
                    maxLength={20}
                    className="min-w-0 flex-1 rounded-xl border border-[#3b2529] bg-[#22151a] px-3 py-2 text-base text-[#f6eadc] placeholder:text-[#6b5650] focus:border-[#e7b54a] focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={busy || !name.trim()}
                    className="rounded-xl bg-[#e7b54a] px-4 py-2 font-bold text-[#170e10] disabled:opacity-50"
                >
                    Play
                </button>
            </div>
            <p className="text-xs text-[#6b5650]">Each name is its own test player.</p>
        </form>
    );
}
