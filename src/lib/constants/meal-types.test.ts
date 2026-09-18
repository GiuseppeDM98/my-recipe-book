import { sortMealTypes, SELECTABLE_MEAL_TYPES, MEAL_LABELS } from '@/lib/constants/meal-types';
import { MealType } from '@/types';

describe('sortMealTypes', () => {
  it('ordina le portate nell\'ordine canonico della giornata', () => {
    expect(sortMealTypes(['cena', 'colazione', 'pranzo'])).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('inserisce spuntino e merenda nella posizione canonica', () => {
    expect(sortMealTypes(['cena', 'merenda', 'pranzo', 'spuntino', 'colazione']))
      .toEqual(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);
  });

  it('riproduce il caso del bug: colazione appesa in coda da addMealType', () => {
    expect(sortMealTypes(['pranzo', 'cena', 'colazione'])).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('mette i tipi legacy in coda mantenendo il loro ordine relativo (sort stabile)', () => {
    expect(sortMealTypes(['dolce', 'cena', 'primo', 'colazione', 'contorno']))
      .toEqual(['colazione', 'cena', 'dolce', 'primo', 'contorno']);
  });

  it('gestisce array vuoto e singolo elemento', () => {
    expect(sortMealTypes([])).toEqual([]);
    expect(sortMealTypes(['merenda'])).toEqual(['merenda']);
  });

  it('non muta l\'array di input', () => {
    const input: MealType[] = ['cena', 'colazione'];
    sortMealTypes(input);
    expect(input).toEqual(['cena', 'colazione']);
  });

  it('è idempotente su input già ordinato', () => {
    const sorted = sortMealTypes(['spuntino', 'cena', 'primo']);
    expect(sortMealTypes(sorted)).toEqual(sorted);
  });
});

describe('costanti portate', () => {
  it('SELECTABLE_MEAL_TYPES è l\'ordine canonico con spuntini', () => {
    expect(SELECTABLE_MEAL_TYPES).toEqual(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);
  });

  it('MEAL_LABELS copre le nuove portate', () => {
    expect(MEAL_LABELS.spuntino).toBe('Spuntino');
    expect(MEAL_LABELS.merenda).toBe('Merenda');
  });
});
