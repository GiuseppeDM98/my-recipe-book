import { Ingredient, Step, Recipe } from '@/types';

/**
 * Recipe section assignments — shared between /api/reorganize-recipe and the client.
 *
 * DESIGN:
 * A section proposal never carries text, only a mapping from EXISTING item ids to a
 * section name. That is the whole safety property of the reorganize feature: ids,
 * descriptions, quantities and `order` are untouched by construction, so an active
 * cooking session (which tracks checked items by id) and the `{{qty:ingredientId}}`
 * tokens embedded in step text stay valid no matter what the model returns.
 *
 * The server sanitizes a proposal before answering; the client applies the sanitized
 * proposal to build the arrays it writes back. Both sides use the functions here, so a
 * rule can only be enforced in one place.
 */

export interface IngredientSectionAssignment {
  ingredientId: string;
  section: string;
}

export interface StepSectionAssignment {
  stepId: string;
  section: string;
  sectionOrder: number;
}

export interface SectionProposal {
  ingredientSections: IngredientSectionAssignment[];
  stepSections: StepSectionAssignment[];
}

/**
 * A recipe reorganized into fewer than this many ingredient sections is just the flat
 * recipe with an extra header on top — not worth a write or a confirmation dialog.
 */
const MIN_USEFUL_SECTIONS = 2;

/** The name the recipe form writes when it round-trips a section-less recipe. */
const FORM_DEFAULT_SECTION_NAME = 'Ingredienti';

/**
 * Cleans a model-produced proposal into one that is safe to apply.
 *
 * Three things are enforced here, in order:
 * 1. Unknown ids and blank/non-string section names are dropped. The model is told to
 *    reuse the ids verbatim, but a hallucinated id must never reach `updateRecipe`.
 * 2. `sectionOrder` is recomputed from the ORIGINAL step order — the first section to
 *    appear gets 1, the next 2, and so on. The field stays in the response schema
 *    because asking for it makes the model reason about sequence, but the server is
 *    the authority: this removes any dependency on the model's arithmetic.
 * 3. The result is rejected outright when it leaves fewer than two distinct ingredient
 *    sections, which is the "nothing useful to propose" case.
 *
 * @param proposal - Raw assignments as returned by the model
 * @param ingredients - The recipe's ingredients; only their ids are read
 * @param steps - The recipe's steps IN RECIPE ORDER; the order drives sectionOrder
 * @returns The sanitized proposal, or null when there is nothing worth applying
 */
export function sanitizeSectionProposal(
  proposal: SectionProposal,
  ingredients: { id: string }[],
  steps: { id: string }[]
): SectionProposal | null {
  const ingredientIds = new Set(ingredients.map(ingredient => ingredient.id));
  const stepIds = new Set(steps.map(step => step.id));

  const ingredientSections: IngredientSectionAssignment[] = [];
  for (const assignment of proposal.ingredientSections ?? []) {
    const section = normalizeSectionName(assignment?.section);
    if (!section || !ingredientIds.has(assignment.ingredientId)) continue;
    ingredientSections.push({ ingredientId: assignment.ingredientId, section });
  }

  const sectionByStepId = new Map<string, string>();
  for (const assignment of proposal.stepSections ?? []) {
    const section = normalizeSectionName(assignment?.section);
    if (!section || !stepIds.has(assignment.stepId)) continue;
    sectionByStepId.set(assignment.stepId, section);
  }

  // Walk the steps in their real order so section 1 is the one that actually starts first.
  const orderBySection = new Map<string, number>();
  const stepSections: StepSectionAssignment[] = [];
  for (const step of steps) {
    const section = sectionByStepId.get(step.id);
    if (!section) continue;

    if (!orderBySection.has(section)) {
      orderBySection.set(section, orderBySection.size + 1);
    }
    stepSections.push({ stepId: step.id, section, sectionOrder: orderBySection.get(section)! });
  }

  const distinctIngredientSections = new Set(ingredientSections.map(a => a.section));
  if (distinctIngredientSections.size < MIN_USEFUL_SECTIONS) {
    return null;
  }

  return { ingredientSections, stepSections };
}

/**
 * Tells whether a recipe already carries real sections.
 *
 * The single ingredient section named "Ingredienti" is not a real section: the recipe
 * form renames the null section to that label on load and persists it on save, so a
 * plain flat recipe that was once edited comes back wearing it. Treating it as a
 * section would hide the reorganize action from exactly the recipes that need it.
 */
export function hasNamedSections(recipe: Pick<Recipe, 'ingredients' | 'steps'>): boolean {
  const ingredientSections = new Set(
    recipe.ingredients.map(ingredient => ingredient.section).filter((s): s is string => !!s)
  );
  const stepSections = new Set(
    recipe.steps.map(step => step.section).filter((s): s is string => !!s)
  );

  const isFormArtifactOnly =
    ingredientSections.size === 1 && ingredientSections.has(FORM_DEFAULT_SECTION_NAME);

  return (!isFormArtifactOnly && ingredientSections.size > 0) || stepSections.size > 0;
}

/**
 * Builds the ingredient and step arrays to persist from a sanitized proposal.
 *
 * Everything except `section`/`sectionOrder` is carried over untouched — array order
 * included — so the write cannot disturb cooking sessions or quantity tokens.
 *
 * Items the proposal left unassigned get an explicit `null` rather than a missing key:
 * Firestore rejects `undefined`, and these arrays go straight into `updateRecipe`.
 *
 * @returns New arrays; the inputs are not mutated
 */
export function applySectionAssignments(
  ingredients: Ingredient[],
  steps: Step[],
  proposal: SectionProposal
): { ingredients: Ingredient[]; steps: Step[] } {
  const sectionByIngredientId = new Map(
    proposal.ingredientSections.map(a => [a.ingredientId, a.section])
  );
  const assignmentByStepId = new Map(proposal.stepSections.map(a => [a.stepId, a]));

  return {
    ingredients: ingredients.map(ingredient => ({
      ...ingredient,
      section: sectionByIngredientId.get(ingredient.id) ?? null,
    })),
    steps: steps.map(step => {
      const assignment = assignmentByStepId.get(step.id);
      return {
        ...step,
        section: assignment?.section ?? null,
        sectionOrder: assignment?.sectionOrder ?? null,
      };
    }),
  };
}

/**
 * Summarizes a proposal for the preview dialog: one row per section in cooking order,
 * plus a trailing row for whatever the proposal left unassigned.
 *
 * Order comes from `sectionOrder` on the steps, not from the ingredient list. Ingredients
 * are listed in the recipe's original flat order, which says nothing about the components
 * being proposed — ordering by it showed "Per l'assemblaggio" first on a lasagna whose
 * first ingredient was the pasta sheets, i.e. the preview opened with the last thing you
 * do, and disagreed with the recipe it was previewing.
 */
export function summarizeSectionProposal(
  ingredients: { id: string }[],
  steps: { id: string }[],
  proposal: SectionProposal
): { section: string | null; ingredientCount: number; stepCount: number }[] {
  const sectionByIngredientId = new Map(
    proposal.ingredientSections.map(a => [a.ingredientId, a.section])
  );
  const sectionByStepId = new Map(proposal.stepSections.map(a => [a.stepId, a.section]));

  const counts = new Map<string | null, { ingredientCount: number; stepCount: number }>();
  const countsFor = (section: string | null) => {
    if (!counts.has(section)) counts.set(section, { ingredientCount: 0, stepCount: 0 });
    return counts.get(section)!;
  };

  for (const ingredient of ingredients) {
    countsFor(sectionByIngredientId.get(ingredient.id) ?? null).ingredientCount++;
  }
  for (const step of steps) {
    countsFor(sectionByStepId.get(step.id) ?? null).stepCount++;
  }

  // Cooking order, straight from the proposal's own sectionOrder.
  const cookingOrder = new Map<string, number>();
  for (const assignment of proposal.stepSections) {
    if (!cookingOrder.has(assignment.section)) {
      cookingOrder.set(assignment.section, assignment.sectionOrder);
    }
  }
  const rank = (section: string) => cookingOrder.get(section) ?? Number.MAX_SAFE_INTEGER;

  const rows = Array.from(counts, ([section, count]) => ({ section, ...count }));
  const named = rows.filter((row): row is typeof row & { section: string } => row.section !== null);
  // Stable sort keeps ingredient-list order among sections the steps never mention.
  named.sort((a, b) => rank(a.section) - rank(b.section));

  // Unassigned items go last: they are the leftovers, not the first thing to read.
  return [...named, ...rows.filter(row => row.section === null)];
}

/**
 * Returns the recipe's section names in cooking order, read from the steps.
 *
 * WHY THIS EXISTS:
 * Ingredients have no ordering field — their section order is implied by the array, which
 * works for a parsed recipe (the array follows the document) but breaks the moment
 * sections are assigned across an already-flat list. A reorganized lasagna whose first
 * ingredient happens to be "sfoglie" opens its ingredient column with "Per l'assemblaggio"
 * while the procedure, ordered by sectionOrder, correctly starts with "Per il ragù": the
 * two columns of the same recipe contradict each other.
 *
 * Steps DO carry `sectionOrder`, and that order is the order you cook in. Handing it to
 * the ingredient list realigns the two columns without inventing a field on Ingredient or
 * rewriting any stored array.
 *
 * @param steps - The recipe's steps
 * @returns Section names, earliest first; empty when the steps carry no sections
 */
export function orderedSectionNamesFromSteps(steps: Pick<Step, 'section' | 'sectionOrder'>[]): string[] {
  const firstOrderBySection = new Map<string, number>();

  steps.forEach((step, index) => {
    const section = step.section;
    if (!section || firstOrderBySection.has(section)) return;
    // Steps without sectionOrder fall back to their position, the same scale the
    // collapsible lists use for the analogous fallback.
    firstOrderBySection.set(section, step.sectionOrder ?? index);
  });

  return Array.from(firstOrderBySection.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([section]) => section);
}

/** Trims a model-supplied section name, returning null for anything unusable. */
function normalizeSectionName(section: unknown): string | null {
  if (typeof section !== 'string') return null;
  const trimmed = section.trim();
  return trimmed.length > 0 ? trimmed : null;
}
