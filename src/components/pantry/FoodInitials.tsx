'use client';

interface FoodInitialsProps {
  name: string;
  size?: number;
}

export function FoodInitials({ name, size = 48 }: FoodInitialsProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <div
      className="flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs font-mono font-medium flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {initials}
    </div>
  );
}
