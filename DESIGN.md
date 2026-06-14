---
name: Il Mio Ricettario
description: Ricettario digitale privato per famiglie italiane — caldo, editoriale, materico
colors:
  terracotta: "oklch(52% 0.13 42)"
  terracotta-deep: "oklch(43% 0.12 42)"
  sage: "oklch(50% 0.08 148)"
  cream-bg: "oklch(97% 0.01 75)"
  ink: "oklch(18% 0.03 55)"
  ink-muted: "oklch(45% 0.04 55)"
  surface-secondary: "oklch(91% 0.02 75)"
  surface-muted: "oklch(91% 0.015 75)"
  border-taupe: "oklch(88% 0.02 75)"
  rust-alert: "oklch(58% 0.22 25)"
typography:
  display:
    fontFamily: "Bodoni Moda, Georgia, serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Jost, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.24em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  editorial: "29px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.terracotta}"
    textColor: "{colors.cream-bg}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.terracotta-deep}"
    textColor: "{colors.cream-bg}"
  button-outline:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  input-field:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  chip-kicker:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
---

# Design System: Il Mio Ricettario

## 1. Overview

**Creative North Star: "Carta e Terracotta"**

Questo sistema vuole avere la consistenza fisica di un oggetto ben fatto: la grana di una carta panna pregiata e lo smalto caldo di una ceramica artigianale. Le superfici non devono sembrare pannelli di vetro retroilluminato; devono sembrare avere materia. Il calore non arriva da un colore "carino" spalmato ovunque, ma dalla combinazione di uno sfondo crema mai bianco, inchiostro marrone mai nero, e un singolo accento terracotta usato come timbro, non come vernice.

È un ricettario, non un'app. Ogni schermata è una pagina di un cookbook curato: il contenuto (titoli di ricette in Bodoni, ingredienti, passaggi) è la sostanza, e la cornice la serve in silenzio. La densità è bassa e respirata sulle pagine di lettura, può crescere solo dove l'utente sta davvero gestendo dati (pianificatore, dispensa, lista della spesa). Il registro è "product": la familiarità è una virtù, la sorpresa è un costo. Le primitive (bottoni, input, card) seguono convenzioni note; la personalità vive nello strato editoriale sopra di esse — `shell-stage`, `cinematic-heading`, i filetti terracotta-salvia.

Questo sistema rifiuta esplicitamente quattro cose, ereditate da PRODUCT.md: il *food social* (niente foto enormi, like, follower), l'estetica *AI/SaaS* (niente dashboard fredde, gradienti viola-blu, glow neon, glassmorphism decorativo), la *delivery app* (niente carrelli, prezzi, promozioni) e il *corporate* (niente blu, niente grigio freddo neutro).

**Key Characteristics:**
- Sfondo crema caldo (`oklch(97% 0.01 75)`), mai bianco puro; inchiostro marrone scuro (`oklch(18% 0.03 55)`), mai nero.
- Un solo accento terracotta come timbro raro; salvia come seconda voce ancora più rara.
- Bodoni Moda per i titoli (autorevolezza editoriale), Jost per il corpo (leggibilità in cucina).
- Profondità materica su desktop (ombre morbide, deriva ambientale), piatta su mobile per performance.
- Tocco generoso e contrasto alto: l'utente legge con le mani sporche di farina.

## 2. Colors

Una palette terrosa e calda costruita interamente in OKLCH attorno a un'unica famiglia di toni (hue ~42–75 caldi, più una salvia 148), così che ogni superficie appartenga allo stesso oggetto fisico.

### Primary
- **Terracotta** (`oklch(52% 0.13 42)`): l'unico vero accento. Azioni primarie, selezione corrente, ring di focus, filetti editoriali. È un timbro su carta, non una vernice da stendere.
- **Terracotta Profonda** (`oklch(43% 0.12 42)`): stato hover dei bottoni primari e testo accento su sfondi chiari quando serve più contrasto.

### Secondary
- **Salvia** (`oklch(50% 0.08 148)`): seconda voce, ancora più rara della terracotta. Conferme, accenti di stato positivo, secondo capo dei filetti gradiente. Mai in competizione con la terracotta nello stesso sguardo.

### Tertiary
- **Ruggine d'Allerta** (`oklch(58% 0.22 25)`): solo distruttivo/errore (elimina, scadenze in dispensa). È l'unico rosso ad alta saturazione ammesso, e solo come segnale.

### Neutral
- **Crema Panna** (`oklch(97% 0.01 75)`): sfondo primario, superfici card e popover. Il colore della pagina.
- **Inchiostro** (`oklch(18% 0.03 55)`): testo principale. Marrone molto scuro, mai `#000`.
- **Inchiostro Tenue** (`oklch(45% 0.04 55)`): testo muted, descrizioni, label secondarie. Marrone medio — verificato sopra crema a contrasto ≥4.5:1.
- **Crema Scura** (`oklch(91% 0.02 75)`): superficie secondaria, fondali di toolbar/sezioni, stati hover ghost.
- **Taupe Chiaro** (`oklch(88% 0.02 75)`): bordi, divisori, contorno input.

### Named Rules
**La Regola del Timbro.** La terracotta compare su ≤10% di qualunque schermata. È un timbro a inchiostro, non una tinta di fondo. La sua rarità è ciò che la rende autorevole; se due elementi terracotta competono nello stesso sguardo, uno è di troppo.

**La Regola Mai-Bianco-Mai-Nero.** Nessuna superficie è `#ffffff`, nessun testo è `#000000`. Lo sfondo è sempre crema, l'inchiostro sempre marrone. Il bianco puro tradisce la "app"; rompe l'illusione della carta.

**La Regola Anti-Freddo.** Vietato il blu, vietato il grigio neutro freddo. Ogni neutro porta chroma caldo verso hue 75. Un grigio freddo in questo sistema è un bug, non una scelta.

## 3. Typography

**Display Font:** Bodoni Moda (con fallback Georgia, serif)
**Body Font:** Jost (con fallback system-ui, sans-serif)

**Character:** Una coppia ad asse di contrasto, non di somiglianza: un didone italiano ad alto contrasto (Bodoni, revival di Giambattista Bodoni — secoli di editoria e moda italiana) contro un umanista geometrico contemporaneo (Jost). Il Bodoni porta autorevolezza e calore nelle curve; il Jost porta leggibilità a tutte le dimensioni. La firma editoriale è il Bodoni **in corsivo** per i titoli di pagina e gli empty state.

### Hierarchy
- **Display** (Bodoni, 600, spesso corsivo, ~`text-3xl`/1.875rem, line-height ~1.05): titoli di pagina, intestazioni degli empty state, momenti editoriali. Usa `text-wrap: balance`.
- **Headline** (Bodoni, 600, `text-lg`–`text-2xl`): titoli di sezione e card title. Si applica `font-display` solo a `h1–h4`.
- **Title** (Jost, 600, `text-lg`/1.125rem, leading-none, tracking-tight): titoli di card compatte e header di pannello.
- **Body** (Jost, 400, `text-sm`/0.875rem, line-height 1.5): testo corrente, descrizioni, valori. Tetto prosa 65–75ch; ingredienti e tabelle possono correre più densi.
- **Label** (Jost, 600, `text-[0.7rem]`, letter-spacing 0.24em, MAIUSCOLO): kicker editoriali e badge. Solo etichette brevi (≤4 parole).

### Named Rules
**La Regola del Corsivo Editoriale.** Il corsivo è riservato al Bodoni nei titoli e nei momenti editoriali (empty state, heading di pagina). Non si mette in corsivo il corpo Jost per "enfasi": l'enfasi nel corpo passa dal peso, non dall'inclinazione.

**La Regola Maiuscolo-Solo-Label.** Il maiuscolo con tracking 0.24em (`editorial-kicker`) è ammesso solo su etichette ≤4 parole. Mai una frase, mai un paragrafo in maiuscolo.

## 4. Elevation

Sistema **ibrido e dipendente dalla capacità del dispositivo**. Su desktop (≥1440px) la profondità è materica: ombre morbide a raggio ampio e offset negativo (l'ombra sta sotto e dentro l'oggetto, come carta posata su carta), più una leggerissima deriva ambientale di gradienti caldi dietro `shell-stage`. Su mobile (<1440px) tutto lo strato decorativo viene rimosso — bordi, ombre e pseudo-elementi spariscono e `shell-stage` diventa una tinta piatta crema — perché lo stage copre l'intera viewport e la rasterizzazione non darebbe alcun beneficio percepibile, solo costo.

### Shadow Vocabulary (solo desktop)
- **Card a riposo** (`box-shadow: shadow-sm` di Tailwind): sollevamento minimo, la carta appena staccata dalla pagina.
- **Pannello editoriale** (`box-shadow: 0 20px 55px -42px oklch(var(--foreground)/0.3), inset 0 1px 0 oklch(100% 0 0 /0.6)`): profondità diffusa con un filo di luce in alto, per `shell-panel` ed empty state.
- **Stage** (`box-shadow: 0 30px 80px -52px oklch(var(--foreground)/0.28), inset 0 1px 0 oklch(100% 0 0 /0.7)`): la cornice esterna della pagina, l'ombra più ampia e morbida del sistema.

### Named Rules
**La Regola dell'Ombra Marrone.** Le ombre non sono mai nere: usano `oklch(var(--foreground)/α)`, cioè marrone trasparente. Un'ombra nera su crema vira al grigio freddo e tradisce la materia calda.

**La Regola Mobile-Piatto.** Sotto 1440px ogni decorazione di profondità si spegne. La materialità è un lusso da desktop; in cucina, su telefono, vince la performance e la tinta piatta.

## 5. Components

Le primitive sono shadcn/Radix con `class-variance-authority`: familiari di proposito. Il carattere vive nello strato editoriale sopra di esse.

### Buttons
- **Shape:** angoli morbidi (`rounded-md`, 6px). Altezze fisse: `default` 40px, `sm` 36px, `lg` 44px, `icon` 40×40.
- **Primary:** fondo terracotta, testo crema, padding `8px 16px` (`h-10 px-4`). Transizione solo di colore.
- **Hover / Focus:** hover → `bg-primary/90` (vira a terracotta profonda); focus-visible → ring 2px terracotta con offset 2px sul background. Mai rimuovere il focus ring.
- **Secondary / Outline / Ghost / Link:** secondary su crema scura; outline con bordo taupe su crema, hover salvia tenue; ghost trasparente con hover salvia tenue; link terracotta con underline-offset. Destructive usa la ruggine d'allerta.

### Chips (kicker)
- **Style:** pillola crema con bordo terracotta tenue (`border-primary/15`), testo Jost 600 maiuscolo con tracking 0.24em in inchiostro tenue. Spesso accoppiata a un'icona in cerchio terracotta-tenue.
- **State:** decorativa/etichetta, non interattiva. Per i filtri attivi, il chip selezionato porta fondo terracotta tenue e testo terracotta.

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px) per le card standard; `rounded-[1.8rem]` (~29px) per i pannelli editoriali e gli empty state.
- **Background:** crema (`bg-card`), con i pannelli editoriali su un gradiente verticale crema→crema appena più scura.
- **Shadow Strategy:** vedi Elevation — `shadow-sm` a riposo sulle card, ombra di pannello sugli `shell-panel` (solo desktop).
- **Border:** 1px taupe (`border`), spesso a opacità ridotta (`border/0.7`).
- **Internal Padding:** `p-6` (24px) standard di card.
- **Mai card annidate.** Una card dentro una card è sempre un errore di struttura.

### Inputs / Fields
- **Style:** altezza 40px, bordo taupe (`border-input`), fondo crema, `rounded-md`, testo `text-sm`. Placeholder in inchiostro tenue (mai più chiaro: deve reggere 4.5:1).
- **Focus:** ring 2px terracotta con offset 2px (`focus-visible:ring-ring`), niente glow.
- **Disabled:** cursor-not-allowed, opacità 50%.

### Navigation
- **Desktop (≥1440px):** sidebar. **Mobile portrait:** bottom navigation (azioni nella thumb zone). **Mobile landscape:** hamburger + drawer (sheet). Stato attivo segnalato in terracotta; label sempre presenti sotto le icone, mai navigazione solo-icona.

### Signature: lo Stage editoriale
`shell-stage` e `shell-panel` sono la firma del prodotto: cornici con bordo taupe, gradienti caldi radiali terracotta/salvia a bassissima opacità, un filo di luce interno in alto, e (stage) una deriva ambientale di 18s. `cinematic-heading` aggiunge un filetto gradiente terracotta→salvia→trasparente sotto il titolo. Sono ciò che trasforma una pagina-strumento in una pagina-cookbook. Da usare per le cornici di pagina, non per ogni piccolo contenitore.

## 6. Do's and Don'ts

### Do:
- **Do** mantenere lo sfondo crema (`oklch(97% 0.01 75)`) e l'inchiostro marrone (`oklch(18% 0.03 55)`) ovunque; sono il colore della carta e dell'inchiostro.
- **Do** usare la terracotta come timbro raro (≤10% della schermata): azioni primarie, selezione, focus ring, filetti.
- **Do** riservare il Bodoni corsivo ai titoli e ai momenti editoriali; tenere il corpo in Jost regolare.
- **Do** colorare le ombre in marrone trasparente (`oklch(var(--foreground)/α)`), mai nero.
- **Do** spegnere lo strato decorativo di profondità sotto 1440px; in cucina vince la performance.
- **Do** dare tocco generoso e contrasto alto: l'utente legge con le mani occupate.
- **Do** etichettare sempre le icone di navigazione; usare il maiuscolo tracciato solo per label ≤4 parole.

### Don't:
- **Don't** usare bianco puro (`#fff`) per le superfici o nero puro (`#000`) per il testo: tradisce l'illusione della carta.
- **Don't** introdurre blu o grigi freddi neutri; ogni neutro porta chroma caldo verso hue 75.
- **Don't** scadere nell'estetica AI/SaaS: niente gradienti viola-blu, glow neon, glassmorphism decorativo, dashboard fredde.
- **Don't** scadere nel food social: niente foto enormi, like, follower, conteggi sociali.
- **Don't** scadere nella delivery app: niente carrelli, prezzi, badge promozionali.
- **Don't** annidare card dentro card, né usare `background-clip: text` con gradiente (gradient text), né bordi laterali colorati >1px come accento.
- **Don't** mettere frasi o paragrafi in MAIUSCOLO; il maiuscolo tracciato è solo per kicker brevi.
- **Don't** far competere terracotta e salvia nello stesso sguardo: la salvia è la seconda voce, più rara.
