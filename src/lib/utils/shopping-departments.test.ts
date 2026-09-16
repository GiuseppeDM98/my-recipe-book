import type { Timestamp } from 'firebase/firestore';
import type { PantryItem } from '@/types/pantry';
import type { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { buildDepartmentSections } from '@/lib/utils/shopping-departments';

function shoppingItem(overrides: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id: 'item-1',
    name: 'Pomodoro',
    displayQuantity: '500 g',
    section: null,
    recipeSource: [],
    isMerged: false,
    isCustom: false,
    ...overrides,
  };
}

function pantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'pantry-1',
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

function adHocRecipe(overrides: Partial<AdHocShoppingRecipe> = {}): AdHocShoppingRecipe {
  return {
    id: 'group-1',
    recipeId: 'recipe-1',
    recipeTitle: 'Ricetta ad hoc',
    addedAt: 0,
    items: [],
    ...overrides,
  };
}

describe('buildDepartmentSections', () => {
  it('orders sections following PANTRY_CATEGORIES order and omits empty departments', () => {
    // 'latticini' comes before 'verdura' in PANTRY_CATEGORIES; items are added
    // in the opposite order to prove the section order is not insertion order.
    const items = [
      shoppingItem({ id: 'i-pomodoro', name: 'Pomodoro', displayQuantity: '500 g' }), // verdura
      shoppingItem({ id: 'i-latte', name: 'Latte', displayQuantity: '1 L' }), // latticini
    ];
    const sections = buildDepartmentSections(items, new Set(), [], [], {});

    expect(sections.map(s => s.id)).toEqual(['latticini', 'verdura']);
  });

  it('sorts rows alphabetically within a department', () => {
    const items = [
      shoppingItem({ id: 'i-zucchina', name: 'Zucchina', displayQuantity: '2 pz' }),
      shoppingItem({ id: 'i-aglio', name: 'Aglio', displayQuantity: '1 pz' }),
    ];
    const sections = buildDepartmentSections(items, new Set(), [], [], {});
    const verdura = sections.find(s => s.id === 'verdura')!;
    expect(verdura.rows.map(r => r.name)).toEqual(['Aglio', 'Zucchina']);
  });

  it('classifies plan items with kind, checked and the recipe/day footnote', () => {
    const items = [
      shoppingItem({
        id: 'i-pomodoro',
        name: 'Pomodoro',
        recipeSource: [{ recipeTitle: 'Sugo', dayIndex: 0, mealType: 'cena' as never }],
      }),
    ];
    const sections = buildDepartmentSections(items, new Set(['i-pomodoro']), [], [], {});
    const row = sections.find(s => s.id === 'verdura')!.rows[0];
    expect(row.kind).toBe('plan');
    expect(row.checked).toBe(true);
    expect(row.footnote).toBe('Sugo (Lun)');
    expect(row.id).toBe('i-pomodoro');
  });

  it('classifies custom items with the manual footnote', () => {
    const items = [shoppingItem({ id: 'i-custom', name: 'Pomodoro', isCustom: true })];
    const sections = buildDepartmentSections(items, new Set(), [], [], {});
    const row = sections.find(s => s.id === 'verdura')!.rows[0];
    expect(row.kind).toBe('custom');
    expect(row.footnote).toBe('Aggiunto manualmente');
  });

  it('classifies ad-hoc items with the recipe title as footnote and a composite rowKey', () => {
    const group = adHocRecipe({
      id: 'group-1',
      recipeTitle: 'Parmigiana',
      items: [{ id: 'item-a', name: 'Melanzana', quantity: '3 pz', checked: true }],
    });
    const sections = buildDepartmentSections([], new Set(), [group], [], {});
    const row = sections.find(s => s.id === 'verdura')!.rows[0];
    expect(row.kind).toBe('adhoc');
    expect(row.footnote).toBe('Parmigiana');
    expect(row.checked).toBe(true);
    expect(row.groupId).toBe('group-1');
    expect(row.id).toBe('item-a');
    expect(row.rowKey).toBe('group-1:item-a');
  });

  it('keeps unique rowKeys for the same ingredient in the plan and in two ad-hoc groups (no cross-block merge)', () => {
    const items = [shoppingItem({ id: 'i-pomodoro', name: 'Pomodoro' })];
    const groups = [
      adHocRecipe({ id: 'group-a', items: [{ id: 'item-1', name: 'Pomodoro', quantity: '2 pz', checked: false }] }),
      adHocRecipe({ id: 'group-b', items: [{ id: 'item-1', name: 'Pomodoro', quantity: '2 pz', checked: false }] }),
    ];
    const sections = buildDepartmentSections(items, new Set(), groups, [], {});
    const rowKeys = sections.find(s => s.id === 'verdura')!.rows.map(r => r.rowKey);
    expect(new Set(rowKeys).size).toBe(rowKeys.length);
    expect(rowKeys).toEqual(expect.arrayContaining(['i-pomodoro', 'group-a:item-1', 'group-b:item-1']));
  });

  it('reports source "pantry" for items matched in the pantry', () => {
    const items = [shoppingItem({ id: 'i-pomodoro', name: 'Pomodoro' })];
    const pantry = [pantryItem({ name: 'Pomodoro', categoryId: 'spezie' })];
    const sections = buildDepartmentSections(items, new Set(), [], pantry, {});
    const row = sections.find(s => s.id === 'spezie')!.rows[0];
    expect(row.source).toBe('pantry');
  });

  it('keeps original item ids so check marks stay valid across views', () => {
    const items = [shoppingItem({ id: 'original-id', name: 'Pomodoro' })];
    const sections = buildDepartmentSections(items, new Set(['original-id']), [], [], {});
    const row = sections.find(s => s.id === 'verdura')!.rows[0];
    expect(row.id).toBe('original-id');
    expect(row.checked).toBe(true);
  });
});
