'use client';

import { useState, useEffect } from 'react';
import { getUserCategories } from '@/lib/firebase/categories';
import { useAuth } from '@/lib/context/auth-context';
import { Category } from '@/types';
import { cn } from '@/lib/utils/cn';

/**
 * CategorySelector - Multi-select category chips
 *
 * A recipe can belong to multiple categories (e.g. "Primi" + "Vegetariano").
 * Renders one toggle chip per category; clicking adds/removes it from the
 * selection. Subcategories are not part of the recipe flow anymore.
 */

interface CategorySelectorProps {
  selectedCategoryIds: string[];
  onChange: (ids: string[]) => void;
}

export function CategorySelector({
  selectedCategoryIds,
  onChange,
}: CategorySelectorProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadCategories = async () => {
      try {
        const cats = await getUserCategories(user.uid);
        setCategories(cats);
      } catch (error) {
        console.error('Error loading categories:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCategories();
  }, [user]);

  const toggleCategory = (categoryId: string) => {
    const isSelected = selectedCategoryIds.includes(categoryId);
    onChange(
      isSelected
        ? selectedCategoryIds.filter(id => id !== categoryId)
        : [...selectedCategoryIds, categoryId]
    );
  };

  if (loading) return <div>Caricamento categorie...</div>;

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Categorie</label>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna categoria disponibile. Creane una dalla pagina Categorie.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => {
            const selected = selectedCategoryIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => toggleCategory(cat.id)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors',
                  selected
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-secondary text-foreground hover:bg-secondary/70'
                )}
              >
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
