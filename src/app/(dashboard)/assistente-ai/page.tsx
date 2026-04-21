'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { RecipeExtractorUpload } from '@/components/recipe/recipe-extractor-upload';
import { RecipeTextInput } from '@/components/recipe/recipe-text-input';
import { RecipeChatInput } from '@/components/recipe/recipe-chat-input';
import { ExtractedRecipePreview } from '@/components/recipe/extracted-recipe-preview';
import { parseExtractedRecipes, ParsedRecipe, getAISuggestionForRecipe } from '@/lib/utils/recipe-parser';
import { createRecipe } from '@/lib/firebase/firestore';
import { getUserCategories } from '@/lib/firebase/categories';
import { createCategoryIfNotExists } from '@/lib/firebase/categories';
import { getFirebaseAuthHeader } from '@/lib/firebase/client-auth';
import { useRecipes, recipesQueryKey } from '@/lib/hooks/useRecipes';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, FileText, PenLine, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { Category, Season } from '@/types';
import { useFamilyProfile } from '@/lib/hooks/useFamilyProfile';
import { FamilyContextToggle } from '@/components/family/family-context-toggle';
import { validateFamilyContextUsage } from '@/lib/utils/family-context';
import Link from 'next/link';

/**
 * Recipe Extractor Page - Multi-Step AI Extraction Workflow
 *
 * Workflow: Input → Extract/Format → Preview → Save
 * 1. User uploads a PDF OR types/pastes a recipe in free text
 * 2. Claude API extracts/formats recipes (markdown format)
 * 3. AI suggests categories/seasons for each recipe
 * 4. User reviews and saves individually or in bulk
 *
 * Input modes:
 * - PDF: Multi-recipe extraction from uploaded document
 * - Text: Single recipe formatting from free-form text input
 * - Chat: Conversational AI recipe generation with existing cookbook context
 *
 * State management: Per-recipe saving states for bulk operations (optimistic UI).
 * Chat mode appends recipes across turns; PDF/text modes replace on each submission.
 *
 * Feature gating: Test account blocked from AI to protect API costs.
 * Test account can still browse and use all other features.
 */
export default function RecipeExtractorPage() {
  const router = useRouter();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [inputMode, setInputMode] = useState<'pdf' | 'text' | 'chat'>('pdf');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedRecipes, setExtractedRecipes] = useState<ParsedRecipe[]>([]);
  const [savingStates, setSavingStates] = useState<Map<number, boolean>>(new Map());
  const [savedStates, setSavedStates] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [userCategories, setUserCategories] = useState<Category[]>([]);
  const [useFamilyContextByMode, setUseFamilyContextByMode] = useState({
    pdf: false,
    text: false,
    chat: false,
  });
  // Track source type to set the correct recipe.source on save
  const [currentSourceType, setCurrentSourceType] = useState<'pdf' | 'manual' | 'chat'>('pdf');

  // User's existing recipes — passed to chat mode so AI avoids duplicate suggestions
  const { recipes: existingRecipes } = useRecipes();

  // Test account is blocked from AI extraction because:
  // - Prevents API cost abuse on publicly accessible demo account
  // - Users can still browse and test all other features
  // Real users have full AI access.
  const isTestAccount = user?.email === 'test@test.com';
  const supportsFamilyContext = inputMode !== 'pdf';
  const useFamilyContext = supportsFamilyContext ? useFamilyContextByMode[inputMode] : false;
  const {
    familyProfile,
    hasValidProfile,
  } = useFamilyProfile();

  // Load user categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      if (user) {
        try {
          const categories = await getUserCategories(user.uid);
          setUserCategories(categories);
        } catch (error) {
          console.error('Error loading categories:', error);
        }
      }
    };
    loadCategories();
  }, [user]);

  function validateFamilyToggle(): boolean {
    const validationError = validateFamilyContextUsage(useFamilyContext, familyProfile);

    if (validationError) {
      toast.error(validationError);
      return false;
    }

    return true;
  }

  /**
   * Switches between input modes, clearing any previous results.
   *
   * Reset is intentional: results from one mode would be confusing to show
   * while preparing a submission in another mode.
   */
  const handleModeSwitch = (mode: 'pdf' | 'text' | 'chat') => {
    setInputMode(mode);
    setExtractedRecipes([]);
    setError(null);
    setSavingStates(new Map());
    setSavedStates(new Set());
  };

  /**
   * Shared post-processing pipeline for both PDF and text input modes.
   *
   * After Claude returns markdown (either from PDF extraction or text formatting),
   * this function: parses the markdown → fetches AI category/season suggestions
   * in parallel → updates state with enriched recipes.
   *
   * @param markdownText - Claude's markdown output (same format regardless of source)
   * @param emptyMessage - Error message to show if no recipes are parsed
   */
  const processExtractedMarkdown = async (markdownText: string, emptyMessage: string) => {
    const parsedRecipes = parseExtractedRecipes(markdownText);

    if (parsedRecipes.length === 0) {
      throw new Error(emptyMessage);
    }

    // Two-phase AI workflow:
    // Phase 1: Extract/format recipes (Claude) → returns markdown
    // Phase 2: Suggest categories (Claude text analysis) → one call per recipe
    // Phase 2 is parallelized (Promise.all) for speed.
    // Total AI calls: 1 extraction/format + N suggestions (N = number of recipes)
    toast.success(`${parsedRecipes.length} ricett${parsedRecipes.length === 1 ? 'a trovata' : 'e trovate'}! Ottenimento suggerimenti AI...`);

    const recipesWithSuggestions = await Promise.all(
      parsedRecipes.map(async (recipe) => {
        const suggestion = await getAISuggestionForRecipe(
          recipe.title,
          recipe.ingredients,
          userCategories.map(c => ({ name: c.name }))
        );
        return {
          ...recipe,
          aiSuggestion: suggestion || undefined
        };
      })
    );

    setExtractedRecipes(recipesWithSuggestions);
    toast.success('Suggerimenti AI pronti!');
  };

  /**
   * Handles recipes returned by the chat AI.
   *
   * Unlike processExtractedMarkdown (which replaces the recipe list), this
   * handler APPENDS recipes across chat turns — each chat response adds to
   * the existing list so the user can accumulate recipes in one session.
   *
   * @param markdownText - Recipe markdown from /api/chat-recipe
   *
   * Side effects: Appends to extractedRecipes, fetches AI category suggestions
   */
  const handleChatRecipesExtracted = async (markdownText: string) => {
    const parsedRecipes = parseExtractedRecipes(markdownText);
    if (parsedRecipes.length === 0) return;

    setCurrentSourceType('chat');

    const recipesWithSuggestions = await Promise.all(
      parsedRecipes.map(async (recipe) => {
        const suggestion = await getAISuggestionForRecipe(
          recipe.title,
          recipe.ingredients,
          userCategories.map((c) => ({ name: c.name }))
        );
        return { ...recipe, aiSuggestion: suggestion || undefined };
      })
    );

    // Append (not replace) so chat turns accumulate recipes in the preview list
    setExtractedRecipes((prev) => [...prev, ...recipesWithSuggestions]);
    toast.success(`${parsedRecipes.length} ricett${parsedRecipes.length === 1 ? 'a generata' : 'e generate'} dall'AI!`);
  };

  /**
   * Uploads PDF and processes extracted recipes.
   *
   * Validation: Blocks test account, file type/size checks (handled by API).
   *
   * Side effects: Multiple API calls (1 extraction + N category suggestions)
   */
  const handleFileSelected = async (file: File) => {
    if (!user) {
      toast.error('Devi effettuare il login per usare questa funzionalità');
      return;
    }

    if (user.email === 'test@test.com') {
      toast.error('L\'estrazione AI è disabilitata per l\'account di test');
      return;
    }

    if (!validateFamilyToggle()) {
      return;
    }

    setIsExtracting(true);
    setError(null);
    setExtractedRecipes([]);
    setSavingStates(new Map());
    setSavedStates(new Set());
    setCurrentSourceType('pdf');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userCategories', JSON.stringify(userCategories.map(c => ({ name: c.name }))));
      formData.append('useFamilyContext', JSON.stringify(useFamilyContext));
      formData.append('familyProfile', JSON.stringify(familyProfile));

      const response = await fetch('/api/extract-recipes', {
        method: 'POST',
        headers: await getFirebaseAuthHeader({ forceRefresh: true }),
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante l\'estrazione');
      }

      const data = await response.json();

      if (!data.success || !data.extractedRecipes) {
        throw new Error('Nessuna ricetta trovata nel PDF');
      }

      await processExtractedMarkdown(data.extractedRecipes, 'Non è stato possibile estrarre ricette valide dal PDF');
    } catch (err: any) {
      console.error('Error extracting recipes:', err);
      setError(err.message || 'Errore durante l\'estrazione delle ricette');
      toast.error(err.message || 'Errore durante l\'estrazione');
    } finally {
      setIsExtracting(false);
    }
  };

  /**
   * Submits free-form recipe text for AI formatting.
   *
   * Sends text to /api/format-recipe, which returns structured markdown in the
   * same format as /api/extract-recipes, so the same parsing pipeline applies.
   *
   * Side effects: Multiple API calls (1 format + 1 category suggestion)
   */
  const handleTextSubmit = async (text: string) => {
    if (!user) {
      toast.error('Devi effettuare il login per usare questa funzionalità');
      return;
    }

    if (user.email === 'test@test.com') {
      toast.error('La formattazione AI è disabilitata per l\'account di test');
      return;
    }

    if (!validateFamilyToggle()) {
      return;
    }

    setIsExtracting(true);
    setError(null);
    setExtractedRecipes([]);
    setSavingStates(new Map());
    setSavedStates(new Set());
    setCurrentSourceType('manual');

    try {
      const response = await fetch('/api/format-recipe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getFirebaseAuthHeader({ forceRefresh: true })),
        },
        body: JSON.stringify({
          text,
          userCategories: userCategories.map(c => ({ name: c.name })),
          useFamilyContext,
          familyProfile,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Errore durante la formattazione');
      }

      const data = await response.json();

      if (!data.success || !data.extractedRecipes) {
        throw new Error('Non è stato possibile formattare la ricetta');
      }

      await processExtractedMarkdown(data.extractedRecipes, 'Non è stato possibile formattare la ricetta dal testo fornito');
    } catch (err: any) {
      console.error('Error formatting recipe:', err);
      setError(err.message || 'Errore durante la formattazione della ricetta');
      toast.error(err.message || 'Errore durante la formattazione');
    } finally {
      setIsExtracting(false);
    }
  };

  /**
   * Saves individual recipe with category creation if needed.
   *
   * @param recipe - Parsed recipe data
   * @param categoryName - Creates category if missing
   * @param seasons - Season tags array for recipe (supports multiple seasons)
   * @param index - Recipe index for state tracking
   *
   * Side effects: Firebase recipe write, potential category creation, category list refresh
   */
  const handleSaveRecipe = async (recipe: ParsedRecipe, categoryName: string, seasons: Season[], index: number) => {
    if (!user) return;

    setSavingStates(prev => new Map(prev).set(index, true));

    try {
      let categoryId = '';
      if (categoryName && categoryName.trim()) {
        categoryId = await createCategoryIfNotExists(user.uid, categoryName.trim());
      }

      const recipeData = {
        title: recipe.title,
        description: '',
        servings: recipe.servings || 4,
        prepTime: recipe.prepTime || 0,
        cookTime: recipe.cookTime || 0,
        totalTime: (recipe.prepTime || 0) + (recipe.cookTime || 0),
        ingredients: recipe.ingredients,
        steps: recipe.steps,
        categoryId: categoryId,
        subcategoryId: '',
        seasons: seasons.length > 0 ? seasons : undefined,
        aiSuggested: recipe.aiSuggestion ? true : false,
        difficulty: 'media' as const,
        tags: [],
        techniqueIds: [],
        source: currentSourceType === 'pdf'
          ? { type: 'pdf' as const, name: 'Estratto da PDF con AI' }
          : currentSourceType === 'chat'
          ? { type: 'manual' as const, name: 'Generata con Chat AI' }
          : { type: 'manual' as const, name: 'Formattata con AI da testo' },
        notes: recipe.notes || '',
        images: [],
      };

      await createRecipe(user.uid, recipeData);

      // Invalidate so /ricette reflects the new recipe without a manual refresh.
      queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });

      setSavedStates(prev => new Set(prev).add(index));
      toast.success(`"${recipe.title}" salvata con successo!`);

      // Reload categories after saving because:
      // - createCategoryIfNotExists might have created a new category
      // - Next recipe save needs updated category list for AI matching
      // - User expects newly created categories to appear immediately
      const updatedCategories = await getUserCategories(user.uid);
      setUserCategories(updatedCategories);
    } catch (error) {
      console.error('Error saving recipe:', error);
      toast.error(`Errore nel salvataggio di "${recipe.title}"`);
    } finally {
      setSavingStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(index);
        return newMap;
      });
    }
  };

  /**
   * Bulk saves all unsaved recipes with AI-suggested metadata.
   *
   * Logic: Saves sequentially (await in loop) instead of Promise.all to avoid
   * Firebase write rate limits per user. Sequential saves are more reliable
   * for bulk operations.
   */
  const handleSaveAll = async () => {
    if (!user || extractedRecipes.length === 0) return;

    // Save recipes sequentially (await in loop) instead of Promise.all because:
    // - Firebase has write rate limits per user
    // - Sequential saves are more reliable for bulk operations
    // - Progress feedback is clearer (saves appear one by one)
    for (let i = 0; i < extractedRecipes.length; i++) {
      if (!savedStates.has(i)) {
        const recipe = extractedRecipes[i];
        const categoryName = recipe.aiSuggestion?.categoryName || '';
        const seasons: Season[] = recipe.aiSuggestion?.season ? [recipe.aiSuggestion.season] : ['tutte_stagioni'];
        await handleSaveRecipe(recipe, categoryName, seasons, i);
      }
    }

    toast.success('Tutte le ricette sono state salvate!');
  };

  // ========================================
  // Loading message varies by input mode
  // ========================================
  const loadingMessage = inputMode === 'pdf'
    ? 'Analisi del PDF in corso...'
    : inputMode === 'text'
    ? 'Formattazione ricetta in corso...'
    : 'L\'AI sta generando le ricette...';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="mb-2">
          <h1 className="font-display text-4xl font-semibold italic">Assistente AI</h1>
        </div>
        <p className="text-muted-foreground">
          Carica un PDF, scrivi una ricetta in formato libero, oppure chatta con l'AI per farti suggerire nuove ricette.
        </p>
      </div>

      {/* Test Account Warning */}
      {isTestAccount && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900">Funzionalità AI Disabilitata</h3>
            <p className="text-sm text-yellow-700 mt-1">
              L'estrazione, la formattazione e la Chat AI sono disabilitate per l'account di test per proteggere le risorse API.
            </p>
          </div>
        </div>
      )}

      {/* Input Card with Tab Switcher */}
      <div className="bg-background rounded-lg border">
        {/* Tab switcher */}
        <div className="flex border-b">
          <button
            onClick={() => handleModeSwitch('pdf')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-[2px] -mb-px
              ${inputMode === 'pdf'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <FileText className="w-4 h-4" />
            Carica PDF
          </button>
          <button
            onClick={() => handleModeSwitch('text')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-[2px] -mb-px
              ${inputMode === 'text'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <PenLine className="w-4 h-4" />
            Testo libero
          </button>
          <button
            onClick={() => handleModeSwitch('chat')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-[2px] -mb-px
              ${inputMode === 'chat'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat AI
          </button>
        </div>

        {/* Input content */}
        <div className="p-6">
          {supportsFamilyContext && (
            <div className="mb-5">
              <FamilyContextToggle
                checked={useFamilyContext}
                onChange={(checked) => setUseFamilyContextByMode((prev) => ({ ...prev, [inputMode]: checked }))}
                disabled={isTestAccount || (!hasValidProfile && !useFamilyContext)}
                hasValidProfile={hasValidProfile}
              />
              <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-dashed px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {hasValidProfile
                    ? 'Il profilo famiglia salvato è disponibile per questo flusso.'
                    : 'Nessun profilo famiglia valido salvato.'}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/profilo-famiglia">Gestisci profilo</Link>
                </Button>
              </div>
            </div>
          )}

          {inputMode === 'pdf' ? (
            <RecipeExtractorUpload
              onFileSelected={handleFileSelected}
              isLoading={isExtracting}
              disabled={isTestAccount}
            />
          ) : inputMode === 'text' ? (
            <RecipeTextInput
              onTextSubmit={handleTextSubmit}
              isLoading={isExtracting}
              disabled={isTestAccount}
            />
          ) : (
            <RecipeChatInput
              onRecipesExtracted={handleChatRecipesExtracted}
              disabled={isTestAccount}
              useFamilyContext={useFamilyContext}
              familyProfile={familyProfile}
              existingRecipes={existingRecipes.map((r) => ({
                title: r.title,
                ingredients: r.ingredients,
                seasons: r.seasons ?? [],
              }))}
            />
          )}

          {/* Loading indicator: shown for PDF/text modes only.
              Chat mode has its own inline typing indicator in RecipeChatInput. */}
          {isExtracting && inputMode !== 'chat' && (
            <div className="mt-6 text-center">
              <div className="inline-flex items-center gap-2 text-primary">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent"></div>
                <span className="font-medium">{loadingMessage}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Questo processo può richiedere alcuni secondi
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Errore</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Success Message and Bulk Actions */}
      {extractedRecipes.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-green-900">
                  {extractedRecipes.length} ricett{extractedRecipes.length === 1 ? 'a trovata' : 'e trovate'}
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Controlla i dettagli e salvale nel tuo ricettario
                </p>
              </div>
            </div>
            {savedStates.size < extractedRecipes.length && (
              <Button onClick={handleSaveAll} size="sm">
                Salva Tutte ({extractedRecipes.length - savedStates.size})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Extracted Recipes List */}
      {extractedRecipes.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {inputMode === 'pdf'
              ? 'Ricette Estratte'
              : inputMode === 'text'
              ? 'Ricetta Formattata'
              : 'Ricette Generate dall\'AI'}
          </h2>
          {extractedRecipes.map((recipe, index) => (
            <ExtractedRecipePreview
              key={index}
              recipe={recipe}
              index={index}
              onSave={(r, categoryName, season) => handleSaveRecipe(r, categoryName, season, index)}
              isSaving={savingStates.get(index)}
              isSaved={savedStates.has(index)}
            />
          ))}
        </div>
      )}

      {/* Help Section — not shown in chat mode (RecipeChatInput has its own welcome state) */}
      {extractedRecipes.length === 0 && !isExtracting && !error && inputMode !== 'chat' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-3">Come funziona?</h3>
          {inputMode === 'pdf' ? (
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Carica un file PDF contenente una o più ricette</li>
              <li>L'AI di Claude analizzerà il documento ed estrarrà automaticamente tutte le ricette</li>
              <li>Controlla le ricette estratte e modificale se necessario</li>
              <li>Salva le ricette nel tuo ricettario personale</li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Scrivi o incolla il testo di una ricetta, anche in formato grezzo o non strutturato</li>
              <li>L'AI di Claude interpreterà il testo e lo formatterà in modo preciso e completo</li>
              <li>Controlla la ricetta formattata e modifica i dettagli se necessario</li>
              <li>Salvala nel tuo ricettario personale</li>
            </ol>
          )}
          <p className="text-xs text-blue-600 mt-4">
            {inputMode === 'pdf'
              ? '💡 Suggerimento: I PDF con ricette ben strutturate daranno risultati migliori.'
              : '💡 Suggerimento: Anche una ricetta scritta in modo informale ("pasta al pomodoro: 400g pasta, pomodori...") verrà formattata correttamente.'}
          </p>
        </div>
      )}
    </div>
  );
}
