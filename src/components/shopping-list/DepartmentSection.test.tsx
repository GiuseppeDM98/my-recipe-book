import { fireEvent, render, screen } from '@testing-library/react';
import { Timestamp } from 'firebase/firestore';
import type { PantryMatchInfo } from '@/lib/utils/ingredient-matching';
import type { DepartmentRow, DepartmentSectionModel } from '@/lib/utils/shopping-departments';
import type { PantryItem } from '@/types/pantry';
import { DepartmentSection } from './DepartmentSection';
import type { ShoppingPantryContext } from './pantry-row-props';

function makePantryItem(overrides: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Farina',
    qty: 200,
    unit: 'g',
    categoryId: 'pasta-cereali',
    position: 'dispensa',
    purchased: null,
    expires: null,
    min: 0,
    notes: null,
    createdAt: Timestamp.fromMillis(0),
    updatedAt: Timestamp.fromMillis(0),
    ...overrides,
  };
}

function makeRow(overrides: Partial<DepartmentRow> = {}): DepartmentRow {
  return {
    rowKey: 'i1',
    kind: 'plan',
    id: 'i1',
    name: 'Farina',
    quantity: '250 g',
    checked: false,
    canonicalKey: 'farina',
    source: 'pantry',
    ...overrides,
  };
}

function makeSection(rows: DepartmentRow[]): DepartmentSectionModel {
  return { id: 'pasta-cereali', name: 'Pasta e cereali', color: 'oklch(80% 0.05 80)', rows };
}

function makeContext(
  info: Record<string, PantryMatchInfo>,
  overrides: Partial<ShoppingPantryContext> = {}
): ShoppingPantryContext {
  return {
    infoById: new Map(Object.entries(info)),
    confirmingSuggestionId: null,
    onTogglePantryIncluded: jest.fn(),
    onConfirmSuggestion: jest.fn(),
    onDismissSuggestion: jest.fn(),
    ...overrides,
  };
}

function renderSection(rows: DepartmentRow[], context?: ShoppingPantryContext) {
  render(
    <DepartmentSection
      section={makeSection(rows)}
      onToggle={jest.fn()}
      onRemove={jest.fn()}
      onMove={jest.fn()}
      pantryContext={context}
    />
  );
}

describe('DepartmentSection pantry information', () => {
  test('should show the stock badge with the shortfall on a partially stocked row', () => {
    // Arrange
    const context = makeContext({
      i1: { kind: 'badge', item: makePantryItem(), missingQuantity: '50 g' },
    });

    // Act
    renderSection([makeRow()], context);

    // Assert
    expect(screen.getByText(/In dispensa: .*mancano 50 g/)).toBeInTheDocument();
  });

  test('should send a re-included row back to "Hai già in casa", passing the ad-hoc group', () => {
    // Arrange
    const onTogglePantryIncluded = jest.fn();
    const context = makeContext(
      { a1: { kind: 'in-pantry', item: makePantryItem() } },
      { onTogglePantryIncluded }
    );

    // Act
    renderSection([makeRow({ rowKey: 'g1:a1', kind: 'adhoc', id: 'a1', groupId: 'g1' })], context);
    fireEvent.click(screen.getByRole('button', { name: /ce l’ho già/i }));

    // Assert
    expect(onTogglePantryIncluded).toHaveBeenCalledWith('a1', 'g1');
  });

  test('should offer the alias suggestion for a fuzzy candidate', () => {
    // Arrange
    const candidate = makePantryItem({ id: 'p2', name: 'Farina 00' });
    const onConfirmSuggestion = jest.fn();
    const context = makeContext(
      { i1: { kind: 'suggestion', candidates: [candidate] } },
      { onConfirmSuggestion }
    );

    // Act
    renderSection([makeRow({ source: 'dictionary' })], context);

    // Assert
    expect(screen.getByText('Farina 00')).toBeInTheDocument();
  });

  test('should render plain rows when no pantry context is given', () => {
    // Act
    renderSection([makeRow()]);

    // Assert
    expect(screen.queryByText(/In dispensa/)).not.toBeInTheDocument();
  });
});
