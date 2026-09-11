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
import { Spinner } from '@/components/ui/spinner';
import { Ingredient, Step } from '@/types';
import { SectionProposal, summarizeSectionProposal } from '@/lib/utils/section-assignments';

interface SectionProposalDialogProps {
  proposal: SectionProposal | null;
  ingredients: Ingredient[];
  steps: Step[];
  isApplying: boolean;
  onCancel: () => void;
  onApply: () => void;
}

/** Italian pluralization for the two counts shown per section. */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Preview of an AI section proposal, shown before anything is written.
 *
 * WHY A PREVIEW AND NOT A SILENT WRITE:
 * The action rearranges a recipe the user already owns. Showing which sections come out,
 * and how much lands in each, is what makes "Applica" an informed click rather than a
 * leap — and the wording states plainly that no text or quantity changes.
 *
 * Not a ConfirmDialog: nothing is being destroyed, so the confirm button keeps the
 * default weight. The in-flight lock is the same, though — the dialog can't be dismissed
 * mid-write.
 */
export function SectionProposalDialog({
  proposal,
  ingredients,
  steps,
  isApplying,
  onCancel,
  onApply,
}: SectionProposalDialogProps) {
  const summary = proposal ? summarizeSectionProposal(ingredients, steps, proposal) : [];

  return (
    <Dialog
      open={proposal !== null}
      onOpenChange={next => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Organizza in sezioni</DialogTitle>
          <DialogDescription>
            L&apos;AI propone questa suddivisione. Testi e quantità restano invariati.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-3">
          {summary.map(row => (
            <li key={row.section ?? 'no-section'} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="font-medium text-foreground">{row.section ?? 'Senza sezione'}</p>
              <p className="text-sm text-muted-foreground">
                {countLabel(row.ingredientCount, 'ingrediente', 'ingredienti')}
                {' · '}
                {countLabel(row.stepCount, 'passaggio', 'passaggi')}
              </p>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isApplying}>
            Annulla
          </Button>
          <Button type="button" onClick={onApply} disabled={isApplying}>
            {isApplying ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Applico…
              </>
            ) : (
              'Applica'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
