import { describe, expect, it } from 'vitest';
import { cardScore, makeCard, TEMPLATES } from './fakePack';
import { MAX_LEVEL } from '../game/cards/model';
import { fakeMerge } from './fakeMerge';

const t = (id: string) => TEMPLATES.find(t => t.templateId === id)!;

describe('fakeMerge', () =>
{
    it('levels up two identical cards and replaces them with one', () =>
    {
        const a = makeCard(t('gaja-calf'));
        const b = makeCard(t('gaja-calf'));
        const other = makeCard(t('malu'));
        const { result, collection } = fakeMerge([a, b, other], 'r1', [a.id, b.id], new Set());

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.kind).toBe('level_up');
        expect(result.card.templateId).toBe('gaja-calf');
        expect(result.card.level).toBe(2);
        expect(result.card.score).toBe(cardScore('common', 2));
        expect(collection.map(c => c.id)).toEqual([other.id, result.card.id]);
    });

    it('refuses identical cards at different levels', () =>
    {
        const a = makeCard(t('malu'), 1);
        const b = makeCard(t('malu'), 2);
        const { result, collection } = fakeMerge([a, b], 'r', [a.id, b.id], new Set());
        expect(result).toEqual({ requestId: 'r', ok: false, error: 'no_recipe' });
        expect(collection).toHaveLength(2);
    });

    it('refuses to level past the maximum', () =>
    {
        const a = makeCard(t('malu'), MAX_LEVEL);
        const b = makeCard(t('malu'), MAX_LEVEL);
        expect(fakeMerge([a, b], 'r', [a.id, b.id], new Set()).result).toMatchObject({ ok: false, error: 'max_level' });
    });

    it('makes a recipe in either order and marks only the first as discovered', () =>
    {
        const discovered = new Set<string>();
        const gaja = makeCard(t('gaja-calf'));
        const simha = makeCard(t('simha'));
        const first = fakeMerge([gaja, simha], 'r1', [simha.id, gaja.id], discovered).result;
        expect(first).toMatchObject({ ok: true, kind: 'recipe', discovered: true });
        if (first.ok) expect(first.card.templateId).toBe('gajasinghe');

        const gaja2 = makeCard(t('gaja-calf'));
        const simha2 = makeCard(t('simha'));
        expect(fakeMerge([gaja2, simha2], 'r2', [gaja2.id, simha2.id], discovered).result)
            .toMatchObject({ ok: true, discovered: false });
    });

    it('fails for pairs with no recipe', () =>
    {
        const a = makeCard(t('malu'));
        const b = makeCard(t('ura'));
        expect(fakeMerge([a, b], 'r', [a.id, b.id], new Set()).result).toMatchObject({ ok: false, error: 'no_recipe' });
    });

    it('fails for cards not in the collection or a card merged with itself', () =>
    {
        const a = makeCard(t('malu'));
        expect(fakeMerge([a], 'r', [a.id, 'missing'], new Set()).result).toMatchObject({ ok: false, error: 'not_owned' });
        expect(fakeMerge([a], 'r', [a.id, a.id], new Set()).result).toMatchObject({ ok: false, error: 'not_owned' });
    });
});
