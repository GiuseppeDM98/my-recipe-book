'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/auth-context';
import {
  getUserCategories,
  createCategory,
  deleteCategory,
  updateCategory,
  getCategorySubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  countSubcategories,
} from '@/lib/firebase/categories';
import { Category, Subcategory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { ColorPalettePicker } from '@/components/ui/color-palette-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Category Management Page - Complex CRUD with Nested Subcategories
 *
 * Architecture: Lazy loading pattern for subcategories to reduce initial load time.
 * - Categories: Loaded eagerly on page mount
 * - Subcategories: Loaded lazily when category is expanded
 *
 * State management: 4 concurrent dialog workflows (create, edit, delete, add subcategory).
 * Each dialog has independent state because they can't be open simultaneously (modal blocking),
 * each carries different data, and cleanup timing differs.
 *
 * Why lazy loading: With many categories, loading all subcategories upfront would be slow.
 * Lazy loading provides instant page load with data fetched only when needed.
 */
export default function GestioneCategoriePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#FF6B6B');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  // WARNING: If you modify subcategory structure, also update:
  // - getCategorySubcategories() in lib/firebase/categories.ts
  // - Subcategory type in types/index.ts
  // - Subcategory display in RecipeCard component
  const [subcategories, setSubcategories] = useState<Record<string, Subcategory[]>>({});
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<string | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null);
  const [deletingSubcategory, setDeletingSubcategory] = useState<Subcategory | null>(null);
  const [subcategoryCount, setSubcategoryCount] = useState<number>(0);

  const loadCategories = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userCategories = await getUserCategories(user.uid);
      setCategories(userCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Fetches subcategories for a specific category on demand.
   *
   * Why lazy: Performance optimization - only load when category is expanded.
   *
   * Side effects: Updates subcategories map with categoryId as key.
   */
  const loadSubcategories = async (categoryId: string) => {
    if (!user) return;
    try {
      const subs = await getCategorySubcategories(categoryId, user.uid);
      setSubcategories(prev => ({ ...prev, [categoryId]: subs }));
    } catch (error) {
      console.error('Error loading subcategories:', error);
    }
  };

  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

  // Load subcategories only when category is expanded.
  // Prevents unnecessary Firebase queries on page load.
  // Cache check (!subcategories[expandedCategoryId]) avoids duplicate fetches.
  useEffect(() => {
    if (expandedCategoryId && !subcategories[expandedCategoryId]) {
      loadSubcategories(expandedCategoryId);
    }
  }, [expandedCategoryId]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newCategoryName) return;

    const newCategoryData = {
      name: newCategoryName,
      icon: newCategoryIcon,
      color: newCategoryColor,
      order: categories.length + 1,
      isDefault: false,
    };

    try {
      await createCategory(user.uid, newCategoryData);
      setNewCategoryName('');
      setNewCategoryIcon('');
      setNewCategoryColor('#FF6B6B');
      await loadCategories(); // Refresh list
    } catch (error) {
      console.error('Error creating category:', error);
    }
  };

  /**
   * Prepares delete confirmation dialog with subcategory impact warning.
   *
   * Why separate function: Must pre-load subcategory count before showing dialog
   * to warn user about cascade deletion impact.
   *
   * Side effects: Firebase count query, state updates
   */
  const handleOpenDeleteDialog = async (category: Category) => {
    if (!user) return;
    setDeletingCategory(category);
    // Pre-load count to warn user about cascade deletion impact.
    // Firebase rules will cascade delete subcategories automatically,
    // but user needs to know how many will be deleted.
    const count = await countSubcategories(category.id, user.uid);
    setSubcategoryCount(count);
  };

  const handleDeleteCategory = async () => {
    if (!deletingCategory || !user) return;
    try {
      await deleteCategory(deletingCategory.id, user.uid);
      setDeletingCategory(null);
      setSubcategoryCount(0);
      await loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleAddSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !addingSubcategoryTo || !newSubcategoryName) return;

    try {
      const currentSubs = subcategories[addingSubcategoryTo] || [];
      await createSubcategory(
        user.uid,
        addingSubcategoryTo,
        newSubcategoryName,
        currentSubs.length + 1
      );
      setNewSubcategoryName('');
      setAddingSubcategoryTo(null);
      await loadSubcategories(addingSubcategoryTo);
    } catch (error) {
      console.error('Error creating subcategory:', error);
    }
  };

  /**
   * Expands/collapses category to show/hide subcategories (accordion pattern).
   *
   * Triggers: Lazy load via useEffect if subcategories not cached.
   *
   * State: Single expanded category at a time (clicking same category collapses it).
   */
  const toggleCategory = (categoryId: string) => {
    setExpandedCategoryId(prev => prev === categoryId ? null : categoryId);
  };

  const handleUpdateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubcategory) return;

    try {
      await updateSubcategory(editingSubcategory.id, {
        name: editingSubcategory.name,
      });
      setEditingSubcategory(null);
      await loadSubcategories(editingSubcategory.categoryId);
    } catch (error) {
      console.error('Error updating subcategory:', error);
    }
  };

  const handleDeleteSubcategory = async () => {
    if (!deletingSubcategory) return;

    try {
      await deleteSubcategory(deletingSubcategory.id);
      const categoryId = deletingSubcategory.categoryId;
      setDeletingSubcategory(null);
      await loadSubcategories(categoryId);
    } catch (error) {
      console.error('Error deleting subcategory:', error);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      await updateCategory(editingCategory.id, {
        name: editingCategory.name,
        icon: editingCategory.icon,
        color: editingCategory.color,
      });
      setEditingCategory(null);
      await loadCategories();
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Categorie</h1>
      </div>

      {/* Create Form */}
      <Card className="mb-6 p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold mb-4">Crea Nuova Categoria</h2>
        <form onSubmit={handleCreateCategory}>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
            <div className="flex-grow sm:min-w-[200px]">
              <label className="block text-sm font-medium mb-2">Nome</label>
              <Input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Es. Primi piatti"
                required
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1 sm:flex-none">
                <label className="block text-sm font-medium mb-2">Icona</label>
                <EmojiPicker
                  value={newCategoryIcon}
                  onSelect={setNewCategoryIcon}
                  className="w-full sm:w-20 h-10"
                />
              </div>
              <div className="flex-1 sm:flex-none">
                <ColorPalettePicker
                  value={newCategoryColor}
                  onChange={setNewCategoryColor}
                />
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full sm:w-auto">Crea Categoria</Button>
          </div>
        </form>
      </Card>

      {/* === CATEGORY LIST === */}
      {categories.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500">Nessuna categoria trovata</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => (
            <Card key={cat.id} className="overflow-hidden">
              <div className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 flex-grow min-w-0">
                    <span
                      className="text-2xl sm:text-3xl w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-lg flex-shrink-0"
                      style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                    >
                      {cat.icon || '●'}
                    </span>
                    <div className="flex-grow min-w-0">
                      <h3 className="font-semibold text-base sm:text-lg truncate">{cat.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {cat.isDefault ? 'Predefinita' : 'Personalizzata'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleCategory(cat.id)}
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      {expandedCategoryId === cat.id ? 'Chiudi' : 'Sottocategorie'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingCategory(cat)}
                      className="flex-1 sm:flex-none text-xs sm:text-sm"
                    >
                      Modifica
                    </Button>
                    {!cat.isDefault && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleOpenDeleteDialog(cat)}
                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                      >
                        Elimina
                      </Button>
                    )}
                  </div>
                </div>

                {/* Subcategories Section */}
                {expandedCategoryId === cat.id && (
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                    <div className="mb-3">
                      <h4 className="font-medium mb-2 text-sm sm:text-base">Sottocategorie</h4>
                      {subcategories[cat.id]?.length > 0 ? (
                        <div className="space-y-2">
                          {subcategories[cat.id].map((sub) => (
                            <div key={sub.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 bg-gray-50 rounded">
                              <span className="flex-grow min-w-0 text-sm sm:text-base break-words">{sub.name}</span>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingSubcategory(sub)}
                                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                                >
                                  Modifica
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => setDeletingSubcategory(sub)}
                                  className="flex-1 sm:flex-none text-xs sm:text-sm"
                                >
                                  Elimina
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs sm:text-sm text-gray-500">Nessuna sottocategoria</p>
                      )}
                    </div>
                    {addingSubcategoryTo === cat.id ? (
                      <form onSubmit={handleAddSubcategory} className="flex flex-col sm:flex-row gap-2">
                        <Input
                          type="text"
                          value={newSubcategoryName}
                          onChange={(e) => setNewSubcategoryName(e.target.value)}
                          placeholder="Nome sottocategoria"
                          required
                          className="flex-grow"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                            Aggiungi
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setAddingSubcategoryTo(null);
                              setNewSubcategoryName('');
                            }}
                            className="flex-1 sm:flex-none text-xs sm:text-sm"
                          >
                            Annulla
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setAddingSubcategoryTo(cat.id)}
                        className="w-full sm:w-auto text-xs sm:text-sm"
                      >
                        + Aggiungi Sottocategoria
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* === EDIT CATEGORY DIALOG === */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Categoria</DialogTitle>
            <DialogDescription>
              Modifica i dettagli della categoria
            </DialogDescription>
          </DialogHeader>
          {editingCategory && (
            <form onSubmit={handleUpdateCategory}>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nome</label>
                  <Input
                    type="text"
                    value={editingCategory.name}
                    onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                    placeholder="Nome categoria"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Icona</label>
                  <EmojiPicker
                    value={editingCategory.icon || ''}
                    onSelect={(icon) => setEditingCategory({ ...editingCategory, icon })}
                    className="w-20 h-10"
                  />
                </div>
                <div>
                  <ColorPalettePicker
                    value={editingCategory.color || '#FF6B6B'}
                    onChange={(color) => setEditingCategory({ ...editingCategory, color })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>
                  Annulla
                </Button>
                <Button type="submit">Salva Modifiche</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* === DELETE CATEGORY DIALOG === */}
      <Dialog open={!!deletingCategory} onOpenChange={(open) => {
        if (!open) {
          setDeletingCategory(null);
          setSubcategoryCount(0);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Categoria</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare la categoria "{deletingCategory?.name}"?
              {subcategoryCount > 0 && (
                <span className="block mt-2 font-semibold text-red-600">
                  Attenzione: verranno eliminate anche {subcategoryCount} sotto-categori{subcategoryCount === 1 ? 'a' : 'e'} associate.
                </span>
              )}
              <span className="block mt-2">Questa azione non può essere annullata.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDeletingCategory(null);
              setSubcategoryCount(0);
            }}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDeleteCategory}>
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === EDIT SUBCATEGORY DIALOG === */}
      <Dialog open={!!editingSubcategory} onOpenChange={(open) => !open && setEditingSubcategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Sottocategoria</DialogTitle>
            <DialogDescription>
              Modifica il nome della sottocategoria
            </DialogDescription>
          </DialogHeader>
          {editingSubcategory && (
            <form onSubmit={handleUpdateSubcategory}>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nome</label>
                  <Input
                    type="text"
                    value={editingSubcategory.name}
                    onChange={(e) => setEditingSubcategory({ ...editingSubcategory, name: e.target.value })}
                    placeholder="Nome sottocategoria"
                    required
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingSubcategory(null)}>
                  Annulla
                </Button>
                <Button type="submit">Salva Modifiche</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* === DELETE SUBCATEGORY DIALOG === */}
      <Dialog open={!!deletingSubcategory} onOpenChange={(open) => !open && setDeletingSubcategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Sottocategoria</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare la sottocategoria "{deletingSubcategory?.name}"? Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingSubcategory(null)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDeleteSubcategory}>
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
