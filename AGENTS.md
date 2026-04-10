# AI Agent Guidelines - Il Mio Ricettario

**Focus**: Solo gotcha che causano debug >30min. Per dettagli: [CLAUDE.md](CLAUDE.md)

---

## Quick Reference

| Gotcha | Problema | Soluzione |
|--------|----------|-----------|
| Orientation classes | `portrait:` applica anche a desktop | Usare `max-lg:portrait:` |
| Firebase optional | `undefined` causa errore silenzioso | Usare `null` |
| Firestore composite index | query `where + orderBy` fallisce silenziosamente | Aggiungere indice in `firestore.indexes.json` |
| Cooking sessions | Duplicate se create in useEffect | Setup screen pattern |
| Quantity format | Frazioni confuse (`1 1/2`) | Decimali (`1,5`) |
| Sheet a11y | Warning Radix | Aggiungere `SheetDescription` |
| File upload | Request troppo grande | Max 4.4MB |
| useState prop | `useState(prop)` non reagisce ai cambi | Aggiungere `useEffect` per sync |
| Docker env | `docker compose` non legge `.env.local` automaticamente | Usare `docker compose --env-file .env.local ...` |
| Google OAuth self-hosted | Login Google fallisce su dominio custom | Aggiungere il dominio pubblico a Firebase Auth `Authorized domains` |

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

**iOS Safe Area** - Bottom nav richiede: `className="pb-safe"`

---

## 2. Firebase Patterns

### `null` vs `undefined`

Firebase **rifiuta** `undefined`. Usare sempre `null` per campi opzionali:

```typescript
// ❌ { servings: servings || undefined }
// ✅ { servings: servings || null }
```

### Composite Index (CRITICAL)

Query con `where('userId') + orderBy('altrocampo')` richiedono un indice composito esplicito. **Senza indice la query fallisce silenziosamente** se l'errore è catturato da un `catch` generico — nessun segnale visibile all'utente.

```json
// firebase/firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "meal_plans",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "weekStartDate", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deployare con `firebase deploy --only firestore` (aggiorna sia rules che indexes).

### Data Ownership

Ogni documento ha `userId`. **Tutte le query** devono filtrare:
```typescript
query(collection(db, 'recipes'), where('userId', '==', userId))
```

### Google OAuth on Self-Hosted Deployments

Docker **non richiede** workaround nel codice auth. Il vincolo reale e` l'origine pubblica dell'app.

- `localhost` funziona in locale se autorizzato in Firebase
- Deploy self-hosted pubblici richiedono il dominio esterno reale in Firebase Auth -> `Authorized domains`
- Nomi interni come `app`, `container`, `localhost` non servono per il traffico pubblico
- Se non vuoi configurare Google OAuth per self-hosting, usa `NEXT_PUBLIC_REGISTRATIONS_ENABLED=false`

---

## 3. React State Patterns

### useState con prop iniziale

`useState(propValue)` usa il valore **solo al primo render**. Se la prop cambia dopo il mount, lo state non si aggiorna automaticamente.

```typescript
// ❌ Non reagisce ai cambi di prop
const [expanded, setExpanded] = useState(forceExpanded);

// ✅ useEffect per sincronizzare
const [expanded, setExpanded] = useState(forceExpanded);
useEffect(() => { if (forceExpanded) setExpanded(true); }, [forceExpanded]);
```

---

## 4. Cooking Mode

### Setup Screen Pattern

**NON creare sessioni in useEffect** - causa duplicati.

```typescript
// ✅ CORRETTO - Setup screen
useEffect(() => {
  const session = await getCookingSession(recipeId, userId);
  setIsSetupMode(!session);
}, []);

// Sessione creata SOLO su click utente
const handleStart = () => createCookingSession(recipeId, userId, servings);
```

### Italian Quantity Format

- Decimali con **virgola**: `1,5 kg` (non `1.5 kg`)
- No frazioni: `0,5` (non `1/2`)
- Range preservati: `2-3` → `4-6`

---

## 5. Recipe Data Structure

**Array flat con `section` opzionale:**

```typescript
interface Ingredient { id; name; quantity; section?: string | null; }
interface Step { id; order; description; section?: string | null; sectionOrder?: number; }
```

**sectionOrder** preserva ordine sezioni dal PDF.

---

## 6. UI Components

### Sheet Accessibility

Radix richiede `SheetDescription`:
```tsx
<SheetHeader>
  <SheetTitle>Titolo</SheetTitle>
  <SheetDescription className="sr-only">Descrizione</SheetDescription>
</SheetHeader>
```

---

## 7. API Routes

**Limite file**: 4.4MB (Vercel edge). Validare client-side.

**Modello**: `claude-sonnet-4-6` su tutti gli endpoint. Aggiornare in tutti se si cambia.

**Markdown nel testo**: `stripMarkdown()` in `recipe-parser.ts` rimuove `**grassetto**`. Aggiornare i prompt se si aggiungono endpoint.

### Meal Planner AI (`plan-meals`)

Output Claude a due blocchi: `[PIANO]...[/PIANO]` (una riga JSON per slot) + `[RICETTE_NUOVE]...[/RICETTE_NUOVE]` (markdown ricette).

**Assegnazione ricette nuove per ordine** (non per titolo): `parsedNewRecipes[newRecipeIndex++]`. Il title-matching è fragile perché Claude può usare maiuscole/punteggiatura diverse tra i due blocchi.

**Suggerimenti categoria/stagione**: inclusi nel JSON del `[PIANO]` per slot `type="new"` (`"category"`, `"seasons"`). Vengono parsati e salvati in `MealSlot.suggestedCategoryName` / `suggestedSeasons`.

---

## 8. AI Recipe Parser

`parseIngredientLine` tenta in ordine:
1. **Comma**: `"Pasta, 200 g"` ← formato preferito
2. **Colon**: `"Riso: 280g"`
3. **Quantity-first**: `"500 g di farina"`
4. **Quantity at end (regex)**: `"Farina 500 g"`

`parseRecipeSection` usa `findIndex` per il primo `#` — non assume che sia `lines[0]`.

---

## 9. Deployment

### Docker Compose env loading

`docker compose` legge `.env` automaticamente, **non** `.env.local`.

```bash
# ❌ SBAGLIATO - .env.local non viene letto da Compose
docker compose up --build

# ✅ CORRETTO
docker compose --env-file .env.local up --build
```

### Next.js public env in Docker

Le variabili `NEXT_PUBLIC_*` sono **build-time sensitive**: Next.js le incorpora nel client bundle durante `next build`.

- Passarle come build args in Docker
- Ricostruire l'immagine se cambiano
- `ANTHROPIC_API_KEY` resta runtime-only

### Corporate network gotcha

Se Docker fallisce su `node:20-alpine` con errore `http: server gave HTTP response to HTTPS client`, il problema e` tipicamente **proxy/rete aziendale**, non del `Dockerfile`.

---

## References

- Architettura: [CLAUDE.md](CLAUDE.md)
- Setup: [README.md](README.md)
