'use client';

interface FamilyContextToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hasValidProfile: boolean;
  compact?: boolean;
}

export function FamilyContextToggle({
  checked,
  onChange,
  disabled = false,
  hasValidProfile,
  compact = false,
}: FamilyContextToggleProps) {
  return (
    <div className={`rounded-lg border ${compact ? 'p-3' : 'p-4'} space-y-2`}>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <div>
          <p className="text-sm font-medium text-foreground">
            Usa il profilo famiglia per adattare porzioni e quantità
          </p>
          <p className="text-xs text-muted-foreground">
            L&apos;AI terrà conto del nucleo familiare per proporre quantità più adatte.
          </p>
        </div>
      </label>

      {!hasValidProfile && (
        <p className="text-xs text-amber-700">
          Salva prima almeno un componente valido nel profilo famiglia per poter attivare questa opzione.
        </p>
      )}
    </div>
  );
}
