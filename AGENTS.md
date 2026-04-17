# AI Agent Guidelines - Il Mio Ricettario

**Focus**: solo gotcha che possono causare debug >30min. Per contesto architetturale: [CLAUDE.md](CLAUDE.md)

---

## Quick Reference

| Gotcha | Problema | Soluzione |
|--------|----------|-----------|
| Orientation classes | `portrait:` applica anche a desktop | Usare `max-lg:portrait:` |
| Firebase optional | `undefined` causa errori silenziosi | Usare `null` |
| Firestore composite index | query `where + orderBy` fallisce o rompe in runtime | Aggiungere indice in `firebase/firestore.indexes.json` e deployare |
| Firestore deploy drift | Rules/indexes aggiornati nel repo ma non in Firebase | Eseguire `firebase deploy --only firestore` |
| Cooking sessions | Duplicate se create in `useEffect` | Usare setup screen pattern |
| Cooking history | Statistiche vuote se si esce senza CTA finale | Registrare completamento solo da `Termina cottura` |
| Quantity format | Frazioni confuse (`1 1/2`) | Decimali (`1,5`) |
| useState prop | `useState(prop)` non reagisce ai cambi | Aggiungere `useEffect` di sync |
| AI route auth | Route AI protette falliscono con `401` | Inviare sempre `Authorization: Bearer <idToken>` con token aggiornato |
| Firebase Admin env | AI route protette falliscono anche con utente loggato | Configurare credenziali Firebase Admin lato server, non bastano le `NEXT_PUBLIC_FIREBASE_*` |
| Firebase Admin base64 | `FIREBASE_ADMIN_CREDENTIALS_BASE64` sembra valida ma il bootstrap fallisce | Il JSON service account usa chiavi snake_case (`project_id`, `client_email`, `private_key`) |
| Docker env | `docker compose` non legge `.env.local` | Usare `docker compose --env-file .env.local ...` |
| Local week dates | `toISOString().slice(0, 10)` slitta di giorno in `Europe/Rome` | Usare formatter locale (`formatLocalDate`, `getWeekMonday`) |
| Dynamic step quantities | Quantita' negli step restano statiche o finiscono disallineate | Usare token `{{qty:ingredientId}}` risolti a runtime |
| AI quantity references | L'AI non conosce gli `ingredientId` finali | Far emettere `[ING:n]` e `[QTY:n]`, poi convertirli nel parser |
| Family profile persistence | Si pensa di dover deployare rules o creare una collection nuova | Salvare in `users/{uid}.familyProfile`; le rules owner-based esistenti bastano |
| Family context scope | Il contesto famiglia altera flussi che devono restare fedeli all'input | Usarlo solo nei flussi generativi/adattivi (`chat`, `testo libero`, `pianificatore`), NON in `Carica PDF` |

---

## 1. Responsive Navigation

**Breakpoint `lg` = 1440px**.

```tsx
// ❌ SBAGLIATO
className="portrait:flex landscape:hidden"

// ✅ CORRETTO
className="max-lg:portrait:flex max-lg:landscape:hidden"
```

Pattern attivo:
- Desktop (≥1440px): sidebar sempre visibile
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sidebar drawer

Bottom nav su iOS: aggiungere `pb-safe`.

---

## 2. Firebase Patterns

### `null` vs `undefined`

Firebase rifiuta `undefined` in scrittura.

```ts
// ❌
{ servings: servings || undefined }

// ✅
{ servings: servings || null }
```

### Composite Index (CRITICAL)

Query con `where(...) + orderBy(...)` richiedono indice esplicito. Se l'errore e' catturato in un `catch` generico, lato UI puo' sembrare solo "nessun dato".

Indici oggi attivi da mantenere allineati nel repo:
- `categories`: `userId ASC`, `order ASC`
- `cooking_history`: `userId ASC`, `completedAt DESC`
- `cooking_sessions`: `userId ASC`, `lastUpdatedAt DESC`
- `meal_plans`: `userId ASC`, `weekStartDate DESC`
- `recipes`: `userId ASC`, `createdAt DESC`
- `subcategories`: `categoryId ASC`, `userId ASC`, `order ASC`

Quando cambi rules o indexes:

```bash
firebase deploy --only firestore
```

### Data Ownership

Ogni documento utente deve avere `userId` e ogni query deve filtrarlo.

```ts
query(collection(db, 'recipes'), where('userId', '==', userId))
```

### User Profile Extensions

Se aggiungi preferenze persistenti utente che non richiedono query dedicate, preferisci il documento esistente `users/{uid}` invece di aprire una nuova collection.

Pattern corretto per il profilo famiglia:
- storage: `users/{uid}.familyProfile`
- campi: `members`, `notes`
- campi opzionali persistiti: `null`, non `undefined`
- nessun deploy rules necessario se non cambi il modello di permessi

### Cooking History

Le statistiche non leggono da `cooking_sessions`.

Pattern corretto:
- `cooking_sessions`: stato effimero della sessione attiva
- `cooking_history`: evento append-only creato solo quando l'utente preme `Termina cottura`

Se la pagina statistiche mostra `Missing or insufficient permissions`, il primo sospetto e' quasi sempre: rules/indexes locali non ancora deployati.

---

## 3. React State Patterns

### `useState(prop)` non segue i cambi

```ts
// ❌
const [expanded, setExpanded] = useState(forceExpanded);

// ✅
const [expanded, setExpanded] = useState(forceExpanded);
useEffect(() => {
  if (forceExpanded) setExpanded(true);
}, [forceExpanded]);
```

### Viewed state vs loaded entity

Per entita' opzionali navigabili, non legare il contesto solo ai dati caricati.

```ts
// ❌
const viewedWeek = currentPlan?.weekStartDate;

// ✅
const viewedWeek = currentPlan?.weekStartDate ?? setupWeekStartDate;
```

---

## 4. Cooking Mode

### Setup Screen Pattern

Non creare sessioni in `useEffect`.

```ts
useEffect(() => {
  const session = await getCookingSession(recipeId, userId);
  setIsSetupMode(!session);
}, []);

const handleStart = () => createCookingSession(recipeId, userId, servings);
```

### Completion Pattern

Non auto-eliminare la sessione al 100%.

Pattern corretto:
- aggiornare checkbox ingredienti/step normalmente
- mostrare banner "Ricetta completata"
- chiudere esplicitamente con pulsante `Termina cottura`
- in quel momento: creare `cooking_history` + cancellare `cooking_session`

Questo evita che l'utente perda la sessione appena completa l'ultimo item e rende le statistiche affidabili.

### Italian Quantity Format

- `1,5 kg`, non `1.5 kg`
- no frazioni tipo `1/2`
- preservare range: `2-3` → `4-6`

---

## 5. Recipe Data Structure

Storage recipe:

```ts
interface Ingredient { id; name; quantity; section?: string | null; }
interface Step { id; order; description; section?: string | null; sectionOrder?: number | null; }
```

### Dynamic Step Quantities

Se uno step deve seguire le porzioni, non salvare il numero statico nel testo finale.

Pattern corretto:
- storage step: token interno `{{qty:ingredientId}}`
- rendering dettaglio/cottura: risoluzione via utility, non parsing testo in UI
- ricette AI nuove: usare marker intermedi `[ING:n]` negli ingredienti e `[QTY:n]` negli step, poi convertire nel parser

Per ricette legacy:
- nessuna migrazione bulk
- usare il pulsante di adattamento automatico in modifica ricetta
- convertire solo match ad alta confidenza; i casi ambigui devono restare invariati

### AI Step Shape

Quando aggiorni prompt AI per ricette:
- ogni step deve rappresentare UNA sola azione principale o un solo riferimento quantita'
- se una frase contiene due quantita' distinte, spezzarla in due step

Questo riduce i casi ambigui nel collegamento automatico ingredienti ↔ step.

### Step Ordering

Nel form ricetta il riordino e' lineare globale, non per sezione.

Pattern corretto:
- spostare lo step nell'array
- rinormalizzare sempre `order` a `1..n`
- lasciare invariata la semantica di `section`

---

## 6. UI Components

### Sheet Accessibility

Radix richiede `SheetDescription`.

```tsx
<SheetHeader>
  <SheetTitle>Titolo</SheetTitle>
  <SheetDescription className="sr-only">Descrizione</SheetDescription>
</SheetHeader>
```

### Category Colors

Per categorie usare palette preset, non `input[type=color]`.

Motivo:
- UX piu' stabile su mobile
- evita colori fuori palette e inconsistenza visiva

---

## 7. API Routes

### AI Route Authentication

Tutte le route AI richiedono auth Firebase lato server.

```ts
const idToken = await auth.currentUser?.getIdToken(true);
fetch('/api/format-recipe', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  },
});
```

Gotcha che costa debug:
- le `NEXT_PUBLIC_FIREBASE_*` bastano per il client, NON per la verifica server-side
- in locale puoi usare `FIREBASE_ADMIN_PROJECT_ID` + `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`
- su Vercel e' piu' robusto `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- se sono presenti entrambe, il codice usa prima `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- il JSON Firebase Admin reale usa snake_case (`project_id`, `client_email`, `private_key`)

### File Limit

Upload AI: max 4.4MB. Validare client-side.

### Family Context Scope

Il contesto famiglia serve per adattare quantità/porzioni, non per alterare input che devono restare fedeli alla sorgente.

Pattern corretto:
- `Chat AI`: SI'
- `Testo libero`: SI'
- `Pianificatore`: SI'
- `Carica PDF`: NO, deve restare estrazione pura

### Model Consistency

Il modello atteso sugli endpoint AI resta `claude-sonnet-4-6`. Se cambia, aggiornare tutti gli endpoint correlati.

---

## 8. Deployment

### Docker Compose

```bash
docker compose --env-file .env.local build
docker compose --env-file .env.local up --build
docker compose --env-file .env.local up --build -d
docker compose --env-file .env.local up -d
docker compose --env-file .env.local logs -f app
docker compose --env-file .env.local down
```

### Reliable Build Check

Se `npm run build` fallisce in sandbox su Turbopack/process binding:

```bash
npx next build --webpack
```

### Dependency Hygiene

Dopo `npm audit fix`, se il lockfile aggiorna una dipendenza diretta importante gia' validata in build, allineare anche `package.json` per evitare drift tra manifest e lockfile.

Esempio pratico di questa sessione:
- lockfile aggiornato a `next 16.2.3`
- `package.json` allineato a `^16.2.3`
