import { useState } from 'react';
import { ApiRequestError } from '../../auth/useAuth';
import { MAX_PUBLIC_NAME, nameProblem, tidyName } from './playerName';
import { useSetName } from './useProfile';

// Your own profile: the name other players see on leaderboards, tournament results and your
// profile. `googleName` (private until you choose it here) is offered as a one-tap suggestion.
export function NameEditor ({ username, name, googleName }: { username: string; name?: string; googleName?: string })
{
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(name ?? '');
    const save = useSetName(username);
    const problem = nameProblem(draft);
    const serverError = !save.error
        ? null
        : save.error instanceof ApiRequestError && save.error.code === 'bad_name' ? save.error.message : 'Couldn\'t save. Try again.';

    const submit = (value: string) =>
    {
        save.mutate(tidyName(value), { onSuccess: () => setEditing(false) });
    };

    if (!editing)
    {
        return (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#3b2529] bg-[#1c1215] px-4 py-3">
                <div className="mr-auto min-w-0">
                    <p className="text-xs text-[#bba595]">Name other players see</p>
                    <p className="truncate font-bold">{name ?? <span className="text-[#bba595]">@{username} (your username)</span>}</p>
                </div>
                <button
                    onClick={() =>
                    {
                        setDraft(name ?? '');
                        save.reset();
                        setEditing(true);
                    }}
                    className="shrink-0 rounded-full border border-[#e7b54a]/60 px-3 py-1.5 text-xs font-bold text-[#e7b54a] active:bg-white/5"
                >
                    {name ? 'Change' : 'Choose a name'}
                </button>
            </div>
        );
    }

    const suggestGoogle = googleName && googleName !== name && nameProblem(googleName) === null;
    return (
        <form
            className="mt-4 rounded-xl border border-[#e7b54a]/50 bg-[#1c1215] px-4 py-3"
            onSubmit={e =>
            {
                e.preventDefault();
                if (!problem)
                {
                    submit(draft);
                }
            }}
        >
            <label htmlFor="public-name" className="text-xs text-[#bba595]">Name other players see</label>
            <input
                id="public-name"
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                maxLength={MAX_PUBLIC_NAME + 10}
                placeholder={username}
                autoComplete="nickname"
                aria-invalid={problem !== null}
                aria-describedby="public-name-help"
                className="mt-1 w-full rounded-lg border border-[#3b2529] bg-[#170e10] px-3 py-2 text-base"
            />
            <p id="public-name-help" className={`mt-1.5 text-xs ${problem || serverError ? 'text-rose-300' : 'text-[#bba595]'}`} aria-live="polite">
                {problem ?? serverError ?? `Shown on leaderboards and tournaments next to @${username}. Leave it empty to show your username. Your Google name stays private unless you use it here.`}
            </p>
            {suggestGoogle && (
                <button type="button" onClick={() => setDraft(googleName)} className="mt-2 rounded-full bg-white/5 px-3 py-1 text-xs text-[#e7b54a] active:bg-white/10">
                    Use my Google name: {googleName}
                </button>
            )}
            <div className="mt-3 flex gap-2">
                <button
                    type="submit"
                    disabled={problem !== null || save.isPending}
                    className="flex-[2] rounded-xl bg-[#e7b54a] py-2.5 text-sm font-bold text-[#170e10] active:scale-[0.98] disabled:opacity-40"
                >
                    {save.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditing(false)} className="flex-1 rounded-xl border border-[#3b2529] py-2.5 text-sm font-bold text-[#bba595]">
                    Cancel
                </button>
            </div>
        </form>
    );
}
