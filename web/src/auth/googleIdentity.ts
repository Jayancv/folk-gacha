// Google Identity Services (the "Sign in with Google" button), loaded on demand.
// Google returns an ID token (JWT) in `credential`; the Go server verifies it.
// Docs: https://developers.google.com/identity/gsi/web/reference/js-reference

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface CredentialResponse
{
    credential: string;
}

interface GsiButtonOptions
{
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    width?: number;
    logo_alignment?: 'left' | 'center';
}

interface GoogleAccountsId
{
    initialize (config: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        ux_mode?: 'popup' | 'redirect';
        use_fedcm_for_prompt?: boolean;
    }): void;
    renderButton (parent: HTMLElement, options: GsiButtonOptions): void;
    disableAutoSelect (): void;
}

declare global
{
    interface Window
    {
        google?: { accounts: { id: GoogleAccountsId } };
    }
}

let loading: Promise<GoogleAccountsId> | null = null;

/** Loads the Google script once; rejects if it can't load (offline, blocked by an extension). */
export function loadGoogleIdentity (): Promise<GoogleAccountsId>
{
    if (window.google?.accounts?.id)
    {
        return Promise.resolve(window.google.accounts.id);
    }
    loading ??= new Promise((resolve, reject) =>
    {
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not initialise')));
        script.onerror = () =>
        {
            loading = null;
            script.remove();
            reject(new Error('Could not load Google sign-in'));
        };
        document.head.appendChild(script);
    });
    return loading;
}

/** Renders the Google button into `parent`; `onCredential` gets the ID token. */
export async function renderGoogleButton (parent: HTMLElement, clientId: string, onCredential: (credential: string) => void): Promise<void>
{
    const gis = await loadGoogleIdentity();
    gis.initialize({ client_id: clientId, callback: r => onCredential(r.credential), ux_mode: 'popup' });
    gis.renderButton(parent, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
}

/** After sign-out, stop Google from silently picking the same account next time. */
export function forgetGoogleAccount (): void
{
    window.google?.accounts?.id?.disableAutoSelect();
}
