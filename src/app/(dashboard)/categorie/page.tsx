'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/auth-context';
import {
  getUserCategories,
  createCategory,
  deleteCategory,
  updateCategory,
} from '@/lib/firebase/categories';
import { Category } from '@/types';
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
 * Category Management Page - CRUD on the user's recipe categories.
 *
 * Categories are loaded eagerly on mount: the collection is small (a handful of
 * documents per user) and every row is visible at once, so there is nothing to defer.
 *
 * State management: create is an inline form, edit and delete are separate dialogs.
 * Each dialog keeps its own state because they can't be open simultaneously (modal
 * blocking), they carry different data, and their cleanup timing differs.
 *
 * Note: deleting a category does NOT delete the recipes in it — they simply lose that
 * tag. A recipe can belong to several categories at once (see getRecipeCategoryIds).
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

  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

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

  const handleDeleteCategory = async () => {
    if (!deletingCategory || !user) return;
    try {
      await deleteCategory(deletingCategory.id);
      setDeletingCategory(null);
      await loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
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
    <div>
      <div className="mb-8">
        <h1 className="font-display text-4xl font-semibold italic">Categorie</h1>
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
          <p className="text-muted-foreground">Nessuna categoria trovata</p>
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
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {cat.isDefault ? 'Predefinita' : 'Personalizzata'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
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
                        onClick={() => setDeletingCategory(cat)}
                        className="flex-1 sm:flex-none text-xs sm:text-sm"
                      >
                        Elimina
                      </Button>
                    )}
                  </div>
                </div>
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
      <Dialog open={!!deletingCategory} onOpenChange={(open) => !open && setDeletingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Categoria</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare la categoria "{deletingCategory?.name}"?
              <span className="block mt-2">
                Le ricette che la usano non vengono eliminate: perdono soltanto questa categoria.
              </span>
              <span className="block mt-2">Questa azione non può essere annullata.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingCategory(null)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDeleteCategory}>
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
