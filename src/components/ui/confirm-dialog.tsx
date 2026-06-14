'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Visual weight of the confirm action. Destructive = ruggine d'allerta. */
  variant?: 'default' | 'destructive';
  /** True while the confirm action is in-flight; locks the dialog open. */
  isConfirming?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * Brand-consistent replacement for native `window.confirm()`.
 *
 * WHY: native confirm() opens an unstyled system dialog that breaks the
 * "Carta e Terracotta" editorial register and can't be focus-trapped or themed.
 * This reuses the app's Dialog primitive so every confirmation looks like the
 * rest of the product. Controlled: the parent owns open state and the action.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  variant = 'destructive',
  isConfirming = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let a backdrop click or Esc dismiss while the action runs.
        if (!isConfirming) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
