'use client';

import { useState } from 'react';
import { Ingredient, Step } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { renderStepDescription } from '@/lib/utils/step-description';

/**
 * StepsListCollapsible - Step viewer with global numbering across sections
 *
 * KEY FEATURE: Global step counter
 * - Steps are numbered 1, 2, 3... globally across all sections
 * - Counter continues even when sections are collapsed
 * - Challenge: Counter must increment even for hidden steps
 *
 * SECTION ORDERING:
 * - Null section (no section): Always first
 * - Named sections: Sorted by sectionOrder field (preserved from PDF extraction)
 * - sectionOrder tracks original document order
 *
 * INTERACTION MODES:
 * - static: Display only (recipe view)
 * - interactive: Checkboxes for cooking mode (track progress)
 */

interface StepsListCollapsibleProps {
  steps: Step[];
  ingredients?: Ingredient[];
  originalServings?: number;
  targetServings?: number;
  defaultExpanded?: boolean;
  interactive?: boolean;
  checkedSteps?: string[];
  onToggleStep?: (stepId: string) => void;
  /** Called when the user taps "Avvia timer" on a step with duration */
  onStartTimer?: (stepId: string, durationSeconds: number) => void;
  /** Restituisce true se il timer di questo step è attivo */
  isTimerActive?: (stepId: string) => boolean;
  /** Restituisce i secondi rimanenti per il timer di questo step */
  getTimerSecondsLeft?: (stepId: string) => number;
}

interface GroupedSteps {
  section: string | null;
  steps: Step[];
}

/** Formats a seconds count as "MM:SS" for the inline timer display */
function formatTimerSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function StepsListCollapsible({
  steps,
  ingredients = [],
  originalServings = 0,
  targetServings = 0,
  defaultExpanded = false,
  interactive = false,
  checkedSteps = [],
  onToggleStep,
  onStartTimer,
  isTimerActive,
  getTimerSecondsLeft,
}: StepsListCollapsibleProps) {
  // ========================================
  // Group steps by section and sort by original document order
  // ========================================
  //
  // ALGORITHM:
  // 1. Group by section field (null = no section)
  // 2. Convert Map → array of GroupedSteps
  // 3. Sort: null section first, then by sectionOrder (PDF extraction order)
  //
  // WHY sectionOrder:
  // - PDF extractor assigns sectionOrder to preserve document structure
  // - Multiple steps in same section share same sectionOrder
  // - Allows grouping by section while maintaining original sequence
  //
  // Example:
  //   Step 1: section=null, sectionOrder=null         → group 1 (renders first)
  //   Step 2: section="Per la pasta", sectionOrder=1  → group 2
  //   Step 3: section="Per la pasta", sectionOrder=1  → group 2
  //   Step 4: section="Per il sugo", sectionOrder=2   → group 3
  const groupedSteps: GroupedSteps[] = [];
  const stepsBySection = new Map<string | null, Step[]>();

  steps.forEach(step => {
    const section = step.section || null;
    if (!stepsBySection.has(section)) {
      stepsBySection.set(section, []);
    }
    stepsBySection.get(section)!.push(step);
  });

  // Convert to array
  stepsBySection.forEach((steps, section) => {
    groupedSteps.push({ section, steps });
  });

  // Sort: null section first, then by sectionOrder
  groupedSteps.sort((a, b) => {
    if (a.section === null) return -1;
    if (b.section === null) return 1;

    // Get sectionOrder from first step (all steps in group share same sectionOrder)
    const orderA = a.steps[0]?.sectionOrder ?? 999;
    const orderB = b.steps[0]?.sectionOrder ?? 999;

    return orderA - orderB;
  });

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(defaultExpanded ? groupedSteps.map(g => g.section || 'no-section') : [])
  );

  const toggleSection = (section: string | null) => {
    const key = section || 'no-section';
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  // ========================================
  // Global step numbering across all sections
  // ========================================
  //
  // CRITICAL: Counter must increment even for collapsed sections
  // - User sees "1, 2, 3..." for expanded steps
  // - Collapsed sections still consume numbers (prevents renumbering on expand)
  // - Example: Section A (steps 1-3), Section B collapsed (steps 4-5), Section C (steps 6-7)
  //
  // Implementation: Single counter variable incremented during render
  let globalStepNumber = 0;

  return (
    <div className="space-y-4">
      {groupedSteps.map((group) => {
        const sectionKey = group.section || 'no-section';
        const isExpanded = expandedSections.has(sectionKey);
        const hasSection = group.section !== null;

        // If no section, render steps directly without collapsible header
        if (!hasSection) {
          return (
            <div key={sectionKey} className="space-y-4">
              {group.steps.map((step) => {
                globalStepNumber++;
                const isChecked = checkedSteps.includes(step.id);
                const resolvedDescription = renderStepDescription(
                  step,
                  ingredients,
                  originalServings,
                  targetServings
                );
                return (
                  <div
                    key={step.id}
                    className={`flex items-start ${interactive ? 'cursor-pointer hover:bg-gray-50 p-3 rounded transition-colors' : ''}`}
                    onClick={() => interactive && onToggleStep?.(step.id)}
                  >
                    {interactive && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleStep?.(step.id)}
                        className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer"
                      />
                    )}
                    <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${isChecked && interactive ? 'bg-gray-400' : 'bg-primary'} text-primary-foreground font-bold mr-4`}>
                      {globalStepNumber}
                    </div>
                    <div className={`flex-1 ${isChecked && interactive ? 'opacity-50' : ''}`}>
                      {(() => {
                        const lines = resolvedDescription.split('\n').filter(line => line.trim());
                        if (lines.length === 0) return null;

                        if (lines.length === 1) {
                          return <p className={`text-gray-800 ${isChecked && interactive ? 'line-through' : ''}`}>{lines[0]}</p>;
                        }

                        return (
                          <div className="space-y-2">
                            {lines.map((line, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <span className="text-gray-500 mt-1 flex-shrink-0">•</span>
                                <p className={`text-gray-800 flex-1 ${isChecked && interactive ? 'line-through' : ''}`}>{line}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {step.duration && (
                        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                          {interactive && onStartTimer ? (
                            isTimerActive?.(step.id) ? (
                              // Timer attivo: mostra countdown inline
                              <span className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-primary">
                                ⏱ {formatTimerSeconds(getTimerSecondsLeft?.(step.id) ?? 0)}
                              </span>
                            ) : (
                              // Idle: bottone per avviare il timer
                              <button
                                type="button"
                                className="text-sm text-primary underline underline-offset-2 hover:opacity-70 transition-opacity"
                                onClick={() => onStartTimer(step.id, step.duration! * 60)}
                              >
                                ▶ Avvia timer ({step.duration} min)
                              </button>
                            )
                          ) : (
                            // Vista statica (non interattiva)
                            <p className={`text-sm text-gray-500 ${isChecked && interactive ? 'line-through' : ''}`}>
                              Tempo: {step.duration} min
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // Render collapsible section
        return (
          <div key={sectionKey} className="border rounded-lg overflow-hidden">
            {/* Section Header */}
            <button
              onClick={() => toggleSection(group.section)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                )}
                <h3 className="font-semibold text-lg text-gray-900">
                  {group.section}
                </h3>
              </div>
            </button>

            {/* Section Steps */}
            {isExpanded && (
              <div className="p-4 space-y-4 border-t">
                {group.steps.map((step) => {
                  globalStepNumber++;
                  const isChecked = checkedSteps.includes(step.id);
                  const resolvedDescription = renderStepDescription(
                    step,
                    ingredients,
                    originalServings,
                    targetServings
                  );
                  return (
                    <div
                      key={step.id}
                      className={`flex items-start ${interactive ? 'cursor-pointer hover:bg-gray-50 p-3 rounded transition-colors' : ''}`}
                      onClick={() => interactive && onToggleStep?.(step.id)}
                    >
                      {interactive && (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => onToggleStep?.(step.id)}
                          className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer"
                        />
                      )}
                      <div className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full ${isChecked && interactive ? 'bg-gray-400' : 'bg-primary'} text-primary-foreground font-bold mr-4`}>
                        {globalStepNumber}
                      </div>
                      <div className={`flex-1 ${isChecked && interactive ? 'opacity-50' : ''}`}>
                        {(() => {
                          const lines = resolvedDescription.split('\n').filter(line => line.trim());
                          if (lines.length === 0) return null;

                          if (lines.length === 1) {
                            return <p className={`text-gray-800 ${isChecked && interactive ? 'line-through' : ''}`}>{lines[0]}</p>;
                          }

                          return (
                            <div className="space-y-2">
                              {lines.map((line, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <span className="text-gray-500 mt-1 flex-shrink-0">•</span>
                                  <p className={`text-gray-800 flex-1 ${isChecked && interactive ? 'line-through' : ''}`}>{line}</p>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        {step.duration && (
                          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                            {interactive && onStartTimer ? (
                              isTimerActive?.(step.id) ? (
                                <span className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-primary">
                                  ⏱ {formatTimerSeconds(getTimerSecondsLeft?.(step.id) ?? 0)}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="text-sm text-primary underline underline-offset-2 hover:opacity-70 transition-opacity"
                                  onClick={() => onStartTimer(step.id, step.duration! * 60)}
                                >
                                  ▶ Avvia timer ({step.duration} min)
                                </button>
                              )
                            ) : (
                              <p className={`text-sm text-gray-500 ${isChecked && interactive ? 'line-through' : ''}`}>
                                Tempo: {step.duration} min
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Reserve numbers for collapsed section steps */}
            {/* WHY: Prevents step numbers from changing when user expands/collapses */}
            {/* Example: If steps 4-5 are hidden, step 6 stays 6 (doesn't become 4) */}
            {!isExpanded && (() => {
              group.steps.forEach(() => globalStepNumber++);
              return null; // No render, just increment counter
            })()}
          </div>
        );
      })}
    </div>
  );
}
