# Feature: Storico piani settimanali

## Descrizione

Attualmente il pianificatore supporta un solo piano attivo alla volta. Cliccando "Nuovo piano" il piano corrente viene eliminato da Firebase prima di crearne uno nuovo.

L'obiettivo di questa feature è permettere all'utente di avere **più piani salvati** — uno per ogni settimana — con la possibilità di navigare tra settimane passate e future senza perdere i dati.

---

## Comportamento attuale (da cambiare)

- `resetToSetup()` in `useMealPlanner.ts` chiama `deleteMealPlan()` e cancella il piano attivo
- Al mount della pagina, `getLatestMealPlan()` carica il piano più recente
- Non c'è modo di tornare a un piano di una settimana precedente

## Comportamento desiderato

- **"Nuovo piano"** non cancella il piano corrente — lo lascia in Firebase e torna al form di setup
- **Navigazione settimane** (frecce ← → nell'header) carica il piano della settimana adiacente se esiste, oppure apre il form di setup per quella settimana
- Al mount, caricare il piano della **settimana corrente** (non il più recente in assoluto)
- Se non esiste un piano per la settimana corrente, mostrare il setup
- Lista piani passati accessibile (opzionale, può essere un drawer o una pagina separata)

---

## Infrastruttura già pronta

Tutto il layer Firebase è già implementato e non richiede modifiche:

- `getMealPlanByWeek(userId, weekStartDate)` — recupera il piano per una specifica settimana
- `getUserMealPlans(userId)` — lista tutti i piani ordinati per data DESC
- `getLatestMealPlan(userId)` — piano più recente (usato attualmente al mount)
- `deleteMealPlan(planId)` — elimina un piano specifico
- `getCurrentWeekMonday()` in `seasons.ts` — restituisce il lunedì della settimana corrente

---

## Modifiche necessarie

### 1. `src/lib/hooks/useMealPlanner.ts`

**`resetToSetup()`** — rimuovere la chiamata a `deleteMealPlan`. Il piano rimane salvato in Firebase:

```typescript
const resetToSetup = useCallback(() => {
  // Non eliminare — l'utente potrebbe voler tornare a questo piano
  setCurrentPlan(null);
  setStep('setup');
  setError(null);
}, []);
```

Aggiungere **`loadPlanForWeek(weekStartDate)`** per navigazione settimane:

```typescript
const loadPlanForWeek = useCallback(async (weekStartDate: string) => {
  if (!user) return;
  const plan = await getMealPlanByWeek(user.uid, weekStartDate);
  if (plan) {
    loadPlan(plan);
  } else {
    // Nessun piano per quella settimana → torna al setup con la data preimpostata
    setCurrentPlan(null);
    setStep('setup');
    // Il form di setup deve ricevere weekStartDate come prop iniziale
  }
}, [user, loadPlan]);
```

Esporre `loadPlanForWeek` nel return hook.

### 2. `src/app/(dashboard)/pianificatore/page.tsx`

**Mount**: usare `getMealPlanByWeek(user.uid, getCurrentWeekMonday())` invece di `getLatestMealPlan()` — così si carica il piano della settimana corrente, non l'ultimo in assoluto.

**`handlePrevWeek` / `handleNextWeek`**: implementare davvero la navigazione. Calcolare il `weekStartDate` della settimana adiacente e chiamare `loadPlanForWeek()`:

```typescript
function handlePrevWeek() {
  if (!currentPlan) return;
  const d = new Date(currentPlan.weekStartDate + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  loadPlanForWeek(d.toISOString().slice(0, 10));
}

function handleNextWeek() {
  if (!currentPlan) return;
  const d = new Date(currentPlan.weekStartDate + 'T00:00:00');
  d.setDate(d.getDate() + 7);
  loadPlanForWeek(d.toISOString().slice(0, 10));
}
```

**`handleDeletePlan`**: mantenere la cancellazione esplicita (l'utente sceglie consapevolmente di eliminare). Aggiungere `loadPlanForWeek(getCurrentWeekMonday())` dopo la cancellazione per tornare al piano della settimana corrente (o al setup se non esiste).

**"Nuovo piano"**: rimuovere il `confirm()` e chiamare solo `resetToSetup()` senza cancellare.

### 3. `src/components/meal-planner/MealPlanSetupForm.tsx`

Accettare una prop `initialWeekStartDate?: string` per preimpostare la settimana quando si naviga verso una settimana senza piano:

```typescript
interface MealPlanSetupFormProps {
  // ...esistenti...
  initialWeekStartDate?: string;
}
```

Usarla nell'`useState` iniziale invece di `getCurrentWeekMonday()`.

### 4. `src/components/meal-planner/PlannerHeader.tsx`

Aggiungere indicatori visivi per le frecce di navigazione:
- Freccia ← attiva se esiste un piano la settimana precedente (opzionale, richiede query aggiuntiva)
- Oppure: entrambe le frecce sempre attive, se non c'è un piano per quella settimana → mostra il setup

Aggiungere un pulsante **"Elimina piano"** distinto da "Nuovo piano" per rendere chiara la differenza tra "creo un piano nuovo" (non cancella) e "elimino questo piano" (cancella definitivamente).

---

## UX Flow aggiornato

```
Mount pagina
  └─ getMealPlanByWeek(settimana corrente)
       ├─ esiste → CALENDAR
       └─ non esiste → SETUP (con settimana corrente preimpostata)

Click "Nuovo piano"
  └─ resetToSetup() senza cancellare → SETUP

Click freccia ← / →
  └─ loadPlanForWeek(settimana adiacente)
       ├─ esiste → CALENDAR (piano caricato)
       └─ non esiste → SETUP (con settimana adiacente preimpostata)

Click "Elimina piano"
  └─ confirm() → deleteMealPlan() → loadPlanForWeek(settimana corrente)
```

---

## Prompt per sessione futura

```
Leggi docs/pianificatore-storico-piani.md prima di iniziare.

Voglio implementare la feature "Storico piani settimanali" descritta in docs/pianificatore-storico-piani.md.

L'infrastruttura Firebase è già pronta (getMealPlanByWeek, getUserMealPlans, ecc.).
Le modifiche riguardano principalmente:
1. useMealPlanner.ts — resetToSetup senza delete, nuovo loadPlanForWeek
2. pianificatore/page.tsx — mount con settimana corrente, navigazione frecce reale
3. MealPlanSetupForm.tsx — prop initialWeekStartDate
4. PlannerHeader.tsx — distinzione "Nuovo piano" vs "Elimina piano"

Segui il comportamento desiderato e il flow UX descritti nel documento.
Verifica che il build TypeScript passi dopo ogni modifica.
```
