import type { Timestamp } from 'firebase/firestore';
import type { PantryItem } from '@/types/pantry';
import { canonicalIngredientKey } from '@/lib/utils/ingredient-matching';
import { PANTRY_CATEGORIES } from '@/lib/utils/pantry-utils';
import {
  classifyIngredientDepartment,
  DEPARTMENT_FALLBACK_ID,
  RAW_INGREDIENT_DEPARTMENTS,
} from '@/lib/utils/ingredient-departments';

/** Mirrors the builder in ingredient-matching.test.ts. */
function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: overrides.name ? `id-${overrides.name}` : 'id-item',
    userId: 'user-1',
    name: 'Prodotto',
    qty: 1,
    unit: 'pz',
    categoryId: 'altro',
    position: 'dispensa',
    purchased: null,
    expires: null,
    min: 0,
    notes: null,
    createdAt: null as unknown as Timestamp,
    updatedAt: null as unknown as Timestamp,
    ...overrides,
  };
}

const KNOWN_DEPARTMENT_IDS = new Set(PANTRY_CATEGORIES.map(c => c.id));

describe('ingredient-departments', () => {
  describe('seed key hygiene', () => {
    const keys = Object.keys(RAW_INGREDIENT_DEPARTMENTS);

    it('every key is lowercase', () => {
      for (const key of keys) expect(key).toBe(key.toLowerCase());
    });

    it('every key is trimmed with single internal spaces', () => {
      for (const key of keys) expect(key).toBe(key.trim().replace(/\s+/g, ' '));
    });

    it('no key carries diacritics', () => {
      for (const key of keys) {
        expect(key.normalize('NFD')).not.toMatch(/[̀-ͯ]/);
      }
    });

    it('every value is a known PANTRY_CATEGORIES slug', () => {
      for (const value of Object.values(RAW_INGREDIENT_DEPARTMENTS)) {
        expect(KNOWN_DEPARTMENT_IDS.has(value)).toBe(true);
      }
    });
  });

  describe('no collisions', () => {
    it('never assigns the same canonical stem to two different departments', () => {
      const byStem = new Map<string, { rawKey: string; dept: string }>();
      for (const [rawKey, dept] of Object.entries(RAW_INGREDIENT_DEPARTMENTS)) {
        const stem = canonicalIngredientKey(rawKey);
        const existing = byStem.get(stem);
        if (existing && existing.dept !== dept) {
          throw new Error(
            `Stem "${stem}" maps to both "${existing.dept}" (from "${existing.rawKey}") and "${dept}" (from "${rawKey}")`
          );
        }
        if (!existing) byStem.set(stem, { rawKey, dept });
      }
    });

    // Guardrails for the documented collisions (module doc comment): the
    // losing word of each pair must never be reintroduced.
    it.each(['pesca', 'grano'])('does not declare the losing word "%s" of a documented collision', word => {
      expect(Object.keys(RAW_INGREDIENT_DEPARTMENTS)).not.toContain(word);
    });
  });

  describe('classifyIngredientDepartment — stem lookup (no pantry match, no override)', () => {
    it.each([
      ['Pomodori', 'verdura'],
      ['pomodori pelati', 'condimenti'],
      ['Funghi', 'verdura'],
      ["fiocchi d'avena", 'cereali'],
      ['pesche', 'pesce'], // documented collision, asserted as known behavior
      ['ingrediente inventato', DEPARTMENT_FALLBACK_ID],
    ])('classifies "%s" as %s', (name, expected) => {
      const result = classifyIngredientDepartment(name, [], {});
      expect(result.departmentId).toBe(expected);
    });

    it('reports source "fallback" for an unrecognized ingredient', () => {
      const result = classifyIngredientDepartment('ingrediente inventato', [], {});
      expect(result.source).toBe('fallback');
    });

    it('reports source "dictionary" for a seeded ingredient', () => {
      const result = classifyIngredientDepartment('pomodoro', [], {});
      expect(result.source).toBe('dictionary');
    });
  });

  describe('precedence chain', () => {
    it('a matched pantry entry wins even if override and dictionary disagree', () => {
      const pantry = [pantryItem({ name: 'Pomodoro', categoryId: 'spezie' })];
      const overrides = { [canonicalIngredientKey('pomodoro')]: 'bevande' };
      const result = classifyIngredientDepartment('pomodoro', pantry, overrides);
      expect(result).toEqual({
        departmentId: 'spezie',
        source: 'pantry',
        canonicalKey: canonicalIngredientKey('pomodoro'),
      });
    });

    it('without a pantry match, the override wins over the dictionary', () => {
      const overrides = { [canonicalIngredientKey('pomodoro')]: 'bevande' };
      const result = classifyIngredientDepartment('pomodoro', [], overrides);
      expect(result.departmentId).toBe('bevande');
      expect(result.source).toBe('override');
    });

    it('an override pointing to an unknown slug is ignored, falling through to the dictionary', () => {
      const overrides = { [canonicalIngredientKey('pomodoro')]: 'reparto-inesistente' };
      const result = classifyIngredientDepartment('pomodoro', [], overrides);
      expect(result.departmentId).toBe('verdura');
      expect(result.source).toBe('dictionary');
    });

    it('a pantry entry with an unknown categoryId does not classify, chain continues', () => {
      const pantry = [pantryItem({ name: 'Pomodoro', categoryId: 'reparto-inesistente' })];
      const result = classifyIngredientDepartment('pomodoro', pantry, {});
      expect(result.departmentId).toBe('verdura');
      expect(result.source).toBe('dictionary');
    });

    it('falls back to altro when nothing matches', () => {
      const result = classifyIngredientDepartment('ingrediente mai visto', [], {});
      expect(result).toEqual({
        departmentId: DEPARTMENT_FALLBACK_ID,
        source: 'fallback',
        canonicalKey: canonicalIngredientKey('ingrediente mai visto'),
      });
    });
  });
});
