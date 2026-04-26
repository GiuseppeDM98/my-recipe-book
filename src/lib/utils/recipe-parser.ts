import { v4 as uuidv4 } from 'uuid';
import { Ingredient, Step, AISuggestion } from '@/types';
import { getFirebaseAuthHeader } from '@/lib/firebase/client-auth';
import { createStepQuantityToken } from './step-description';

export interface ParsedRecipe {
  title: string;
  ingredients: Ingredient[];
  steps: Step[];
  servings?: number;
  prepTime?: number;
  cookTime?: number;
  notes?: string;
  aiSuggestion?: AISuggestion;
}

/**
 * Parse markdown text from Claude into structured recipe objects
 */
export function parseExtractedRecipes(markdownText: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];

  // Split by recipe separator (---\n---\n)
  const recipeSections = markdownText.split(/---\s*---/).map(s => s.trim()).filter(Boolean);

  for (const recipeSection of recipeSections) {
    try {
      const recipe = parseRecipeSection(recipeSection);
      if (recipe) {
        recipes.push(recipe);
      }
    } catch (error) {
      console.error('Error parsing recipe section:', error);
      // Continue with next recipe
    }
  }

  return recipes;
}

/**
 * Parse a single recipe section
 */
function parseRecipeSection(section: string): ParsedRecipe | null {
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);

  if (lines.length === 0) return null;

  // Extract title — find the first line starting with # (skip leading --- separators)
  const titleIndex = lines.findIndex(l => /^#\s+.+$/.test(l));
  if (titleIndex === -1) return null;

  const titleMatch = lines[titleIndex].match(/^#\s+(.+)$/);
  if (!titleMatch) return null;

  const title = toTitleCase(titleMatch[1].trim());
  const ingredients: Ingredient[] = [];
  const steps: Step[] = [];
  let servings: number | undefined;
  let prepTime: number | undefined;
  let cookTime: number | undefined;
  let notes = '';

  let currentSection = '';
  let currentIngredientSection: string | null = null;
  let currentStepSection: string | null = null;
  let stepOrder = 1;
  let sectionOrder = 0;
  let currentSectionOrder = 0;
  const ingredientReferenceMap = new Map<string, string>();

  for (let i = titleIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    // Check for section headers
    if (line.startsWith('## Ingredienti')) {
      currentSection = 'ingredients';
      // Extract section name (e.g., "## Ingredienti per la pasta" -> "Per la pasta")
      const sectionMatch = line.match(/##\s+Ingredienti(?:\s+(per\s+.+))?$/i);
      currentIngredientSection = capitalizeSectionName(sectionMatch?.[1] || null);
      continue;
    }

    if (line.startsWith('## Procedimento')) {
      currentSection = 'steps';
      // Extract section name (e.g., "## Procedimento per la genovese" -> "Per la genovese")
      const sectionMatch = line.match(/##\s+Procedimento(?:\s+(per\s+.+))?$/i);
      const newStepSection = capitalizeSectionName(sectionMatch?.[1] || null);

      // Track section order: increment when we encounter a new section
      if (newStepSection !== currentStepSection) {
        sectionOrder++;
        currentSectionOrder = sectionOrder;
      }

      currentStepSection = newStepSection;
      continue;
    }

    // Check for metadata — tolerate both "**Label:**" (bold) and "Label:" (plain text)
    // Claude's no-markdown rule sometimes causes it to omit bold markers on metadata headers
    if (/^\*?\*?Porzioni:\*?\*?/i.test(line)) {
      const match = line.match(/Porzioni[*:]+\s*(\d+)/i);
      if (match) servings = parseInt(match[1]);
      continue;
    }

    if (/^\*?\*?Tempo di preparazione:/i.test(line)) {
      const match = line.match(/Tempo di preparazione[*:]+\s*(.+)/i);
      if (match) {
        prepTime = parseTimeToMinutes(match[1]);
      }
      continue;
    }

    if (/^\*?\*?Tempo di cottura/i.test(line)) {
      const match = line.match(/Tempo di cottura[^:]*[*:]+\s*(.+)/i);
      if (match) {
        cookTime = parseTimeToMinutes(match[1]);
      }
      continue;
    }

    if (/^\*?\*?Note aggiuntive:/i.test(line)) {
      const notesText = line.replace(/\*?\*?Note aggiuntive:\*?\*?\s*/i, '');
      if (notesText) notes += notesText + '\n';
      continue;
    }

    // Parse ingredients
    if (currentSection === 'ingredients') {
      // Skip separator lines
      if (line === '---') continue;

      // Parse ingredient line (format: "Name, quantity" or "Name quantity")
      // Common patterns: "Farina 500 g", "Sale q.b.", "Olio EVO"
      const parsedIngredient = parseIngredientLine(line, currentIngredientSection);
      if (parsedIngredient) {
        ingredients.push(parsedIngredient.ingredient);

        if (parsedIngredient.aiReference) {
          ingredientReferenceMap.set(parsedIngredient.aiReference, parsedIngredient.ingredient.id);
        }
      }
    }

    // Parse steps
    if (currentSection === 'steps') {
      // Skip separator lines
      if (line === '---') continue;

      // Parse step line (starts with - or a number)
      if (line.startsWith('-') || line.match(/^\d+\./)) {
        const rawDescription = stripMarkdown(line.replace(/^-\s*/, '').replace(/^\d+\.\s*/, '').trim());
        if (rawDescription) {
          const { description, duration } = extractStepDuration(rawDescription);
          steps.push({
            id: uuidv4(),
            order: stepOrder++,
            description,
            section: currentStepSection || null,
            sectionOrder: currentSectionOrder,
            duration,
          });
        }
      } else {
        // Continuation of previous step or note
        if (steps.length > 0 && !line.startsWith('**')) {
          steps[steps.length - 1].description += ' ' + line;
        } else if (line.startsWith('**') && line.includes('NOTA')) {
          notes += line + '\n';
        }
      }
    }

    // Collect notes
    if (line.startsWith('NOTA BENE:') || line.includes('Suggerimenti:')) {
      notes += line + '\n';
    }
  }

  // Extract equipment from steps and move to notes
  const { cleanedSteps, updatedNotes } = extractEquipmentFromSteps(
    steps,
    notes.trim()
  );
  const stepsWithDynamicQuantityTokens = cleanedSteps.map(step => ({
    ...step,
    description: replaceAiQuantityReferences(step.description, ingredientReferenceMap),
  }));

  return {
    title,
    ingredients,
    steps: stepsWithDynamicQuantityTokens,
    servings,
    prepTime,
    cookTime,
    notes: updatedNotes || undefined,
  };
}

/**
 * Parse ingredient line into structured format
 */
function parseIngredientLine(
  line: string,
  section: string | null
): { ingredient: Ingredient; aiReference: string | null } | null {
  // Remove leading bullets/dashes and strip markdown formatting
  line = stripMarkdown(line.replace(/^[-•]\s*/, '').trim());

  if (!line || line.length < 2) return null;

  const aiReferenceMatch = line.match(/^\[ING:(\d+)\]\s*/i);
  const aiReference = aiReferenceMatch ? aiReferenceMatch[1] : null;
  if (aiReferenceMatch) {
    line = line.replace(/^\[ING:(\d+)\]\s*/i, '').trim();
  }

  // Strategy 1: comma split — "Pasta, 200 g" (preferred output from format-recipe prompt)
  let parts = line.split(',').map(p => p.trim());

  if (parts.length >= 2) {
    return {
      ingredient: {
        id: uuidv4(),
        name: parts[0],
        quantity: parts.slice(1).join(', '),
        section: section || null,
      },
      aiReference,
    };
  }

  // Strategy 2: colon split — "Riso Carnaroli: 280g", "Cipolla bianca: 1 piccola" (common in PDF output)
  const colonParts = line.split(':').map(p => p.trim());
  if (colonParts.length === 2 && colonParts[0] && colonParts[1]) {
    return {
      ingredient: {
        id: uuidv4(),
        name: colonParts[0],
        quantity: colonParts[1],
        section: section || null,
      },
      aiReference,
    };
  }

  // Strategy 3: quantity-first — "500 g di farina", "q.b. di sale" (old text-extracted recipes)
  // Matches a leading measurement unit or q.b., optionally followed by "di"/"d'"
  const qtyFirstMatch = line.match(
    /^([\d,\.]+\s*(?:g|kg|ml|l|cl|cucchiai[oa]?|cucchiaini?|pezzi?|spicchi?|rametti?|fette?|foglie?|mazzetti?|litri?)|q\.b\.?)\s+(?:d[i']\s*)?(.+)$/i
  );
  if (qtyFirstMatch) {
    return {
      ingredient: {
        id: uuidv4(),
        name: qtyFirstMatch[2].trim(),
        quantity: qtyFirstMatch[1].trim(),
        section: section || null,
      },
      aiReference,
    };
  }

  // Strategy 4: quantity at end of string — "Farina 500 g", "Sale q.b." (legacy regex)
  // Patterns: "500 g", "1 kg", "q.b.", "1 cucchiaio", "100-150 g"
  const quantityMatch = line.match(/^(.+?)\s+([\d\-]+\s*(?:g|kg|ml|l|cucchiai?|cucchiaini?|pezzi?|spicchi?|rametti?)(?:\s*circa)?|q\.?b\.?)$/i);

  if (quantityMatch) {
    return {
      ingredient: {
        id: uuidv4(),
        name: quantityMatch[1].trim(),
        quantity: quantityMatch[2].trim(),
        section: section || null,
      },
      aiReference,
    };
  }

  // No quantity found, treat whole line as name with empty quantity
  return {
    ingredient: {
      id: uuidv4(),
      name: line,
      quantity: '',
      section: section || null,
    },
    aiReference,
  };
}

/**
 * Extracts step duration from a raw step description string.
 *
 * Two-pass strategy:
 * 1. Explicit AI token [DUR:N] — authoritative, stripped from the description text
 * 2. Italian regex heuristic — fallback for steps without a [DUR:] token
 *    (handles existing recipes and any AI output that omitted the token)
 *
 * Regex rules:
 * - Range "10-15 minuti" → higher value (conservative: assumes user will wait the full time)
 * - Hours converted to minutes ("1 ora" → 60)
 * - Combined "1 ora e 30 min" → 90
 * - Seconds rounded up to 1 min (rarely used in recipes, but handled)
 * - Returns null when no single clear time is found (prevents false positives)
 *
 * Exported so the recipe form can reuse the same logic for the
 * "Auto-rileva durate" action on already-saved recipes.
 *
 * @returns cleaned description (token stripped) and duration in minutes or null
 */
export function extractStepDuration(raw: string): { description: string; duration: number | null } {
  // Pass 1: explicit [DUR:N] token emitted by the AI prompt
  const durMatch = raw.match(/\[DUR:(\d+)\]/i);
  if (durMatch) {
    const duration = Math.max(1, parseInt(durMatch[1], 10));
    const description = raw.replace(/\s*\[DUR:\d+\]/i, '').trim();
    return { description, duration };
  }

  // Pass 2: Italian time pattern heuristics
  const text = raw.toLowerCase();

  // Range: "10-15 minuti" or "10-15 min" → take the higher value
  const rangeMatch = text.match(/(\d+)-(\d+)\s*(?:minuti|minuto|min)\b/);
  if (rangeMatch) {
    return { description: raw, duration: parseInt(rangeMatch[2], 10) };
  }

  // Combined: "1 ora e 30 minuti" → hours*60 + minutes
  const combinedMatch = text.match(/(\d+)\s*or[ae]\s*(?:e\s*)?(\d+)\s*(?:minuti|minuto|min)\b/);
  if (combinedMatch) {
    return {
      description: raw,
      duration: parseInt(combinedMatch[1], 10) * 60 + parseInt(combinedMatch[2], 10),
    };
  }

  // Hours only: "1 ora", "2 ore"
  const hourMatch = text.match(/(\d+)\s*or[ae]\b/);
  if (hourMatch) {
    return { description: raw, duration: parseInt(hourMatch[1], 10) * 60 };
  }

  // Minutes: "10 minuti", "5 min"
  const minuteMatch = text.match(/(\d+)\s*(?:minuti|minuto|min)\b/);
  if (minuteMatch) {
    return { description: raw, duration: parseInt(minuteMatch[1], 10) };
  }

  // Seconds: "30 secondi" → ceil to 1 min minimum
  const secondMatch = text.match(/(\d+)\s*secondi\b/);
  if (secondMatch) {
    return { description: raw, duration: Math.ceil(parseInt(secondMatch[1], 10) / 60) || 1 };
  }

  return { description: raw, duration: null };
}

/**
 * Convert AI step references like [QTY:3] into internal dynamic quantity tokens.
 *
 * The AI never knows the final Ingredient.id because ids are generated locally
 * during parsing. We bridge that gap by asking the model for stable ordinal
 * references, then rewrite them here once the ingredient ids exist.
 */
function replaceAiQuantityReferences(
  description: string,
  ingredientReferenceMap: Map<string, string>
): string {
  return description.replace(/\[QTY:(\d+)\]/gi, (match, referenceKey: string) => {
    const ingredientId = ingredientReferenceMap.get(referenceKey);
    // Strip unresolvable tokens rather than leaving raw [QTY:n] in storage.
    // The AI prompt guarantees ingredient names are always written in the step text,
    // so the token is supplementary — dropping it keeps the text readable.
    return ingredientId ? createStepQuantityToken(ingredientId) : '';
  });
}

/**
 * Convert time string to minutes
 */
function parseTimeToMinutes(timeStr: string): number {
  const normalized = timeStr.toLowerCase().trim();

  // Handle "X ora/ore"
  const hourMatch = normalized.match(/(\d+)\s*ora?/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60;
  }

  // Handle "X min/minuti"
  const minMatch = normalized.match(/(\d+)\s*min/);
  if (minMatch) {
    return parseInt(minMatch[1]);
  }

  // Handle combined "X ore Y min"
  const combinedMatch = normalized.match(/(\d+)\s*ora?.*?(\d+)\s*min/);
  if (combinedMatch) {
    return parseInt(combinedMatch[1]) * 60 + parseInt(combinedMatch[2]);
  }

  return 0;
}

/**
 * Capitalize first letter of section name if it starts with "per"
 * Examples:
 *   "per la genovese" → "Per la genovese"
 *   "Per la pasta" → "Per la pasta" (unchanged)
 *   "PER la genovese" → "Per la genovese" (normalized)
 *   "La pasta" → "La pasta" (unchanged, doesn't start with "per")
 */
function capitalizeSectionName(sectionName: string | null): string | null {
  if (!sectionName) return null;

  // If starts with "per " (any case), normalize to "Per " with capital P
  if (sectionName.toLowerCase().startsWith('per ')) {
    return 'Per' + sectionName.substring(3);
  }

  return sectionName;
}

/**
 * Strip markdown inline formatting from a string.
 *
 * Claude occasionally wraps labels in bold (**Fase 1:**) or italic (*nota*).
 * The app stores plain text and doesn't render markdown in recipe fields,
 * so we clean these up at parse time rather than in the UI.
 *
 * Only removes inline formatting (** and *); structural markdown like
 * headers (##) and bullet points (-) are intentionally kept for parsing.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** → bold
    .replace(/\*(.+?)\*/g, '$1');      // *italic* → italic
}

/**
 * Convert text to Title Case (only first letter capitalized)
 * Examples:
 *   "PATATE AL FORNO" → "Patate al forno"
 *   "BISCOTTI LINZER" → "Biscotti linzer"
 *   "Sablé ai lamponi" → "Sablé ai lamponi" (unchanged)
 */
function toTitleCase(text: string): string {
  if (!text) return text;

  // Convert to lowercase first
  const lower = text.toLowerCase();

  // Capitalize only the first character
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Extract equipment information from steps and move to notes
 * Looks for "Attrezzature:" or "Attrezzature necessarie:" in step descriptions and extracts them
 */
function extractEquipmentFromSteps(
  steps: Step[],
  currentNotes: string
): { cleanedSteps: Step[]; updatedNotes: string } {
  const allEquipment: string[] = [];
  const cleanedSteps: Step[] = [];

  for (const step of steps) {
    // Look for "Attrezzature:" or "Attrezzature necessarie:" pattern (case-insensitive)
    const match = step.description.match(/\s*Attrezzature(?:\s+necessarie)?:\s*(.+)/i);

    if (match) {
      // Extract the equipment list (everything after the colon)
      const equipmentList = match[1].trim();

      // Split by comma and/or "e" to separate individual equipment items
      const equipmentItems = equipmentList
        .split(/,|\se\s/)
        .map(item => item.trim())
        .filter(item => item.length > 0);

      allEquipment.push(...equipmentItems);

      // Clean the step by removing the equipment part
      const cleanedDescription = step.description
        .substring(0, step.description.toLowerCase().search(/attrezzature(?:\s+necessarie)?:/))
        .trim();

      // Only keep the step if there's actual content left
      if (cleanedDescription.length > 10) {
        cleanedSteps.push({
          ...step,
          description: cleanedDescription,
        });
      }
      // If the step is too short after cleaning, it means it was only equipment
      // so we don't add it to cleanedSteps
    } else {
      // No equipment found in this step, keep it as is
      cleanedSteps.push(step);
    }
  }

  // Recalculate order for remaining steps
  cleanedSteps.forEach((step, index) => {
    step.order = index + 1;
  });

  // Add equipment to notes if any were found
  let updatedNotes = currentNotes;
  if (allEquipment.length > 0) {
    const equipmentSection = 'Attrezzature necessarie:\n' +
      allEquipment.map(item => `- ${item}`).join('\n');
    updatedNotes = currentNotes
      ? `${currentNotes}\n\n${equipmentSection}`
      : equipmentSection;
  }

  return {
    cleanedSteps,
    updatedNotes,
  };
}

/**
 * Get AI suggestions for category and season for a recipe
 */
export async function getAISuggestionForRecipe(
  recipeTitle: string,
  ingredients: Ingredient[],
  userCategories: { name: string }[]
): Promise<AISuggestion | null> {
  try {
    const ingredientNames = ingredients.map(ing => ing.name).filter(Boolean);

    const response = await fetch('/api/suggest-category', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await getFirebaseAuthHeader({ forceRefresh: true })),
      },
      body: JSON.stringify({
        recipeTitle,
        ingredients: ingredientNames,
        userCategories,
      }),
    });

    if (!response.ok) {
      console.error('Error getting AI suggestion:', response.statusText);
      return null;
    }

    const data = await response.json();
    return data.suggestion;
  } catch (error) {
    console.error('Error getting AI suggestion:', error);
    return null;
  }
}
