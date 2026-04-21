'use client';

import { RecipeForm } from '@/components/recipe/recipe-form';

export default function NewRecipePage() {
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold italic mb-8">Crea una nuova ricetta</h1>
      <RecipeForm mode="create" />
    </div>
  );
}