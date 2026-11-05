import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

// Requests go to the page's own /api, which forwards them to the Go server: in dev the Vite proxy
// (vite/config.dev.mjs), in production the Render static site's /api/* rewrite. Keeping one origin
// keeps the session cookie first-party, so leave VITE_API_URL unset in production.
const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

export const api = createClient<paths>({ baseUrl, credentials: 'include' });

export type Health = components['schemas']['Health'];
