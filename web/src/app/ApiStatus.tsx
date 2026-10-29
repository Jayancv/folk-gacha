import { useEffect, useState } from 'react';
import { api, type Health } from '../api/client';

type State = { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'error' };

// Small badge showing whether the web app can reach the API and database.
export function ApiStatus()
{
    const [state, setState] = useState<State>({ kind: 'loading' });

    useEffect(() => {
        // /health returns 503 with a body when the DB is down, so read data or error.
        api.GET('/health')
            .then(({ data, error }) => {
                const health = data ?? (error as Health | undefined);
                setState(health ? { kind: 'ok', health } : { kind: 'error' });
            })
            .catch(() => setState({ kind: 'error' }));
    }, []);

    const label =
        state.kind === 'loading' ? 'API: checking…' :
        state.kind === 'error' ? 'API: unreachable' :
        `API: ${state.health.status} · DB: ${state.health.database}`;

    const color =
        state.kind === 'ok' && state.health.status === 'ok' ? 'bg-emerald-500' :
        state.kind === 'loading' ? 'bg-slate-400' : 'bg-rose-500';

    return (
        <div className="fixed top-2 right-2 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
            <span className={`h-2 w-2 rounded-full ${color}`} />
            {label}
        </div>
    );
}
