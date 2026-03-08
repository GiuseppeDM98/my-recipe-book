# AI Agent Guidelines - Il Mio Ricettario

**Focus**: Solo gotcha che causano debug >30min. Per dettagli: [CLAUDE.md](CLAUDE.md)

---

## Quick Reference

| Gotcha | Problema | Soluzione |
|--------|----------|-----------|
| Orientation classes | `portrait:` applica anche a desktop | Usare `max-lg:portrait:` |
| Firebase optional | `undefined` causa errore silenzioso | Usare `null` |
| Cooking sessions | Duplicate se create in useEffect | Setup screen pattern |
| Quantity format | Frazioni confuse (`1 1/2`) | Decimali (`1,5`) |
| Sheet a11y | Warning Radix | Aggiungere `SheetDescription` |
| File upload | Request troppo grande | Max 4.4MB |

---

## 1. Responsive Navigation (CRITICAL)

**Breakpoint `lg` = 1440px** (non 1024px default).

```tsx
// ❌ SBAGLIATO - Applica a desktop
className="portrait:flex landscape:hidden"

// ✅ CORRETTO - Solo <1440px
className="max-lg:portrait:flex max-lg:landscape:hidden"
```

**Navigazione:**
- Desktop (≥1440px): Sidebar sempre visibile
- Mobile portrait: Bottom navigation (4 tab)
- Mobile landscape: Hamburger + sidebar sliding

**Viewport reset** - Layout resetta stato su cambio orientamento:
```tsx
useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth >= 1440 || portrait) setSidebarOpen(false);
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

**iOS Safe Area** - Bottom nav richiede: `className="pb-safe"`

---

## 2. Firebase Patterns

### `null` vs `undefined`

Firebase **rifiuta** `undefined`. Usare sempre `null` per campi opzionali:

```typescript
// ❌ { servings: servings || undefined }
// ✅ { servings: servings || null }
```

### Data Ownership

Ogni documento ha `userId`. **Tutte le query** devono filtrare:
```typescript
query(collection(db, 'recipes'), where('userId', '==', userId))
```

---

## 3. Cooking Mode

### Setup Screen Pattern

**NON creare sessioni in useEffect** - causa duplicati.

```typescript
// ❌ SBAGLIATO
useEffect(() => { if (!session) createCookingSession(...); }, []);

// ✅ CORRETTO - Setup screen
useEffect(() => {
  const session = await getCookingSession(recipeId, userId);
  setIsSetupMode(!session);  // Show setup if no session
}, []);

// Sessione creata SOLO su click utente
const handleStart = () => createCookingSession(recipeId, userId, servings);
```

### Auto-delete a 100%

```typescript
if (progress >= 1.0) {
  await deleteCookingSession(sessionId);
  router.push('/cotture-in-corso');
}
```

### Italian Quantity Format

- Decimali con **virgola**: `1,5 kg` (non `1.5 kg`)
- No frazioni: `0,5` (non `1/2`)
- Range preservati: `2-3` → `4-6`
- Invariate: `q.b.`, `quanto basta`

---

## 4. Recipe Data Structure

**Array flat con `section` opzionale:**

```typescript
interface Ingredient {
  id: string;
  name: string;
  quantity: string;
  section?: string | null;  // "Per la pasta"
}

interface Step {
  id: string;
  order: number;
  description: string;
  section?: string | null;
  sectionOrder?: number;    // Ordine PDF originale
}
```

**sectionOrder** preserva ordine sezioni dal PDF.
**Normalizzazione**: `"per la pasta"` → `"Per la pasta"`

---

## 5. UI Components

### Sheet Accessibility

Radix richiede `SheetDescription`:
```tsx
<SheetHeader>
  <SheetTitle>Titolo</SheetTitle>
  <SheetDescription className="sr-only">Descrizione</SheetDescription>
</SheetHeader>
```

### Client Components

Tutte le `page.tsx` hanno `'use client'`. Attenzione a hydration mismatch.

---

## 6. API Routes

**Limite file**: 4.4MB (Vercel edge). Validare client-side.

**Endpoints:**
- `POST /api/extract-recipes` - PDF → Claude → Markdown
- `POST /api/format-recipe` - Testo libero → Claude → Markdown (stessa struttura)
- `POST /api/suggest-category` - Recipe → Category + Season

**API key**: `ANTHROPIC_API_KEY` solo server-side (NO `NEXT_PUBLIC_`)

**Modello**: `claude-sonnet-4-6` su tutti gli endpoint. Aggiornare in tutti e tre se si cambia.

**Markdown nel testo**: Claude può produrre `**grassetto**` nelle descrizioni. `stripMarkdown()` in `recipe-parser.ts` lo rimuove. Aggiornare anche i prompt se si aggiungono nuovi endpoint.

---

## 7. AI Recipe Parser

### Formato ingredienti → strategie parser in cascata

`parseIngredientLine` in `recipe-parser.ts` tenta in ordine:
1. **Comma**: `"Pasta, 200 g"` ← formato preferito dal prompt `format-recipe`
2. **Colon**: `"Riso Carnaroli: 280g"` ← output naturale PDF
3. **Quantity-first**: `"500 g di farina"` ← fallback / ricette vecchie
4. **Quantity at end (regex)**: `"Farina 500 g"` ← legacy

**Se cambi il formato ingredienti nel prompt Claude, verifica che una delle strategie lo copra.**

### Metadata bold/plain inconsistente nei PDF

Il prompt di estrazione PDF vieta gli asterischi nel testo, ma Claude a volte applica la regola anche agli header metadata (`Porzioni`, `Tempo di preparazione`, ecc.). Il parser accetta entrambi i formati. **Non aggiungere mai `startsWith('**...')`** per nuovi campi metadata — usare sempre regex tipo `/^\*?\*?Label:/i`.

---

## References

- Architettura: [CLAUDE.md](CLAUDE.md)
- Setup: [README.md](README.md)
