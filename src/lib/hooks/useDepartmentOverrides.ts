'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { getDepartmentOverrides, setDepartmentOverride } from '@/lib/firebase/department-overrides';
import { getPantryCategory } from '@/lib/utils/pantry-utils';

export const departmentOverridesQueryKey = (uid: string) => ['departmentOverrides', uid] as const;

interface SetDepartmentOverrideInput {
  canonicalKey: string;
  departmentId: string;
  /**
   * Department of the pantry entry this ingredient matches, when there is one.
   * A pantry match wins over the override, so the success toast must not
   * promise a move that will not show.
   */
  pantryDepartmentId?: string;
}

/**
 * "Sposta in reparto…" overrides for the shopping list's department view.
 *
 * No invalidation of ['shoppingList'] on write: classification is a
 * downstream useMemo over this query's data, so invalidating
 * ['departmentOverrides'] alone is enough to recompute the view.
 */
export function useDepartmentOverrides() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: overrides = {} } = useQuery({
    queryKey: departmentOverridesQueryKey(user?.uid ?? ''),
    queryFn: () => getDepartmentOverrides(user!.uid),
    enabled: !!user,
  });

  const setOverride = useMutation({
    mutationFn: ({ canonicalKey, departmentId }: SetDepartmentOverrideInput) =>
      setDepartmentOverride(user!.uid, canonicalKey, departmentId),
    onSuccess: (_, { departmentId, pantryDepartmentId }) => {
      queryClient.invalidateQueries({ queryKey: departmentOverridesQueryKey(user!.uid) });
      if (pantryDepartmentId && pantryDepartmentId !== departmentId) {
        // The override is saved but not visible: say where the row really is.
        toast(`È già in dispensa: resta in ${getPantryCategory(pantryDepartmentId)?.name ?? 'Altro'}`, { icon: 'ℹ️' });
        return;
      }
      toast.success(`Spostato in ${getPantryCategory(departmentId)?.name ?? 'Altro'}`);
    },
    onError: () => toast.error('Impossibile salvare il reparto. Riprova.'),
  });

  return { overrides, setOverride };
}
