import { useState, useSyncExternalStore } from 'react';
import { forgetPrompt, getCapturedInstall, subscribeInstall } from './installCapture';
import { installOffer, isIos, type InstallOffer } from './installPolicy';

const DISMISSED_KEY = 'fg.install.dismissedAt';

// localStorage can be missing or throw (private mode, blocked storage): then just don't remember.
function readDismissed (): number | null
{
    try
    {
        const v = Number(localStorage.getItem(DISMISSED_KEY));
        return v > 0 ? v : null;
    }
    catch
    {
        return null;
    }
}

function isStandalone (): boolean
{
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/** Whether to offer installing the app, and the actions for the banner. */
export function useInstallPrompt (): { offer: InstallOffer | null; install: () => void; dismiss: () => void }
{
    const captured = useSyncExternalStore(subscribeInstall, getCapturedInstall);
    const [dismissedAt, setDismissedAt] = useState(readDismissed);

    const dismiss = () =>
    {
        const now = Date.now();
        setDismissedAt(now);
        try
        {
            localStorage.setItem(DISMISSED_KEY, String(now));
        }
        catch
        {
            // Not remembered across visits; hidden for this session anyway.
        }
    };

    const install = () =>
    {
        const prompt = captured.prompt;
        if (!prompt)
        {
            return;
        }
        forgetPrompt();
        void prompt.prompt()
            .then(() => prompt.userChoice)
            .then(({ outcome }) =>
            {
                if (outcome === 'dismissed')
                {
                    dismiss();
                }
            })
            .catch(() => undefined);
    };

    const offer = captured.installed ? null : installOffer({
        standalone: isStandalone(),
        canPrompt: captured.prompt !== null,
        ios: isIos(navigator.userAgent, navigator.maxTouchPoints),
        dismissedAt,
        now: Date.now()
    });

    return { offer, install, dismiss };
}
