import { render, screen } from '@testing-library/react';
import { Step } from '@/types';
import { orderedSectionNamesFromSteps } from '@/lib/utils/section-assignments';
import { StepsListCollapsible } from './steps-list-collapsible';

function makeStep(id: string, order: number, overrides: Partial<Step> = {}): Step {
  return { id, order, description: `Passaggio ${order}`, ...overrides };
}

/** Section names in the order their headers appear on screen. */
function renderedSectionOrder(names: string[]): string[] {
  return [...names].sort((a, b) =>
    screen.getByText(a).compareDocumentPosition(screen.getByText(b)) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1
  );
}

describe('StepsListCollapsible section order', () => {
  test('should follow the same order the ingredient column receives when only some steps carry sectionOrder', () => {
    // Arrange — a reorganized recipe (sectionOrder set) to which a step with a new
    // section was later added from the form (no sectionOrder).
    const steps = [
      makeStep('s1', 1, { section: 'Per il ragù', sectionOrder: 2 }),
      makeStep('s2', 2, { section: 'Per il ragù', sectionOrder: 2 }),
      makeStep('s3', 3, { section: 'Per il ragù', sectionOrder: 2 }),
      makeStep('s4', 4, { section: 'Per servire' }),
    ];

    // Act
    render(<StepsListCollapsible steps={steps} />);

    // Assert — the ingredient column is ordered with orderedSectionNamesFromSteps()
    const ingredientColumnOrder = orderedSectionNamesFromSteps(steps);
    expect(ingredientColumnOrder).toEqual(['Per il ragù', 'Per servire']);
    expect(renderedSectionOrder(['Per servire', 'Per il ragù'])).toEqual(ingredientColumnOrder);
  });

  test('should keep first-appearance order when no step carries sectionOrder', () => {
    // Arrange
    const steps = [
      makeStep('s1', 1, { section: 'Per la copertura' }),
      makeStep('s2', 2, { section: 'Per la base' }),
    ];

    // Act
    render(<StepsListCollapsible steps={steps} />);

    // Assert
    expect(renderedSectionOrder(['Per la base', 'Per la copertura'])).toEqual([
      'Per la copertura',
      'Per la base',
    ]);
  });
});
