'use client';

import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FamilyProfile } from '@/types';
import { normalizeFamilyProfile } from '@/lib/utils/family-context';

interface FamilyProfileCardProps {
  familyProfile: FamilyProfile | null;
  isLoading?: boolean;
  isSaving?: boolean;
  onSave: (profile: FamilyProfile) => Promise<void>;
}

interface MemberDraft {
  id: string;
  label: string;
  age: string;
}

function buildDraft(profile: FamilyProfile | null): { members: MemberDraft[]; notes: string } {
  const normalized = normalizeFamilyProfile(profile);

  if (!normalized) {
    return {
      members: [{ id: crypto.randomUUID(), label: '', age: '' }],
      notes: '',
    };
  }

  return {
    members: normalized.members.map((member) => ({
      id: member.id,
      label: member.label ?? '',
      age: String(member.age),
    })),
    notes: normalized.notes ?? '',
  };
}

export function FamilyProfileCard({
  familyProfile,
  isLoading = false,
  isSaving = false,
  onSave,
}: FamilyProfileCardProps) {
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const draft = buildDraft(familyProfile);
    setMembers(draft.members);
    setNotes(draft.notes);
  }, [familyProfile]);

  function updateMember(id: string, field: 'label' | 'age', value: string) {
    setMembers((prev) => prev.map((member) => (
      member.id === id ? { ...member, [field]: value } : member
    )));
  }

  function addMember() {
    setMembers((prev) => [...prev, { id: crypto.randomUUID(), label: '', age: '' }]);
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((member) => member.id !== id));
  }

  async function handleSave() {
    setError(null);
    setSuccess(null);

    const nextProfile: FamilyProfile = {
      members: members.map((member) => ({
        id: member.id,
        label: member.label.trim() || null,
        age: Number(member.age),
      })),
      notes: notes.trim() || null,
    };

    try {
      await onSave(nextProfile);
      setSuccess('Profilo famiglia salvato');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nel salvataggio del profilo famiglia');
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Profilo famiglia</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Salva i componenti del nucleo e note generali. I flussi AI useranno questo contesto solo quando attivi il toggle dedicato.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {members.map((member, index) => (
          <div key={member.id} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[1.5fr_120px_auto]">
            <input
              type="text"
              value={member.label}
              onChange={(e) => updateMember(member.id, 'label', e.target.value)}
              placeholder={`Componente ${index + 1} (opzionale)`}
              className="rounded-md border border-input px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <input
              type="number"
              min={0}
              max={120}
              value={member.age}
              onChange={(e) => updateMember(member.id, 'age', e.target.value)}
              placeholder="Età"
              className="rounded-md border border-input px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => removeMember(member.id)}
              disabled={members.length <= 1}
            >
              Rimuovi
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={addMember} className="gap-2">
        <Plus className="w-4 h-4" />
        Aggiungi componente
      </Button>

      <div>
        <label className="text-sm font-medium text-foreground mb-2 block">
          Note generali
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Esempio: due adulti, un bimbo di 4 anni, preferenza per porzioni moderate a cena."
          className="w-full rounded-md border border-input px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-accent">{success}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Caricamento profilo famiglia...</p>}

      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Salvataggio...' : 'Salva profilo famiglia'}
      </Button>
    </Card>
  );
}
