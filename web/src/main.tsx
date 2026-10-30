import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { startInstallCapture } from './app/install/installCapture';
import { startServiceWorker } from './app/pwa/serviceWorker';
import './index.css';

// Server data (profile, and later the collection and leaderboard) lives in TanStack Query.
// Before anything else: the browser's install dialog arrives once, early (see installCapture).
startInstallCapture();
// The offline app shell (src/sw/sw.ts); off in dev.
startServiceWorker();
// TanStack Query assumes it starts online and only listens for online/offline events, so an
// installed app opened with no network would retry as if online. Start from the real state:
// requests then pause while offline and resume by themselves when the network is back.
onlineManager.setOnline(navigator.onLine);

const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false } }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </React.StrictMode>,
)
