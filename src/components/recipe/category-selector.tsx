'use client';

import { useState, useEffect } from 'react';
import { getUserCategories, getCategorySubcategories } from '@/lib/firebase/categories';
import { useAuth } from '@/lib/context/auth-context';
import { Category, Subcategory } from '@/types';

/**
 * CategorySelector - Cascading category/subcategory dropdowns
 *
 * ARCHITECTURE:
 * - Two-level hierarchy: Categories contain Subcategories
 * - Dependent loading: Subcategories load only after category selected
 * - Firestore queries: Two separate collections
 *
 * STATE MANAGEMENT:
 * 1. User auth → Load categories
 * 2. Category selection → Load subcategories for that category
 * 3. Category change → Clear subcategory selection (prevent orphaned selection)
 *
 * IMPORTANT: categoryId controls subcategory visibility
 */

interface CategorySelectorProps {
  selectedCategoryId?: string;
  selectedSubcategoryId?: string;
  onCategoryChange: (categoryId: string) => void;
  onSubcategoryChange: (subcategoryId: string) => void;
}

export function CategorySelector({
  selectedCategoryId,
  selectedSubcategoryId,
  onCategoryChange,
  onSubcategoryChange,
}: CategorySelectorProps) {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);

  // ========================================
  // Dependent async loading pattern
  // ========================================

  // Load categories on user auth
  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

  // Load subcategories when category changes
  // WHY SEPARATE EFFECT: Subcategories depend on category selection
  // WARNING: If category changes, subcategory selection must be cleared by parent
  useEffect(() => {
    if (selectedCategoryId) {
      loadSubcategories(selectedCategoryId);
    } else {
      setSubcategories([]); // Clear subcategories when no category selected
    }
  }, [selectedCategoryId]);

  const loadCategories = async () => {
    if (!user) return;

    try {
      const cats = await getUserCategories(user.uid);
      setCategories(cats);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubcategories = async (categoryId: string) => {
    if (!user) return;
    try {
      const subs = await getCategorySubcategories(categoryId, user.uid);
      setSubcategories(subs);
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  if (loading) return <div>Caricamento categorie...</div>;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-2">Categoria</label>
        <select
          value={selectedCategoryId || ''}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full border border-input rounded-md p-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <option value="">Seleziona categoria</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.icon} {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Only show subcategory dropdown if subcategories exist */}
      {/* WHY: Not all categories have subcategories → avoid empty dropdown */}
      {subcategories.length > 0 && (
        <div>
          <label className="block text-sm font-medium mb-2">Sottocategoria</label>
          <select
            value={selectedSubcategoryId || ''}
            onChange={(e) => onSubcategoryChange(e.target.value)}
            className="w-full border border-input rounded-md p-2 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <option value="">Seleziona sottocategoria</option>
            {subcategories.map(sub => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}