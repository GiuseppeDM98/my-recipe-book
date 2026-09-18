import {
  buildVariantChips,
  clampServingsPlanned,
  resolveDefaultServingsPlanned,
  resolvePlannerMembers,
} from '@/lib/utils/planner-members';

const profile = {
  members: [
    { id: 'marco', age: 40, label: 'Marco' },
    { id: 'sofia', age: 8, label: 'sofia' },
    { id: 'anon', age: 3, label: null },
  ],
};

describe('resolvePlannerMembers', () => {
  it('should resolve labels with the Componente N fallback on the normalized position', () => {
    expect(resolvePlannerMembers(profile)).toEqual([
      { id: 'marco', label: 'Marco' },
      { id: 'sofia', label: 'sofia' },
      { id: 'anon', label: 'Componente 3' },
    ]);
  });

  it('should drop invalid members exactly like the AI family context does', () => {
    // Arrange — age out of range, so normalizeFamilyProfile discards the member
    const members = resolvePlannerMembers({
      members: [
        { id: 'ghost', age: 400, label: 'Ghost' },
        { id: 'anon', age: 3, label: null },
      ],
    });

    // Assert — the survivor is numbered on the normalized array, not the raw one
    expect(members).toEqual([{ id: 'anon', label: 'Componente 1' }]);
  });

  it.each([null, undefined, { members: [] }])('should return no members for %p', input => {
    expect(resolvePlannerMembers(input)).toEqual([]);
  });
});

describe('resolveDefaultServingsPlanned', () => {
  it('should default to the family size', () => {
    expect(resolveDefaultServingsPlanned(profile)).toBe(3);
  });

  it('should fall back to 2 without a valid profile', () => {
    expect(resolveDefaultServingsPlanned(null)).toBe(2);
    expect(resolveDefaultServingsPlanned({ members: [] })).toBe(2);
  });
});

describe('clampServingsPlanned', () => {
  it.each([
    [0, 1],
    [21, 20],
    [3.4, 3],
    [Number.NaN, 2],
  ])('should turn %p into %p', (input, expected) => {
    expect(clampServingsPlanned(input)).toBe(expected);
  });
});

describe('buildVariantChips', () => {
  const members = resolvePlannerMembers(profile);

  it('should show the uppercase initial of a single member', () => {
    // Act
    const { chips, overflowCount } = buildVariantChips(
      [{ id: 'v1', memberIds: ['sofia'], recipeTitle: 'Minestrone' }],
      members
    );

    // Assert
    expect(chips).toEqual([
      { key: 'v1', text: 'S', description: 'sofia: Minestrone', hasRemovedMember: false },
    ]);
    expect(overflowCount).toBe(0);
  });

  it('should append +n when the variant covers several members', () => {
    const { chips } = buildVariantChips(
      [{ id: 'v1', memberIds: ['marco', 'sofia', 'anon'], recipeTitle: 'Riso' }],
      members
    );

    expect(chips[0].text).toBe('M+2');
    expect(chips[0].description).toBe('Marco, sofia, Componente 3: Riso');
  });

  it('should mark a member who left the profile and fall back to ? when nobody is known', () => {
    const { chips } = buildVariantChips(
      [
        { id: 'v1', memberIds: ['gone'], recipeTitle: 'Riso' },
        { id: 'v2', memberIds: ['gone', 'marco'], recipeTitle: 'Pasta' },
      ],
      members
    );

    expect(chips[0]).toMatchObject({ text: '?', hasRemovedMember: true });
    expect(chips[0].description).toBe('Componente rimosso: Riso');
    // A current member still gives the chip a readable letter.
    expect(chips[1]).toMatchObject({ text: 'M+1', hasRemovedMember: true });
  });

  it('should cap the chips and report the overflow', () => {
    const variants = ['a', 'b', 'c', 'd', 'e'].map(id => ({
      id,
      memberIds: ['marco'],
      recipeTitle: 'Riso',
    }));

    const { chips, overflowCount } = buildVariantChips(variants, members);

    expect(chips).toHaveLength(3);
    expect(overflowCount).toBe(2);
  });

  it('should ignore variants without members', () => {
    const { chips } = buildVariantChips([{ id: 'v1', memberIds: [], recipeTitle: 'Riso' }], members);

    expect(chips).toEqual([]);
  });
});
