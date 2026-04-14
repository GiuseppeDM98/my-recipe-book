# Test Guide - Dynamic Step Quantities

## Goal
Verificare le funzionalità implementate in questa sessione:
- quantità dinamiche negli step;
- supporto automatico per nuove ricette generate dall'AI;
- adattamento automatico per ricette esistenti in modifica;
- coerenza tra dettaglio ricetta e modalità cottura.

## Preconditions
- App avviata e autenticazione funzionante.
- Utente con almeno una ricetta esistente che contenga quantità statiche negli step.
- Possibilità di creare almeno una nuova ricetta tramite uno dei flussi AI:
  - upload PDF;
  - formatta ricetta da testo;
  - chat AI;
  - pianificatore con ricette nuove.

## 1. Ricetta Esistente - Adattamento Automatico
- Apri una ricetta esistente con step che citano quantità statiche, per esempio:
  `Tagliare 300 g di mele a cubetti e i restanti 100 g a fette...`
- Entra in modifica ricetta.
- Vai alla sezione `Preparazione`.
- Clicca `Adatta step esistenti`.
- Verifica che compaia un messaggio riepilogativo con numero step convertiti e, se presenti, step lasciati invariati.
- Controlla che gli step convertiti mostrino `Collegamenti attivi`.
- Salva la ricetta.

Atteso:
- Gli step con match chiaro vengono convertiti automaticamente.
- Gli step ambigui non vengono toccati.
- Nessun crash o perdita di testo nello step.

## 2. Ricetta Esistente - Vista Dettaglio
- Apri il dettaglio della ricetta appena salvata.
- Controlla gli step convertiti.

Atteso:
- Le quantità nello step si vedono come testo naturale, non come token interni.
- Non devono comparire stringhe tipo `{{qty:...}}`.

## 3. Ricetta Esistente - Modalità Cottura
- Dalla stessa ricetta entra in modalità cottura.
- Cambia il numero di porzioni.
- Controlla sia la colonna ingredienti sia la colonna preparazione.

Atteso:
- Le quantità ingredienti cambiano.
- Anche le quantità dentro gli step cambiano in modo coerente.
- Gli step senza collegamento dinamico restano invariati.

## 4. Nuova Ricetta AI - Extract/Format/Chat
- Crea una nuova ricetta usando un flusso AI.
- Se possibile, usa una ricetta che abbia almeno due ingredienti con quantità diverse citati anche negli step.
- Apri l'anteprima o salva la ricetta.
- Entra poi nel dettaglio ricetta e in modifica ricetta.

Atteso:
- Gli step AI dovrebbero già essere predisposti per le quantità dinamiche senza conversione manuale.
- In modifica ricetta, gli step dovrebbero mostrare `Collegamenti attivi` se sono stati creati riferimenti dinamici.
- Nel dettaglio ricetta il testo deve essere naturale e senza token visibili.

## 5. Nuova Ricetta AI - Qualità degli Step
- Genera una ricetta AI che normalmente potrebbe contenere una frase con due quantità diverse.
- Controlla la struttura degli step prodotti.

Atteso:
- L'AI dovrebbe spezzare gli step quando una singola frase contiene due quantità distinte o due trasformazioni diverse.
- Esempio desiderato:
  - `Taglia 300 g di mele a cubetti`
  - `Taglia i restanti 100 g a fette...`

Nota:
- Questo comportamento dipende dalla qualità della risposta del modello. Se il modello non segue sempre la regola, segnare l'output reale per affinare ulteriormente il prompt.

## 6. Caso Ambiguo - Nessuna Conversione Forzata
- Usa o crea una ricetta dove nello step compare una quantità non chiaramente attribuibile, per esempio una quantità condivisa da più ingredienti simili.
- Clicca `Adatta step esistenti`.

Atteso:
- Lo step ambiguo deve restare invariato.
- Il riepilogo deve indicare che alcuni step non sono stati convertiti.

## 7. Caso Manuale - Inserimento Esplicito
- In modifica ricetta, su uno step non convertito automaticamente:
  - seleziona un ingrediente nel box `Quantità dinamiche`;
  - clicca `Inserisci quantità`.
- Controlla `Collegamenti attivi` e `Anteprima step`.

Atteso:
- Il collegamento viene registrato.
- L'anteprima step mostra la quantità risolta.

Nota:
- L'inserimento manuale attuale non ha ancora una UX perfetta sul posizionamento nel testo. È un comportamento noto da rifinire in una sessione successiva.

## 8. Regressioni da Controllare
- Riordino step ancora funzionante.
- Salvataggio ricetta senza errori.
- Nessun token visibile nelle viste utente finali.
- Nessun problema sulle ricette legacy che non vengono adattate.

## 9. Verifiche Tecniche Eseguite
- `npx jest src/lib/utils/step-description.test.ts src/lib/utils/recipe-parser.test.ts --runInBand --modulePathIgnorePatterns=.next`
- `npx next build --webpack`
