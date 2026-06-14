'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { PantryItem } from '@/types/pantry';
import {
  getPantryItems,
  createPantryItem,
  updatePantryItem,
  deletePantryItem,
} from '@/lib/firebase/pantry';

export const pantryQueryKey = (uid: string) => ['pantryItems', uid] as const;

export function usePantry() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: pantryQueryKey(user?.uid ?? ''),
    queryFn: () => getPantryItems(user!.uid),
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const invalidate = () => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: pantryQueryKey(user.uid) });
    }
  };

  const addItem = useMutation({
    mutationFn: (data: Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) =>
      createPantryItem(user!.uid, data),
    onSuccess: invalidate,
  });

  const updateItem = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>>;
    }) => updatePantryItem(id, data),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => deletePantryItem(id),
    onSuccess: invalidate,
  });

  return {
    items,
    isLoading,
    addItem,
    updateItem,
    deleteItem,
  };
}
