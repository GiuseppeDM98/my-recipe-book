'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { getRecipe } from '@/lib/firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import {
  getCookingSession,
  createCookingSession,
  updateCookingSession,
  deleteCookingSession,
} from '@/lib/firebase/cooking-sessions';
import { createCookingHistoryEntry } from '@/lib/firebase/cooking-history';
import { Recipe, CookingSession, Ingredient } from '@/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { StepsListCollapsible } from '@/components/recipe/steps-list-collapsible';
import { IngredientListCollapsible } from '@/components/recipe/ingredient-list-collapsible';
import { ArrowLeft, Plus, Minus, X } from 'lucide-react';
import NoSleep from 'nosleep.js';
import { scaleQuantity } from '@/lib/utils/ingredient-scaler';
import { useCountdownTimer } from '@/lib/hooks/useCountdownTimer';
import toast from 'react-hot-toast';

/**
 * Cooking Mode Page - Two-Phase Cooking Workflow
 *
 * Architecture: Setup Mode → Cooking Mode
 * - Setup mode: User selects servings before starting
 * - Cooking mode: Active cooking with ingredient/step tracking
 *
 * Why this approach: Prevents duplicate session creation compared to useEffect-based approach.
 * If session exists (e.g., page refresh), skip setup and go straight to cooking mode.
 *
 * Key Features:
 * - NoSleep integration: Keeps screen awake during cooking
 * - Ingredient scaling: Real-time quantity adjustment with Italian decimal format (1,5 kg)
 * - Manual completion: Session stays active at 100% until user explicitly ends it
 *
 * Side effects: Firebase session CRUD, history writes, navigation on completion
 */
export default function CookingModePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [cookingSession, setCookingSession] = useState<CookingSession | null>(null);
  // Separate error state for session operations — recipe load errors come from useQuery.
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [checkedIngredients, setCheckedIngredients] = useState<string[]>([]);
  const [checkedSteps, setCheckedSteps] = useState<string[]>([]);
  const [servings, setServings] = useState<number>(4); // Default to 4 servings
  const [scaledIngredients, setScaledIngredients] = useState<Ingredient[]>([]);
  const [isSetupMode, setIsSetupMode] = useState(true); // Start in setup mode

  const recipeId = id as string;

  // Recipe is loaded via React Query — shares cache with the detail and edit pages.
  // Navigating here after viewing the recipe costs zero extra Firestore reads.
  const {
    data: recipe,
    isLoading: recipeLoading,
    error: recipeError,
  } = useQuery({
    enabled: !!user && !!recipeId,
    queryKey: ['recipe', recipeId, user?.uid ?? ''],
    queryFn: () => getRecipe(recipeId, user!.uid),
  });

  const timer = useCountdownTimer();

  /** Formats remaining seconds as "MM:SS" for the floating overlay */
  const formatTimerSeconds = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  /**
   * Avvia (o riavvia) il timer per uno step specifico.
   * Più timer possono girare in parallelo — ogni step ha il suo.
   */
  const handleStartTimer = useCallback(
    (stepId: string, durationSeconds: number) => {
      const step = recipe?.steps.find((s) => s.id === stepId);
      const stepLabel = step?.description?.slice(0, 50) ?? `Passo`;

      timer.start(stepId, durationSeconds, {
        onFinish: () => {
          toast(`⏰ Timer completato! — ${stepLabel}`, { duration: 6000 });
        },
      });
    },
    [recipe, timer]
  );

  const calculateProgress = (
    nextCheckedIngredients: string[],
    nextCheckedSteps: string[]
  ) => {
    if (!recipe) return 0;

    const totalItems = recipe.ingredients.length + recipe.steps.length;
    if (totalItems === 0) return 0;

    return (nextCheckedIngredients.length + nextCheckedSteps.length) / totalItems;
  };

  // Keep device screen awake during cooking to prevent recipe from disappearing
  // while user is actively following steps (often with messy hands).
  useEffect(() => {
    const noSleep = new NoSleep();

    noSleep.enable();

    return () => {
      noSleep.disable();
    };
  }, []);

  // Guard to prevent session initialization from running more than once
  // even if the recipe cache re-validates (e.g., after a background refetch).
  const sessionInitialized = useRef(false);

  useEffect(() => {
    if (!user || !recipe || sessionInitialized.current) return;
    sessionInitialized.current = true;

    const initSession = async () => {
      const defaultServings = recipe.servings || 4;
      setServings(defaultServings);

      try {
        const session = await getCookingSession(recipeId, user.uid);
        if (session) {
          // Session exists — skip setup and resume in-progress cooking.
          // Prevents duplicate session creation on page refresh.
          setCookingSession(session);
          setCheckedIngredients(session.checkedIngredients);
          setCheckedSteps(session.checkedSteps);
          setServings(session.servings || defaultServings);
          setIsSetupMode(false);
        } else {
          setIsSetupMode(true);
        }
      } catch {
        // Session fetch errors are non-fatal: user stays in setup mode.
      }
    };

    initSession();
  }, [user, recipe, recipeId]);

  // Scale ingredients when servings change.
  // Italian number format uses comma as decimal separator (1,5 kg not 1.5 kg).
  // The scaleQuantity utility handles this conversion automatically.
  // See: src/lib/utils/ingredient-scaler.ts for scaling algorithm.
  useEffect(() => {
    if (recipe && servings > 0) {
      const originalServings = recipe.servings || 4;
      const scaled = recipe.ingredients.map(ingredient => ({
        ...ingredient,
        quantity: ingredient.quantity
          ? scaleQuantity(ingredient.quantity, originalServings, servings)
          : '',
      }));
      setScaledIngredients(scaled);
    }
  }, [recipe, servings]);

  /**
   * Creates cooking session and switches from setup mode to cooking mode.
   *
   * Called only from setup screen to prevent duplicate session creation.
   *
   * Side effects: Firebase session write, state updates (session, mode)
   */
  const handleStartCooking = async () => {
    if (!user || !id) return;

    try {
      // Create cooking session with selected servings
      const sessionId = await createCookingSession(recipeId, user.uid, servings);

      // Fetch the newly created session
      const session = await getCookingSession(recipeId, user.uid);

      if (session) {
        setCookingSession(session);
        setCheckedIngredients(session.checkedIngredients);
        setCheckedSteps(session.checkedSteps);
      }

      // Switch to cooking mode
      setIsSetupMode(false);
    } catch (err) {
      console.error('Error starting cooking session:', err);
      setSessionError('Errore durante l\'avvio della modalità cottura.');
    }
  };

  /**
   * Updates servings with real-time ingredient scaling.
   *
   * @param newServings - New servings count (1-99 range enforced)
   *
   * Side effects: Updates Firebase only if session exists (cooking mode).
   * In setup mode, servings are local state until session is created.
   */
  const handleServingsChange = async (newServings: number) => {
    if (newServings < 1 || newServings > 99) return; // Reasonable limits

    setServings(newServings);

    // Update Firebase only if we're in cooking mode (session exists).
    // In setup mode, servings remain local state until session is created.
    if (cookingSession && !isSetupMode) {
      try {
        await updateCookingSession(cookingSession.id, {
          servings: newServings,
        });
      } catch (err) {
        console.error('Error updating servings:', err);
      }
    }
  };

  /**
   * Toggles ingredient completion status and persists progress.
   */
  const handleToggleIngredient = async (ingredientId: string) => {
    if (!cookingSession || !recipe) return;

    const newCheckedIngredients = checkedIngredients.includes(ingredientId)
      ? checkedIngredients.filter(id => id !== ingredientId)
      : [...checkedIngredients, ingredientId];

    setCheckedIngredients(newCheckedIngredients);

    try {
      await updateCookingSession(cookingSession.id, {
        checkedIngredients: newCheckedIngredients,
      });
    } catch (err) {
      console.error('Error updating cooking session:', err);
    }
  };

  /**
   * Toggles step completion status and persists progress.
   */
  const handleToggleStep = async (stepId: string) => {
    if (!cookingSession || !recipe) return;

    const newCheckedSteps = checkedSteps.includes(stepId)
      ? checkedSteps.filter(id => id !== stepId)
      : [...checkedSteps, stepId];

    setCheckedSteps(newCheckedSteps);

    try {
      await updateCookingSession(cookingSession.id, {
        checkedSteps: newCheckedSteps,
      });
    } catch (err) {
      console.error('Error updating cooking session:', err);
    }
  };

  const handleFinishCooking = async () => {
    if (!user || !cookingSession || !recipe) return;

    try {
      await createCookingHistoryEntry({
        userId: user.uid,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        servings: servings || null,
      });
      await deleteCookingSession(cookingSession.id);
      router.push('/cotture-in-corso');
    } catch (err) {
      console.error('Error finishing cooking session:', err);
      setSessionError('Errore durante la chiusura della cottura.');
    }
  };

  if (recipeLoading) {
    return <div className="flex justify-center items-center h-screen"><Spinner size="lg" /></div>;
  }

  if (recipeError) {
    return <p className="text-red-500 text-center mt-10">Errore nel caricamento della ricetta.</p>;
  }

  if (!recipe) {
    return <p className="text-center mt-10">Ricetta non trovata o non autorizzata.</p>;
  }

  if (sessionError) {
    return <p className="text-red-500 text-center mt-10">{sessionError}</p>;
  }

  const originalServings = recipe.servings || 4;
  const progress = calculateProgress(checkedIngredients, checkedSteps);
  const isComplete = progress >= 1;

  // === SETUP MODE RENDER ===
  // Pre-cooking configuration: user selects servings before starting.
  if (isSetupMode) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center mb-6">
            <Button
              variant="outline"
              size="lg"
              onClick={() => router.push(`/ricette/${id}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Indietro
            </Button>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">{recipe.title}</h1>
            <p className="text-xl text-gray-600">Prepara la tua modalità cottura</p>
          </div>

          <div className="bg-card rounded-lg shadow-lg p-6 sm:p-8 border-2 border-primary/20">
            <h2 className="text-2xl font-semibold mb-6 text-center">Per quante persone cucini?</h2>

            <div className="mb-8 p-6 bg-gray-50 rounded-lg">
              <div className="text-center mb-4">
                <span className="text-lg text-gray-700">
                  Ricetta originale per <span className="font-bold text-primary">{originalServings}</span> {originalServings === 1 ? 'persona' : 'persone'}
                </span>
              </div>

              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handleServingsChange(servings - 1)}
                  disabled={servings <= 1}
                  className="w-14 h-14 p-0"
                >
                  <Minus className="w-6 h-6" />
                </Button>
                <input
                  type="number"
                  value={servings}
                  onChange={(e) => handleServingsChange(parseInt(e.target.value) || 1)}
                  className="w-24 h-14 text-center text-3xl font-bold border-2 border-gray-300 rounded-md focus:border-primary focus:outline-none"
                  min="1"
                  max="99"
                />
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => handleServingsChange(servings + 1)}
                  disabled={servings >= 99}
                  className="w-14 h-14 p-0"
                >
                  <Plus className="w-6 h-6" />
                </Button>
                <span className="text-lg font-medium">{servings === 1 ? 'persona' : 'persone'}</span>
              </div>

              {servings !== originalServings && (
                <p className="text-center text-sm text-gray-600 mt-4">
                  ✨ Le quantità degli ingredienti saranno adattate automaticamente
                </p>
              )}
            </div>

            <Button
              onClick={handleStartCooking}
              size="lg"
              className="w-full h-16 text-2xl font-bold"
            >
              👨‍🍳 Avvia modalità cottura
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // === COOKING MODE RENDER ===
  // Active cooking: ingredient/step tracking with explicit completion CTA.
  return (
    <div className="p-4 sm:p-6 lg:p-8 text-xl">
      {/* Floating timer overlay — un chip per ogni timer attivo, fixed top-right.
          Rimane sopra l'header (top-16) per non sovrapporre i controlli di navigazione. */}
      {timer.timers.length > 0 && (
        <div className="fixed top-16 right-4 z-50 flex flex-col gap-2 max-w-[220px]">
          {timer.timers.map(({ stepId, secondsLeft }) => {
            const step = recipe?.steps.find((s) => s.id === stepId);
            const label = step?.description?.slice(0, 35) ?? 'Timer';
            return (
              <div
                key={stepId}
                className="flex items-center gap-3 rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs opacity-75 truncate">{label}</span>
                  <span className="text-2xl font-mono font-bold leading-none mt-0.5">
                    {formatTimerSeconds(secondsLeft)}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Ferma timer"
                  onClick={() => timer.stop(stepId)}
                  className="ml-auto flex-shrink-0 rounded-full p-1 hover:bg-white/20 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center mb-6">
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push(`/ricette/${id}`)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-5 h-5" />
          Esci dalla modalità cottura
        </Button>
      </div>

      <h1 className="text-5xl font-bold mb-6 text-center">{recipe.title}</h1>

      {isComplete && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xl font-semibold text-primary">
                Ricetta completata! Vuoi terminare la cottura?
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                La sessione restera&apos; visibile tra le cotture in corso finche&apos; non la chiudi.
              </p>
            </div>
            <Button onClick={handleFinishCooking} size="lg">
              Termina cottura
            </Button>
          </div>
        </div>
      )}

      {/* Servings selector */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg border-2 border-primary/20">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="text-lg sm:text-xl font-medium text-gray-700">
            Ricetta per <span className="font-bold text-primary">{originalServings}</span> {originalServings === 1 ? 'persona' : 'persone'}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium">Cucino per:</span>
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleServingsChange(servings - 1)}
              disabled={servings <= 1}
              className="w-12 h-12 p-0"
            >
              <Minus className="w-5 h-5" />
            </Button>
            <input
              type="number"
              value={servings}
              onChange={(e) => handleServingsChange(parseInt(e.target.value) || 1)}
              className="w-20 h-12 text-center text-2xl font-bold border-2 border-gray-300 rounded-md focus:border-primary focus:outline-none"
              min="1"
              max="99"
            />
            <Button
              variant="outline"
              size="lg"
              onClick={() => handleServingsChange(servings + 1)}
              disabled={servings >= 99}
              className="w-12 h-12 p-0"
            >
              <Plus className="w-5 h-5" />
            </Button>
            <span className="text-lg font-medium">{servings === 1 ? 'persona' : 'persone'}</span>
          </div>
        </div>
        {servings !== originalServings && (
          <p className="text-center text-sm text-gray-600 mt-3">
            ✨ Le quantità degli ingredienti sono state adattate automaticamente
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-3xl font-semibold mb-4">Ingredienti</h2>
          <IngredientListCollapsible
            ingredients={scaledIngredients.length > 0 ? scaledIngredients : recipe.ingredients}
            defaultExpanded={true}
            interactive={true}
            checkedIngredients={checkedIngredients}
            onToggleIngredient={handleToggleIngredient}
          />
        </div>
        <div>
          <h2 className="text-3xl font-semibold mb-4">Preparazione</h2>
          <StepsListCollapsible
            steps={recipe.steps}
            ingredients={recipe.ingredients}
            originalServings={originalServings}
            targetServings={servings}
            defaultExpanded={true}
            interactive={true}
            checkedSteps={checkedSteps}
            onToggleStep={handleToggleStep}
            onStartTimer={handleStartTimer}
            isTimerActive={timer.isActive}
            getTimerSecondsLeft={timer.getSecondsLeft}
          />
        </div>
      </div>
    </div>
  );
}
