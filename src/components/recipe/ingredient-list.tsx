import { Ingredient } from '@/types';

interface IngredientListProps {
  ingredients: Ingredient[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  return (
    <ul className="space-y-3">
      {ingredients.map((ingredient) => (
        <li key={ingredient.id} className="flex items-start">
          <span className="flex-shrink-0 mr-3 text-primary-600">&#10003;</span>
          <div>
            <span className="font-medium">{ingredient.name}</span>
            {ingredient.quantity && (
              <span className="text-muted-foreground ml-2">({ingredient.quantity})</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}