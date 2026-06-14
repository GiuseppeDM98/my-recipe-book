---
target: pianificatore (Meal Planner page)
total_score: 28
p0_count: 0
p1_count: 2
timestamp: 2026-06-14T17-20-16Z
slug: src-app-dashboard-pianificatore-page-tsx
---
# Critique — Pianificatore pasti

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loader, toast, isToday e spinner di rigenerazione coprono bene; manca conferma visiva persistente del salvataggio slot |
| 2 | Match System / Real World | 3 | Italiano naturale; "shuffle" è inglese ma spiegato nel box how-to |
| 3 | User Control and Freedom | 2 | Delete piano usa `confirm()` nativo; rimozione giorno è a senso unico (per riaggiungerlo serve rifare il piano); nessun undo |
| 4 | Consistency and Standards | 2 | `confirm()` nativo vs Dialog stilizzato; label "Rimescola" vs "Rigenera" per la stessa azione; badge slot disomogenei |
| 5 | Error Prevention | 3 | Copy-plan blocca l'overwrite, min 1 giorno/pasto garantito; ma il delete distruttivo ha solo confirm nativo |
| 6 | Recognition Rather Than Recall | 3 | Ottimo box how-to e stati visibili; badge ricettario solo-icona e tasto rimescola nascosto in hover penalizzano |
| 7 | Flexibility and Efficiency | 3 | Reshuffle per slot, copia piano, nav settimane, shuffle+manuale: ricco per il dominio |
| 8 | Aesthetic and Minimalist Design | 3 | Pulito e on-brand, ma il residuo "Ricette generate dall'AI" + emoji ✨ + testo minuto aggiungono rumore |
| 9 | Error Recovery | 3 | Toast specifici e "alcuni pasti rimasti vuoti"; alcuni fallback generici "Errore nel salvataggio" |
| 10 | Help and Documentation | 3 | Box "Come usare il pianificatore" è vera guida contestuale; tooltip sui bottoni |
| **Total** | | **28/40** | **Good (bordo basso) — fondamenta solide, alcune aree deboli mirate** |

## Anti-Patterns Verdict

**Non sembra AI-generato.** Sistema editoriale caldo e distintivo, stati componente reali (empty/loading/regenerating), tre stati di slot ben differenziati. Il detector deterministico su `pianificatore/` e `components/meal-planner/` è **pulito (0 findings, exit 0)**: nessun side-stripe, gradient text, glassmorphism, hero-metric o card-grid identico.

L'unica nota di tono: l'isola "✨ Ricette generate dall'AI" con badge sparkle e l'emoji `✨` in un `<h2>` stridono leggermente con l'anti-riferimento di brand "niente AI/SaaS". È retaggio legacy (la generazione AI è stata sostituita da shuffle locale) tenuto per retrocompatibilità, ma i nuovi piani non lo producono mai.

## Overall Impression

Pagina solida e ben pensata, chiaramente costruita da chi conosce il dominio. La struttura responsive è reale (griglia 8 colonne desktop vs card impilate mobile), non un semplice ridimensionamento fluido. Il problema più grosso è **un'azione chiave invisibile al tocco**: il pulsante "rimescola" per slot, che è il cuore del valore del pianificatore, vive dietro `opacity-0 group-hover:opacity-100` — e l'utente primario (genitore in cucina, telefono, una mano) non ha hover. La singola opportunità più alta è rendere quel controllo (e gli altri micro-link) raggiungibili al tocco.

## What's Working

- **Tre stati di slot espliciti e leggibili**: vuoto (bordo tratteggiato + `+`), ricetta dal ricettario (badge libro), ricetta AI legacy (badge sparkle + "Salva"). Recognition over recall ben applicato.
- **Strategia responsive strutturale**: desktop usa una grid a 8 colonne con scroll orizzontale per landscape stretti; mobile portrait impila card-giorno con stagger `animate-fade-up`. Niente celle minuscole sul telefono.
- **Onboarding contestuale genuino**: il box "Come usare il pianificatore" con tre icone spiega shuffle/manuale/modifica prima che l'utente debba indovinare. Il loader editoriale con tono "anticipation" è calmo e on-brand.

## Priority Issues

- **[P1] Tasto "rimescola" per slot invisibile al tocco**
  - **Why it matters**: È l'azione differenziante del pianificatore. Con `opacity-0 group-hover:opacity-100` (MealSlotCell righe 107 e 168) su telefono non c'è hover: il pulsante è di fatto invisibile e non scopribile. L'utente primario è proprio mobile/una-mano. Casey fallisce.
  - **Fix**: rendere il pulsante sempre visibile sotto `lg` (o su input coarse): es. `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`, oppure icona persistente a bassa opacità. Garantire target ≥44px.
  - **Suggested command**: `/impeccable adapt`

- **[P1] Eliminazione piano usa `confirm()` nativo del browser**
  - **Why it matters**: `confirm('Sei sicuro...')` (page riga 228) apre un dialog di sistema fuori brand, non stilizzabile, incoerente con il `Dialog` editoriale già usato per "Copia piano". Spezza sia la coerenza (H4) sia la materialità "Carta e Terracotta".
  - **Fix**: sostituire con un AlertDialog/Dialog coerente con il design system (stesso pattern del copy-plan), testo distruttivo in ruggine d'allerta.
  - **Suggested command**: `/impeccable harden`

- **[P2] Micro-link e badge con target di tocco sotto i 44px**
  - **Why it matters**: "Salva nel ricettario", "Vai alla ricetta", i badge e la X sui chip sono `text-xs`/icone da ~12–14px in celle dense. Su mobile (contesto primario) sono difficili da centrare con il pollice; Sam e Casey ne soffrono.
  - **Fix**: aumentare l'area cliccabile (padding, min-height 44px) almeno sotto `lg`; trasformare i link testuali in bottoni con hit-area adeguata.
  - **Suggested command**: `/impeccable adapt`

- **[P2] Residuo "Ricette generate dall'AI" appesantisce e stona col brand**
  - **Why it matters**: L'isola con emoji `✨`, badge "AI" e `NewRecipeReviewCard` esiste solo per piani legacy, ma occupa superficie e carico cognitivo per un percorso che i nuovi piani non generano mai. L'emoji in `<h2>` contraddice l'anti-riferimento "niente AI/SaaS".
  - **Fix**: degradare la sezione legacy (renderla più sobria, togliere l'emoji, ridurre l'enfasi) o nasconderla dietro un disclosure; allineare il linguaggio al registro editoriale.
  - **Suggested command**: `/impeccable distill`

- **[P2] Leggibilità in cucina: titoli ricetta a `text-xs` (12px)**
  - **Why it matters**: Il principio dichiarato è "leggibilità in cucina, mani sporche di farina", ma i titoli negli slot sono `text-xs` con `line-clamp`, e molto testo secondario è `text-[10px]`/`text-[11px]` in `muted-foreground`. Sotto la soglia comoda per lettura a distanza di braccio.
  - **Fix**: portare i titoli slot ad almeno `text-sm` su mobile; verificare contrasto del muted a queste dimensioni (≥4.5:1).
  - **Suggested command**: `/impeccable typeset`

## Persona Red Flags

**Casey (Mobile in cucina, una mano)**: il tasto rimescola non esiste senza hover; i link "Salva"/"Vai alla ricetta" sono bersagli minuscoli; i titoli a 12px si leggono male a distanza di braccio. L'azione più frequente (cambiare/rimescolare un piatto) è la più difficile da toccare.

**Sam (Screen reader / tastiera)**: il badge ricettario è solo-icona (BookOpen) senza testo, distinzione ricettario-vs-AI affidata in parte al colore; i controlli `opacity-0` raggiungono `focus:opacity-100` (buono per focus), ma il delete con `confirm()` nativo e i toast non sempre annunciano lo stato. Verificare ruoli ARIA su select e chip.

**Genitore-pianificatore (persona di progetto, dalla Design Context)**: vuole comporre la settimana in fretta la domenica sera. La rimozione di un giorno è a senso unico: se ne toglie uno per errore, per riaverlo deve ricominciare. Manca un undo o un re-add inline.

## Minor Observations

- Label incoerenti: tooltip "Rimescola" per slot AI vs "Rigenera" per ricette esistenti (stessa azione, due nomi); il box how-to dice "rimescola".
- `confirm()` nativo anche concettualmente fragile: nessun focus-trap brandizzato.
- Emoji usate in più punti (stagioni, toast ℹ️, ✨): scelta legittima per le stagioni, meno per l'heading editoriale.
- La sezione "Giorni inclusi nel piano" e il selettore giorni del setup fanno cose simili in punti diversi con UI diverse (chip rotondi vs chip con X).

## Questions to Consider

- E se l'azione "rimescola" fosse un controllo persistente e riconoscibile su ogni slot, invece di un segreto da hover?
- Il percorso "ricette AI" legacy merita ancora spazio in prima pagina, o può ritirarsi dietro un disclosure finché non serve?
- Cosa servirebbe perché un genitore componga la settimana in cucina, sul telefono, senza mai zoomare?
