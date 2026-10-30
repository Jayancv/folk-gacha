import { bundle, createConfig } from '@redocly/openapi-core';
import { describe, expect, it } from 'vitest';

// The API spec is split across api/paths and api/schemas; both code generators read the
// bundled copy (api/openapi.bundled.yaml). This fails when someone edits the split files
// and forgets `npm run gen:api`, so Go would otherwise build from a stale bundle.
// Paths are relative to web/, where Vitest runs (the web tsconfig has no Node types for node:url).
const api = (file: string) => `../api/${file}`;

describe('api/openapi.bundled.yaml', () =>
{
    it('matches the split spec (run `npm run gen:api` if this fails)', async () =>
    {
        const config = await createConfig({});
        const [split, bundled] = await Promise.all([
            bundle({ ref: api('openapi.yaml'), config }),
            bundle({ ref: api('openapi.bundled.yaml'), config })
        ]);
        expect(split.problems.filter(p => p.severity === 'error')).toEqual([]);
        expect(bundled.bundle.parsed).toEqual(split.bundle.parsed);
    }, 20_000);
});
