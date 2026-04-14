# Test Session: Family Context

## Obiettivo
Verificare il comportamento introdotto in questa sessione:
- profilo famiglia persistito su Firebase/Firestore
- pagina dedicata `Profilo famiglia`
- toggle per usare il contesto famiglia nei flussi AI
- validazione quando il profilo manca o è vuoto
- mantenimento di `cooking_history` dopo eliminazione ricetta
- assenza di regressioni nei flussi AI esistenti

---

## 1. Profilo Famiglia

### Test 1.1 - Apertura pagina dedicata
1. Aprire la pagina `Profilo famiglia`
2. Verificare che la pagina sia raggiungibile da:
   - sidebar desktop
   - voce nel menu `Altro` su mobile
   - link da `Assistente AI`
   - link da `Pianificatore`

Risultato atteso:
- la pagina si apre correttamente
- il form mostra componenti famiglia + note generali

### Test 1.2 - Salvataggio profilo valido
1. Inserire almeno un componente con età valida
2. Facoltativamente inserire etichetta e note
3. Salvare

Risultato atteso:
- messaggio di successo
- nessun errore Firebase permissions
- ricaricando la pagina i dati restano presenti

### Test 1.3 - Persistenza su Firestore
1. Aprire Firebase Console
2. Andare in Firestore
3. Aprire `users/{uid}`

Risultato atteso:
- esiste il campo `familyProfile`
- shape attesa:

```json
{
  "familyProfile": {
    "members": [
      {
        "id": "...",
        "age": 6,
        "label": "Figlio"
      }
    ],
    "notes": "..."
  }
}
```

### Test 1.4 - Validazione profilo vuoto
1. Lasciare tutti i componenti senza età valida
2. Tentare il salvataggio

Risultato atteso:
- il salvataggio viene bloccato
- compare un messaggio chiaro tipo `Aggiungi almeno un componente valido`

---

## 2. Assistente AI

### Test 2.1 - Toggle visibile
1. Aprire `Assistente AI`
2. Cambiare tab tra:
   - PDF
   - Testo libero
   - Chat AI

Risultato atteso:
- in ogni modalità è visibile il toggle del contesto famiglia
- è presente il link a `Gestisci profilo`

### Test 2.2 - Toggle ON con profilo valido
1. Salvare un profilo famiglia valido
2. Attivare il toggle in:
   - PDF
   - Testo libero
   - Chat AI

Risultato atteso:
- il toggle resta attivabile
- nessun messaggio di blocco preventivo

### Test 2.3 - Toggle ON senza profilo valido
1. Rimuovere o invalidare il profilo famiglia
2. Tornare in `Assistente AI`
3. Tentare di usare il toggle e inviare una richiesta

Risultato atteso:
- la richiesta viene bloccata
- compare un messaggio chiaro che chiede di salvare prima un profilo valido

### Test 2.4 - Regressione PDF
1. Caricare un PDF valido con toggle OFF
2. Ripetere con toggle ON e profilo valido

Risultato atteso:
- entrambe le richieste funzionano
- il parsing finale delle ricette continua a funzionare
- nessun errore lato API

### Test 2.5 - Regressione testo libero
1. Inviare una ricetta grezza con toggle OFF
2. Ripetere con toggle ON e profilo valido

Risultato atteso:
- la formattazione continua a funzionare
- la ricetta risultante è salvabile normalmente

### Test 2.6 - Regressione chat AI
1. Avviare una chat con toggle OFF
2. Ripetere con toggle ON e profilo valido

Risultato atteso:
- la chat continua a rispondere
- se genera ricette, le card appaiono sotto come prima
- nessun errore nel multi-turn

---

## 3. Pianificatore

### Test 3.1 - Toggle presente nel setup
1. Aprire `Pianificatore`
2. Restare nella schermata setup

Risultato atteso:
- il toggle contesto famiglia è visibile
- è presente il link a `Gestisci profilo`

### Test 3.2 - Generazione piano con toggle OFF
1. Generare un piano AI con toggle OFF

Risultato atteso:
- il piano viene generato normalmente
- nessuna regressione rispetto al comportamento precedente

### Test 3.3 - Generazione piano con toggle ON e profilo valido
1. Attivare il toggle
2. Generare un piano AI con profilo valido

Risultato atteso:
- il piano viene generato correttamente
- eventuali nuove ricette continuano a comparire e a essere salvabili

### Test 3.4 - Generazione piano con toggle ON e profilo mancante
1. Attivare il toggle senza profilo valido
2. Tentare `Genera piano con AI`

Risultato atteso:
- generazione bloccata
- messaggio chiaro di validazione

---

## 4. Semantica Elimina Ricetta

### Test 4.1 - Copy conferma eliminazione
1. Aprire una ricetta
2. Premere `Elimina`

Risultato atteso:
- il messaggio di conferma spiega che lo storico cotture resta disponibile

### Test 4.2 - Mantenimento cooking_history
1. Completare una cottura con `Termina cottura`
2. Verificare che compaia in `Statistiche`
3. Eliminare la ricetta collegata
4. Tornare in `Statistiche`

Risultato atteso:
- l’entry storica resta visibile
- il titolo snapshot resta leggibile
- i conteggi non vengono azzerati

---

## 5. Regressioni Tecniche

### Test 5.1 - Build
Eseguire:

```bash
npx next build --webpack
```

Risultato atteso:
- build completata senza errori

### Test 5.2 - Test unitari family context
Eseguire:

```bash
npx jest src/lib/utils/family-context.test.ts --runInBand
```

Risultato atteso:
- test verdi

### Test 5.3 - Endpoint legacy senza nuovi campi
Verificare che le chiamate ai quattro endpoint AI funzionino anche quando:
- `useFamilyContext` è assente
- `familyProfile` è assente

Risultato atteso:
- backward compatibility mantenuta

---

## Esito Atteso Finale
La sessione può essere considerata verificata se:
- il profilo famiglia si salva e si ricarica da Firestore
- i toggle AI funzionano solo con profilo valido
- i flussi AI esistenti non si rompono
- `cooking_history` resta intatto dopo eliminazione ricetta
- build e test unitari passano
