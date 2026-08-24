# Workflow di sessione

Regole di collaborazione portabili (stesse in ogni repo/macchina). Non duplicano le
convenzioni tecniche del progetto, che restano in [CLAUDE.md](CLAUDE.md) e
[AGENTS.md](AGENTS.md).

---

## Regole di sessione e collaborazione

1. **Mai fare commit senza approvazione esplicita.** Non eseguire `git commit` (né
   `--amend`) finché non arriva l'OK per quel commit specifico. Finisci il lavoro,
   riassumi il diff, poi chiedi. Creare il branch e modificare i file non richiede
   approvazione — solo il commit.

2. **Un branch per sessione.** Prima di iniziare lavoro di implementazione, crea un
   nuovo branch a partire dal branch attivo all'inizio della sessione (controlla
   sempre quale sia, non dare per scontato master/main).

3. **Un solo commit per sessione.** Tutte le modifiche di una sessione vanno
   squashate in un unico commit, non sparse su più commit.

4. **Rispondi sempre in italiano** quando lavori su questo repo (vale per il canale
   conversazionale — codice, identificatori e commenti restano in inglese).

---

## Regola del collaudo guidato

Quando dobbiamo verificare manualmente che una funzionalità appena implementata
funzioni, non consegnare una checklist e sparire. Il collaudo si fa insieme, in
chat, una fase alla volta. Quattro obblighi:

1. **I dati di prova li prepari tu** — uno script usa-e-getta (non tracciato da git,
   cancellato a fine collaudo) con "parole spia" (parole inventate tipo fenicottero,
   ornitorinco, che non compaiono da nessun'altra parte nell'archivio), non a mano
   da parte dell'utente.
2. **Una fase per messaggio** — dai la fase, aspetta il resoconto, poi la
   successiva. Mai consegnare tutte le fasi insieme: fa saltare i prerequisiti.
3. **Dichiara l'esito atteso prima di eseguire, non dopo** — altrimenti la lettura
   si adatta sempre a quello che è successo.
4. **Fai tu ogni controllo che riesci ad automatizzare**, e lascia solo quello che
   non si può fare. "Insieme, in chat" non vuol dire "un click alla volta dettato
   all'utente": se le sessioni sono JWT o comunque scriptabili, scrivi uno script
   usa-e-getta che apre un vero browser (es. Playwright) con una sessione
   autenticata — la propria se il ruolo lo permette, altrimenti un'identità di
   prova usa-e-getta creata per l'occasione — e verifica ogni esito sul database o
   sulla risposta HTTP, mai sul solo aspetto della pagina. Riporta i risultati fase
   per fase, con l'esito atteso dichiarato prima. Ogni test end-to-end automatico
   che si è in grado di eseguire, va eseguito: non dichiarare mai una funzionalità
   verificata se un controllo automatico che poteva coprirla è rimasto non
   eseguito. Lascia all'utente solo ciò che è genuinamente non automatizzabile:
   giudizio visivo/estetico, hardware fisico (es. uno scanner di barcode reale), o
   un login interattivo che non si può guidare da script (es. un vero flusso OAuth
   con MFA).

Fasi standard da seguire quando ha senso: A-Invarianza (quello che c'era prima
funziona ancora) → B-Cambio di contesto (il ruolo/stato nuovo è davvero attivo) →
C-Comportamento nuovo (fa quello che deve, non quello che non deve — qui vale di
più il punto 4: automatizza) → D-Sotto la UI (le stesse regole reggono chiamando la
route a mano) → E-Casi negativi (chi non ha diritti viene respinto, con l'errore
giusto) → F-Ripristino (configurazione ripristinata, fixture rimosse, script
cancellato).

Un test negativo da solo non prova un guard di sicurezza: serve sempre la coppia
risorsa-propria (controllo positivo, deve riuscire) / risorsa-altrui (il test, deve
fallire), con lo stesso identico file/dato. Chiusura del collaudo: ripristinare
eventuali config modificate, rimuovere fixture e allegati di prova, cancellare lo
script, e annotare l'esito da qualche parte che sopravvive alla sessione (CLAUDE.md
o equivalente) — un collaudo non annotato vale come non fatto.

---

## Come si applica in questo repo

Il repo ha già tutta la tooling di collaudo guidato configurata (vedi sezione
"Guided testing tooling" in [CLAUDE.md](CLAUDE.md)); qui sotto solo i comandi e i
percorsi concreti.

**Comandi verificati** (`package.json`):
- `npm run test` → Jest (unit/integration)
- `npm run lint` → ESLint
- `npx tsc --noEmit` → type-check (nessuno script dedicato in `package.json`, ma
  `tsconfig.json` è presente e `tsc` risolve il progetto)
- `npx next build --webpack` → build di verifica (comando raccomandato da
  CLAUDE.md, più affidabile di `npm run build` per catturare errori)
- `npm run test:e2e` → Playwright (`playwright.config.ts`, `testDir: ./e2e`)
- Non esiste CI (`.github/workflows` assente): i comandi sopra vanno lanciati a
  mano prima di proporre un commit.

**Ambiente locale isolato**: Firebase Emulator Suite, già cablata.
- `npm run emulators` → avvia Auth (`:9099`), Firestore (`:8080`), Storage
  (`:9199`), UI su `:4000` (config in `firebase.json`)
- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` → punta il client SDK
  (`src/lib/firebase/config.ts`, `src/lib/firebase/storage.ts`) sugli emulatori
  invece che su produzione
- L'Admin SDK (`src/lib/firebase/admin.ts`) si aggancia da solo agli emulatori
  quando sono settate le env standard `FIRESTORE_EMULATOR_HOST` /
  `FIREBASE_AUTH_EMULATOR_HOST` — nessun flag da passare, nessuna credenziale
  service-account reale richiesta in questo caso

**Identità di prova**: nessun helper riutilizzabile esiste ancora (per scelta,
vedi sotto) — lo script usa-e-getta del collaudo crea l'utente al volo con il
Firebase client SDK (`createUserWithEmailAndPassword` contro l'Auth emulator, dato
che il flag `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` ci instrada già lì) o via Firebase
Admin SDK (`getAuth().createUser(...)`, con `FIREBASE_AUTH_EMULATOR_HOST`
settato). Da lì si ottiene l'ID token e/o lo `storageState` di Playwright per una
sessione autenticata reale, non simulata.

**Ispezione dello stato reale dei dati**: usare l'Admin SDK con
`FIRESTORE_EMULATOR_HOST` settato (stesso pattern delle route API, che già lo
fanno) per leggere direttamente le collection elencate in CLAUDE.md
(`recipes`, `meal_plans`, `pantry_items`, `cooking_history`, ecc.) — mai dedurre lo
stato dal solo rendering della pagina. In alternativa, l'Emulator UI su
`localhost:4000` per un'ispezione visiva rapida durante il debug (non per
l'asserzione automatica, che resta compito dello script).

**Dove vanno gli script**: `e2e/scratch/` — gitignored (`.gitignore` righe
64-65), sopravvive solo `.gitkeep`. Ogni collaudo scrive lì il proprio script e lo
cancella a fine collaudo, come da protocollo. Helper riutilizzabili, se mai
emergono da collaudi ripetuti, vanno promossi in `e2e/` tracciato — ma finché non
succede, questa è la scelta intenzionale del repo, non una lacuna.

**Branch**: `main` è il branch di produzione/release, `develop` è il branch di
integrazione (i branch di sessione partono da `develop` e ci confluiscono via PR;
`develop` confluisce in `main` separatamente). Verificato da `git branch -a` e
dalla history (`Merge branch '...' into develop`, poi `Merge pull request ...`
verso `main`).

**Dove si annota l'esito di un collaudo**: sezione "Guided testing tooling" di
CLAUDE.md, tabella "Collaudi eseguiti con questa tooling" — aggiungere una riga per
ogni collaudo chiuso, come già previsto lì.
