// PHASE 1 ONLY: a stand-in for POST /merges so the merge board can be built
// before the server exists. In Phase 2 the server runs this in one transaction
// (check ownership, remove both cards, create the result) and this file goes away.

import { MAX_LEVEL, type CardData } from '../game/cards/model';
import type { MergeResultPayload } from '../game/events';
import { makeCard, TEMPLATES, type Template } from './fakePack';

// Sample recipes from CLAUDE.md, inputs in sorted order like the merge_recipes table.
const RECIPES: { inputs: [string, string]; output: string }[] = [
    { inputs: ['gaja-calf', 'simha'], output: 'gajasinghe' },
    { inputs: ['monara', 'simha'], output: 'serapendiya' }
];

export interface MergeOutcome
{
    result: MergeResultPayload;
    /** The collection after the merge (unchanged on failure). */
    collection: CardData[];
}

export function fakeMerge (
    collection: CardData[],
    requestId: string,
    [aId, bId]: [string, string],
    discovered: Set<string>
): MergeOutcome
{
    const fail = (error: 'no_recipe' | 'max_level' | 'not_owned'): MergeOutcome =>
        ({ result: { requestId, ok: false, error }, collection });

    const a = collection.find(c => c.id === aId);
    const b = collection.find(c => c.id === bId);
    if (!a || !b || a.id === b.id)
    {
        return fail('not_owned');
    }

    let card: CardData;
    let kind: 'level_up' | 'recipe';
    let isNew = false;

    if (a.templateId === b.templateId)
    {
        // Level up: identical card at the same level.
        if (a.level !== b.level)
        {
            return fail('no_recipe');
        }
        if (a.level >= MAX_LEVEL)
        {
            return fail('max_level');
        }
        card = makeCard(template(a.templateId), a.level + 1);
        kind = 'level_up';
    }
    else
    {
        const inputs = [a.templateId, b.templateId].sort();
        const recipe = RECIPES.find(r => r.inputs[0] === inputs[0] && r.inputs[1] === inputs[1]);
        if (!recipe)
        {
            return fail('no_recipe');
        }
        card = makeCard(template(recipe.output), 1);
        kind = 'recipe';
        const key = inputs.join('+');
        isNew = !discovered.has(key);
        discovered.add(key);
    }

    return {
        result: { requestId, ok: true, card, kind, discovered: isNew },
        collection: [...collection.filter(c => c.id !== a.id && c.id !== b.id), card]
    };
}

function template (id: string): Template
{
    const t = TEMPLATES.find(t => t.templateId === id);
    if (!t)
    {
        throw new Error(`unknown template ${id}`);
    }
    return t;
}

// A starting collection with pairs to level up and the ingredients for both recipes.
export function fakeStarterCollection (): CardData[]
{
    const ids = ['gaja-calf', 'gaja-calf', 'gaja-calf', 'malu', 'malu', 'monara', 'monara', 'simha', 'simha', 'ura', 'ura'];
    return ids.map(id => makeCard(template(id)));
}
