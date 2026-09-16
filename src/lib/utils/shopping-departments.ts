import { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { PantryItem } from '@/types/pantry';
import { PANTRY_CATEGORIES } from './pantry-utils';
import { classifyIngredientDepartment, DepartmentSource } from './ingredient-departments';

/** Shared day labels — single source, imported by ShoppingSection.tsx too. */
export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export interface DepartmentRow {
  /** Unique render key: plan/custom = item.id; ad-hoc = `${groupId}:${itemId}`. */
  rowKey: string;
  kind: 'plan' | 'custom' | 'adhoc';
  /** Item id in its own domain (ShoppingItem.id or AdHocShoppingItem.id) — UNCHANGED, so check marks stay valid. */
  id: string;
  /** Only kind 'adhoc'. */
  groupId?: string;
  name: string;
  quantity: string;
  checked: boolean;
  footnote?: string;
  canonicalKey: string;
  source: DepartmentSource;
}

export interface DepartmentSectionModel {
  id: string;
  name: string;
  color: string;
  rows: DepartmentRow[];
}

/**
 * Builds the per-department sections in PANTRY_CATEGORIES order, OMITTING
 * empty departments. Rows in alphabetical order (localeCompare 'it').
 *
 * `items` and `adHocRecipes` are expected to already be the SAME sets the
 * per-recipe view renders (trivial items filtered, "Hai già in casa" items
 * excluded by the caller) — this function never re-filters them, so the two
 * views can never disagree on which rows exist.
 *
 * NO cross-block merge: the same ingredient present in the plan and in an
 * ad-hoc group produces two rows in the same department (explicit inherited
 * choice, AGENTS.md §9).
 */
export function buildDepartmentSections(
  items: ShoppingItem[],
  checkedIds: Set<string>,
  adHocRecipes: AdHocShoppingRecipe[],
  pantryItems: PantryItem[],
  overrides: Record<string, string>
): DepartmentSectionModel[] {
  const rowsByDept = new Map<string, DepartmentRow[]>();

  const push = (row: DepartmentRow, departmentId: string) => {
    if (!rowsByDept.has(departmentId)) rowsByDept.set(departmentId, []);
    rowsByDept.get(departmentId)!.push(row);
  };

  for (const item of items) {
    const c = classifyIngredientDepartment(item.name, pantryItems, overrides);
    push(
      {
        rowKey: item.id,
        kind: item.isCustom ? 'custom' : 'plan',
        id: item.id,
        name: item.name,
        quantity: item.displayQuantity,
        checked: checkedIds.has(item.id),
        footnote: item.isCustom
          ? 'Aggiunto manualmente'
          : item.recipeSource
              .map(s => `${s.recipeTitle} (${DAY_LABELS[s.dayIndex] ?? s.dayIndex})`)
              .join(', ') || undefined,
        canonicalKey: c.canonicalKey,
        source: c.source,
      },
      c.departmentId
    );
  }

  for (const group of adHocRecipes) {
    for (const item of group.items) {
      const c = classifyIngredientDepartment(item.name, pantryItems, overrides);
      push(
        {
          rowKey: `${group.id}:${item.id}`,
          kind: 'adhoc',
          id: item.id,
          groupId: group.id,
          name: item.name,
          quantity: item.quantity,
          checked: item.checked,
          footnote: group.recipeTitle,
          canonicalKey: c.canonicalKey,
          source: c.source,
        },
        c.departmentId
      );
    }
  }

  return PANTRY_CATEGORIES.filter(cat => rowsByDept.has(cat.id)).map(cat => ({
    id: cat.id,
    name: cat.name,
    color: cat.color,
    rows: rowsByDept.get(cat.id)!.sort((a, b) => a.name.localeCompare(b.name, 'it')),
  }));
}
