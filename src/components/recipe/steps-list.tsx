import { Ingredient, Step } from '@/types';
import { renderStepDescription } from '@/lib/utils/step-description';

interface StepsListProps {
  steps: Step[];
  ingredients?: Ingredient[];
  originalServings?: number;
  targetServings?: number;
}

export function StepsList({
  steps,
  ingredients = [],
  originalServings = 0,
  targetServings = 0,
}: StepsListProps) {
  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.id} className="flex items-start">
          <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white font-bold mr-4">
            {index + 1}
          </div>
          <div className="flex-1">
            {(() => {
              const resolvedDescription = renderStepDescription(
                step,
                ingredients,
                originalServings,
                targetServings
              );
              const lines = resolvedDescription.split('\n').filter(line => line.trim());
              if (lines.length === 0) return null;

              if (lines.length === 1) {
                return <p>{lines[0]}</p>;
              }

              return (
                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-muted-foreground mt-1 flex-shrink-0">•</span>
                      <p className="flex-1">{line}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </li>
      ))}
    </ol>
  );
}
