'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Recipe, Ingredient, Step, Season } from '@/types';
import { useAuth } from '@/lib/hooks/useAuth';
import { createRecipe, updateRecipe } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { v4 as uuidv4 } from 'uuid';
import { CategorySelector } from './category-selector';
import { SeasonSelector } from './season-selector';
import { ArrowDown, ArrowUp } from 'lucide-react';

/**
 * RecipeForm - Hierarchical ingredient/step editor with flat storage
 *
 * ARCHITECTURE:
 * - UI: Hierarchical structure (sections containing items)
 * - Storage: Flat arrays with section field pointers
 * - Challenge: Maintaining section order while allowing free editing
 *
 * DATA FLOW:
 * 1. Load: Flat array → Group by section → Hierarchical UI state
 * 2. Edit: User modifies hierarchical sections
 * 3. Save: Hierarchical UI state → Flatten → Store
 *
 * TRADE-OFFS:
 * - Hierarchical UI: Better UX, easier section management
 * - Flat storage: Simpler queries, no nested Firestore docs
 * - Cost: Complex transformation logic on mount/save
 */

interface RecipeFormProps {
  recipe?: Recipe; // For edit mode
  mode: 'create' | 'edit';
}

interface IngredientSection {
  id: string;
  name: string | null; // null = "Senza sezione"
  ingredients: Ingredient[];
}

export function RecipeForm({ recipe, mode }: RecipeFormProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState(recipe?.title || '');
  const [description, setDescription] = useState(recipe?.description || '');
  const [servings, setServings] = useState(recipe?.servings || 4);
  const [prepTime, setPrepTime] = useState(recipe?.prepTime || 0);
  const [cookTime, setCookTime] = useState(recipe?.cookTime || 0);
  const [ingredientSections, setIngredientSections] = useState<IngredientSection[]>([]);
  const [steps, setSteps] = useState<Step[]>(recipe?.steps || []);
  const [categoryId, setCategoryId] = useState(recipe?.categoryId || '');
  const [subcategoryId, setSubcategoryId] = useState(recipe?.subcategoryId || '');

  /**
   * Lazy migration from single 'season' to 'seasons' array.
   *
   * When editing old recipe:
   * - If recipe has 'seasons' (new format) → use as-is
   * - If recipe has 'season' (old format) → convert to [season]
   * - Otherwise → empty array
   *
   * WHY LAZY MIGRATION:
   * Avoids need for bulk migration script. Data migrates organically as users
   * edit recipes. Zero deployment risk. Old and new code coexist safely.
   */
  const [seasons, setSeasons] = useState<Season[]>(() => {
    if (recipe?.seasons) return recipe.seasons; // New format
    if (recipe?.season) return [recipe.season]; // Old format → migrate
    return []; // New recipe
  });

  const [loading, setLoading] = useState(false);

  const normalizeStepOrder = (nextSteps: Step[]) =>
    nextSteps.map((step, index) => ({
      ...step,
      order: index + 1,
    }));

  // ========================================
  // Section Management
  // ========================================
  // These functions manage the hierarchical section structure in the UI state

  const addSection = () => {
    // Create new empty section with temp ID (not persisted to database)
    // Temp UUID is for React keys only - sections are identified by name in storage
    const newSection: IngredientSection = {
      id: uuidv4(),
      name: '',
      ingredients: []
    };
    setIngredientSections([...ingredientSections, newSection]);
  };

  const updateSectionName = (sectionId: string, newName: string) => {
    setIngredientSections(sections =>
      sections.map(s => s.id === sectionId ? { ...s, name: newName } : s)
    );
  };

  const removeSection = (sectionId: string) => {
    setIngredientSections(sections => sections.filter(s => s.id !== sectionId));
  };

  // ========================================
  // Ingredient Management
  // ========================================
  // These functions manage ingredients within sections

  const addIngredientToSection = (sectionId: string) => {
    const newIngredient: Ingredient = {
      id: uuidv4(),
      name: '',
      quantity: '',
      section: ''
    };

    setIngredientSections(sections =>
      sections.map(s =>
        s.id === sectionId
          ? { ...s, ingredients: [...s.ingredients, newIngredient] }
          : s
      )
    );
  };

  const updateIngredientInSection = (
    sectionId: string,
    ingredientId: string,
    field: keyof Ingredient,
    value: string
  ) => {
    setIngredientSections(sections =>
      sections.map(s =>
        s.id === sectionId
          ? {
              ...s,
              ingredients: s.ingredients.map(ing =>
                ing.id === ingredientId ? { ...ing, [field]: value } : ing
              )
            }
          : s
      )
    );
  };

  const removeIngredientFromSection = (sectionId: string, ingredientId: string) => {
    setIngredientSections(sections =>
      sections.map(s =>
        s.id === sectionId
          ? { ...s, ingredients: s.ingredients.filter(ing => ing.id !== ingredientId) }
          : s
      )
    );
  };

  // ========================================
  // Initialize: Convert flat ingredient array → hierarchical section structure
  // ========================================
  //
  // ALGORITHM:
  // 1. Group ingredients by section field (Map<sectionName, Ingredient[]>)
  // 2. Handle null section (legacy data or default) → "Ingredienti"
  // 3. Convert Map entries → IngredientSection[] with temp IDs
  // 4. Sort: "Ingredienti" section always first (default section)
  //
  // WHY THIS APPROACH:
  // - Firebase stores flat arrays (no nested documents for sections)
  // - UI needs collapsible sections for better UX
  // - We reconstruct hierarchy client-side from section field
  useEffect(() => {
    if (recipe?.ingredients && recipe.ingredients.length > 0) {
      // Group ingredients by section name
      const sectionsMap = new Map<string | null, Ingredient[]>();

      recipe.ingredients.forEach(ing => {
        const sectionKey = ing.section || null;
        if (!sectionsMap.has(sectionKey)) {
          sectionsMap.set(sectionKey, []);
        }
        sectionsMap.get(sectionKey)!.push(ing);
      });

      // Convert Map to array of sections
      const sections: IngredientSection[] = [];
      sectionsMap.forEach((ings, sectionName) => {
        sections.push({
          id: uuidv4(), // Temporary ID for React keys (not persisted)
          // Normalize null section to "Ingredienti" (default section name)
          name: sectionName === null ? 'Ingredienti' : sectionName,
          ingredients: ings
        });
      });

      // Sort sections: "Ingredienti" always first
      // WHY: Default section should be most accessible for simple recipes
      sections.sort((a, b) => {
        if (a.name === 'Ingredienti') return -1;
        if (b.name === 'Ingredienti') return 1;
        if (a.name === null) return -1; // Legacy null handling (old data might still have null)
        if (b.name === null) return 1;
        return 0;
      });

      setIngredientSections(sections);
    } else {
      // New recipe: initialize with default "Ingredienti" section
      // WHY: Prevents empty state, gives users immediate starting point
      setIngredientSections([{
        id: uuidv4(),
        name: 'Ingredienti',
        ingredients: []
      }]);
    }
  }, [recipe]);

  const addStep = () => {
    setSteps([
      ...steps,
      { id: uuidv4(), order: steps.length + 1, description: '', section: '' }
    ]);
  };

  const updateStep = (id: string, field: keyof Step, value: string | number) => {
    setSteps(steps.map(step =>
      step.id === id ? { ...step, [field]: value } : step
    ));
  };

  const removeStep = (id: string) => {
    setSteps(normalizeStepOrder(steps.filter(step => step.id !== id)));
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= steps.length) return;

    const nextSteps = [...steps];
    const [movedStep] = nextSteps.splice(fromIndex, 1);
    nextSteps.splice(toIndex, 0, movedStep);
    setSteps(normalizeStepOrder(nextSteps));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    try {
      let recipeId = recipe?.id;

      // ========================================
      // Convert hierarchical sections → flat ingredient array for storage
      // ========================================
      //
      // ALGORITHM:
      // 1. Iterate through all sections
      // 2. For each ingredient: copy data + attach section name
      // 3. Empty section names → omit section field (becomes default section)
      // 4. Return flat array for Firestore
      //
      // WHY FLATTEN:
      // - Firestore doesn't support nested arrays efficiently
      // - Flat structure enables simpler queries (filter by ingredient name)
      // - Section grouping is UI concern, not data structure concern
      const flatIngredients: Ingredient[] = [];

      ingredientSections.forEach(section => {
        section.ingredients.forEach(ing => {
          const newIngredient: any = { ...ing };
          // Only add section field if section has a name
          // Empty section name = default section (no field needed)
          if (section.name && section.name.trim()) {
            newIngredient.section = section.name;
          } else {
            delete newIngredient.section; // Explicit removal for clarity
          }
          flatIngredients.push(newIngredient);
        });
      });

      const recipeData: Omit<Recipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title,
        description: description || '',
        servings: servings || 0,
        prepTime: prepTime || 0,
        cookTime: cookTime || 0,
        totalTime: (prepTime || 0) + (cookTime || 0),
        ingredients: flatIngredients,
        steps,
        categoryId: categoryId || '',
        subcategoryId: subcategoryId || '',
        seasons: seasons.length > 0 ? seasons : undefined, // Optional field
        aiSuggested: recipe?.aiSuggested,
        difficulty: recipe?.difficulty || 'facile',
        tags: recipe?.tags || [],
        techniqueIds: recipe?.techniqueIds || [],
        source: recipe?.source || { type: 'manual' },
        notes: recipe?.notes || '',
        images: recipe?.images || [],
      };

      if (mode === 'create') {
        recipeId = await createRecipe(user.uid, recipeData);
      } else if (recipeId) {
        await updateRecipe(recipeId, recipeData);
      }

      router.push(`/ricette/${recipeId}`);
    } catch (error) {
      console.error('Error saving recipe:', error);
      alert('Errore nel salvataggio della ricetta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">Titolo</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="Es. Pasta alla carbonara"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Descrizione</label>
        <textarea
          className="w-full border rounded-md p-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Breve descrizione della ricetta..."
        />
      </div>

      <CategorySelector
        selectedCategoryId={categoryId}
        selectedSubcategoryId={subcategoryId}
        onCategoryChange={setCategoryId}
        onSubcategoryChange={setSubcategoryId}
      />

      <SeasonSelector
        selectedSeasons={seasons}
        onSeasonsChange={setSeasons}
        aiSuggested={recipe?.aiSuggested}
      />

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">Porzioni</label>
          <Input
            type="number"
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
            min={1}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Prep (min)</label>
          <Input
            type="number"
            value={prepTime}
            onChange={(e) => setPrepTime(Number(e.target.value))}
            min={0}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Cottura (min)</label>
          <Input
            type="number"
            value={cookTime}
            onChange={(e) => setCookTime(Number(e.target.value))}
            min={0}
          />
        </div>
      </div>

      {/* Ingredients Section */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <label className="block text-sm font-medium">Ingredienti</label>
          <Button type="button" onClick={addSection} size="sm" variant="outline">
            + Aggiungi Sezione
          </Button>
        </div>

        <div className="space-y-4">
          {ingredientSections.map((section) => (
            <div key={section.id} className="border rounded-lg p-4 bg-gray-50">
              {/* Header Sezione */}
              <div className="flex items-center gap-2 mb-3">
                <>
                  <span className="text-xl">📦</span>
                  <Input
                    value={section.name || ''}
                    onChange={(e) => updateSectionName(section.id, e.target.value)}
                    placeholder="Nome sezione (es. Per la pasta)"
                    className="flex-1 font-semibold bg-white"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => removeSection(section.id)}
                    title="Elimina sezione e tutti i suoi ingredienti"
                  >
                    ✕
                  </Button>
                </>
              </div>

              {/* Lista Ingredienti della sezione */}
              <div className="space-y-2 ml-6">
                {section.ingredients.map((ing) => (
                  <div key={ing.id} className="flex gap-2 items-center bg-white p-2 rounded border">
                    <span className="text-gray-400">•</span>
                    <Input
                      placeholder="Nome ingrediente"
                      value={ing.name}
                      onChange={(e) => updateIngredientInSection(section.id, ing.id, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      placeholder="Quantità"
                      value={ing.quantity}
                      onChange={(e) => updateIngredientInSection(section.id, ing.id, 'quantity', e.target.value)}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIngredientFromSection(section.id, ing.id)}
                      title="Rimuovi ingrediente"
                    >
                      ✕
                    </Button>
                  </div>
                ))}

                {/* Bottone aggiungi ingrediente */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addIngredientToSection(section.id)}
                  className="mt-2 text-primary w-full"
                >
                  + Aggiungi ingrediente
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Steps Section */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Preparazione</label>
          <Button type="button" onClick={addStep} size="sm">
            + Aggiungi Step
          </Button>
        </div>
        <div className="space-y-3">
          {steps.map((step, idx) => (
            <div key={step.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                  {idx + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <Input
                    value={step.section || ''}
                    onChange={(e) => updateStep(step.id, 'section', e.target.value)}
                    placeholder="Titolo sezione (opzionale, es. Preparazione della pasta)"
                    className="font-medium"
                  />
                  <textarea
                    className="w-full border rounded-md p-2"
                    value={step.description}
                    onChange={(e) => updateStep(step.id, 'description', e.target.value)}
                    rows={3}
                    placeholder="Descrivi questo passaggio..."
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveStep(idx, idx - 1)}
                    disabled={idx === 0}
                    className="flex-shrink-0"
                    title="Sposta in alto"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => moveStep(idx, idx + 1)}
                    disabled={idx === steps.length - 1}
                    className="flex-shrink-0"
                    title="Sposta in basso"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeStep(step.id)}
                  className="flex-shrink-0"
                >
                  ✕
                </Button>
              </div>
              {step.section && (
                <div className="ml-10 text-xs text-gray-500 italic">
                  Questo step sarà raggruppato nella sezione "{step.section}"
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Salvataggio...' : mode === 'create' ? 'Crea Ricetta' : 'Salva Modifiche'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
