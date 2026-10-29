import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

// In dev, Vite proxies /api to the Go server (see vite/config.dev.mjs).
// In production, set VITE_API_URL to the deployed API, e.g. https://cardgame-api.fly.dev
const baseUrl = import.meta.env.VITE_API_URL ?? '/api';

export const api = createClient<paths>({ baseUrl, credentials: 'include' });

export type Health = components['schemas']['Health'];
