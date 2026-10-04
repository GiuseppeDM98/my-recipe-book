import { fireEvent, render, screen } from '@testing-library/react';
import { MealSlot } from '@/types';
import { MealSlotCell } from './MealSlotCell';

const slot = {
  dayIndex: 0,
  mealType: 'cena',
  existingRecipeId: 'r1',
  newRecipe: null,
  recipeTitle: 'Pasta al fenicottero',
} as MealSlot;

describe('MealSlotCell tap target', () => {
  test('should open the editor when the cell is tapped outside the title', () => {
    // Arrange
    const onClick = jest.fn();
    const { container } = render(<MealSlotCell slot={slot} isNew={false} onClick={onClick} />);

    // Act — the cell surface itself, i.e. its padding
    fireEvent.click(container.firstElementChild!);

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('should open the editor exactly once when the title is tapped', () => {
    // Arrange
    const onClick = jest.fn();
    render(<MealSlotCell slot={slot} isNew={false} onClick={onClick} />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Pasta al fenicottero' }));

    // Assert
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('should re-roll without opening the editor when ↺ is tapped', () => {
    // Arrange
    const onClick = jest.fn();
    const onRegenerate = jest.fn();
    render(<MealSlotCell slot={slot} isNew={false} onClick={onClick} onRegenerate={onRegenerate} />);

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'Rimescola questo slot' }));

    // Assert
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  test('should not open the editor when "Vai alla ricetta" is followed', () => {
    // Arrange
    const onClick = jest.fn();
    render(<MealSlotCell slot={slot} isNew={false} onClick={onClick} />);

    // Act
    fireEvent.click(screen.getByRole('link', { name: /Vai alla ricetta/ }));

    // Assert
    expect(onClick).not.toHaveBeenCalled();
  });
});
