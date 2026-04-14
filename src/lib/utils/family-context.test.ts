import {
  buildFamilyContextPrompt,
  normalizeFamilyProfile,
  validateFamilyContextUsage,
} from '@/lib/utils/family-context';

describe('family-context utilities', () => {
  test('should reject empty family profile when toggle is enabled', () => {
    expect(validateFamilyContextUsage(true, { members: [], notes: null })).toBeTruthy();
  });

  test('should normalize a valid family profile', () => {
    const normalized = normalizeFamilyProfile({
      members: [
        { id: 'adult-1', age: 38, label: 'Mamma' },
        { id: 'child-1', age: 6, label: null },
      ],
      notes: 'Porzioni moderate la sera',
    });

    expect(normalized).toEqual({
      members: [
        { id: 'adult-1', age: 38, label: 'Mamma' },
        { id: 'child-1', age: 6, label: null },
      ],
      notes: 'Porzioni moderate la sera',
    });
  });

  test('should include members in the prompt when toggle is enabled', () => {
    const prompt = buildFamilyContextPrompt({
      members: [
        { id: 'adult-1', age: 42, label: 'Papà' },
        { id: 'child-1', age: 8, label: 'Figlio' },
      ],
      notes: 'Pranzi abbondanti nel weekend',
    }, true);

    expect(prompt).toContain('Papà: 42 anni');
    expect(prompt).toContain('Figlio: 8 anni');
    expect(prompt).toContain('Pranzi abbondanti nel weekend');
  });

  test('should return empty prompt when toggle is disabled', () => {
    expect(buildFamilyContextPrompt({
      members: [{ id: 'adult-1', age: 40, label: 'Adulto' }],
      notes: null,
    }, false)).toBe('');
  });
});
