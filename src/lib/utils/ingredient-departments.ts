import { canonicalIngredientKey, matchIngredientToPantry } from './ingredient-matching';
import { PANTRY_CATEGORIES } from './pantry-utils';
import type { PantryItem } from '@/types/pantry';

/**
 * Shopping list department classification (Spec E, roadmap cross-spec
 * contract §3). Answers "which supermarket department does this ingredient
 * belong to?" through a precedence chain:
 * 1. the matched pantry entry's categoryId (Spec D's matching engine);
 * 2. the user's manual override (users/{uid}.ingredientDepartmentOverrides);
 * 3. this curated static dictionary;
 * 4. 'altro' fallback.
 *
 * A non-match anywhere in the chain falls through to the next link — it never
 * produces an unknown/invalid department slug.
 */

export const DEPARTMENT_FALLBACK_ID = 'altro';

/**
 * Seed dictionary "ingredient name → department".
 *
 * KEY CONVENTION (verified by ingredient-departments.test.ts):
 * - lowercase, no accents (e.g. "caffe", "baccala"), single spaces;
 * - SINGULAR form when singular and plural share the stem (the normal case:
 *   "pomodoro" covers "pomodori"); for irregular -cia/-ce and -io/-a pairs
 *   that do NOT share the stem, both forms are added (e.g. "arancia" and
 *   "arance", "salsiccia" and "salsicce");
 * - multi-word entries are allowed and used for specific cases: stemming is
 *   per word, so "pomodoro pelato" matches "pomodori pelati" but is NOT
 *   matched by "pomodoro" (consistent with the aggregator's conservative
 *   philosophy).
 *
 * At runtime every key is normalized with canonicalIngredientKey into
 * DEPARTMENT_BY_KEY (stem → slug): lookup always happens on the stem, never
 * on the form written here.
 *
 * STEM COLLISIONS resolved explicitly (the stemmer is not touched, see
 * ingredient-matching.ts):
 * - "pesca"/"pesce" → both stem to "pesc": assigned to pesce (a savory
 *   cookbook sees far more fish than peaches; peaches are recovered via
 *   "pesca noce"/"nettarina" or a user override). Do NOT add a "pesca" entry.
 * - "grana"/"grano" → both stem to "gran": assigned to latticini (grated
 *   "grana" is ubiquitous; wheat lives in the multi-word "grano saraceno").
 *   Do NOT add a "grano" entry.
 * - "polpa"/"polpo" → both stem to "polp": only "polpo" (fish); "polpa di
 *   pomodoro" is multi-word and does not collide.
 * These three omissions are guarded by the "no collisions" test below —
 * re-adding the losing word would fail it.
 */
export const RAW_INGREDIENT_DEPARTMENTS: Record<string, string> = {
  // ── Verdura ──────────────────────────────────────────────
  pomodoro: 'verdura', pomodorino: 'verdura', 'pomodoro ciliegino': 'verdura',
  'pomodoro datterino': 'verdura', zucchina: 'verdura', melanzana: 'verdura',
  peperone: 'verdura', friggitello: 'verdura', carota: 'verdura',
  sedano: 'verdura', 'sedano rapa': 'verdura', cipolla: 'verdura',
  'cipolla rossa': 'verdura', cipollotto: 'verdura', scalogno: 'verdura',
  aglio: 'verdura', patata: 'verdura', 'patata dolce': 'verdura',
  zucca: 'verdura', spinacio: 'verdura', bietola: 'verdura',
  cavolo: 'verdura', 'cavolo nero': 'verdura', cavolfiore: 'verdura',
  broccolo: 'verdura', verza: 'verdura', 'cavoletto di bruxelles': 'verdura',
  lattuga: 'verdura', insalata: 'verdura', rucola: 'verdura',
  radicchio: 'verdura', indivia: 'verdura', scarola: 'verdura',
  finocchio: 'verdura', carciofo: 'verdura', asparago: 'verdura',
  porro: 'verdura', fagiolino: 'verdura', cetriolo: 'verdura',
  ravanello: 'verdura', rapa: 'verdura', 'cima di rapa': 'verdura',
  barbabietola: 'verdura', fungo: 'verdura', 'fungo porcino': 'verdura',
  porcino: 'verdura', champignon: 'verdura',

  // ── Frutta (incl. nuts and dried fruit) ──────────────────
  mela: 'frutta', pera: 'frutta', banana: 'frutta',
  arancia: 'frutta', arance: 'frutta', // -cia/-ce: different stems, both needed
  limone: 'frutta', lime: 'frutta', mandarino: 'frutta', clementina: 'frutta',
  pompelmo: 'frutta', kiwi: 'frutta', uva: 'frutta', uvetta: 'frutta',
  'uva passa': 'frutta', 'uva sultanina': 'frutta', 'pesca noce': 'frutta',
  nettarina: 'frutta', albicocca: 'frutta', prugna: 'frutta', susina: 'frutta',
  ciliegia: 'frutta', fragola: 'frutta', lampone: 'frutta', mirtillo: 'frutta',
  mora: 'frutta', ribes: 'frutta', 'frutto di bosco': 'frutta',
  melone: 'frutta', anguria: 'frutta', cocomero: 'frutta', fico: 'frutta',
  cachi: 'frutta', melograno: 'frutta', ananas: 'frutta', mango: 'frutta',
  avocado: 'frutta', castagna: 'frutta', noce: 'frutta', mandorla: 'frutta',
  nocciola: 'frutta', pistacchio: 'frutta', pinolo: 'frutta',
  arachide: 'frutta', anacardo: 'frutta', dattero: 'frutta', cocco: 'frutta',

  // ── Carne and cured meats ────────────────────────────────
  pollo: 'carne', 'petto di pollo': 'carne', 'coscia di pollo': 'carne',
  tacchino: 'carne', 'fesa di tacchino': 'carne', manzo: 'carne',
  macinato: 'carne', 'carne macinata': 'carne', hamburger: 'carne',
  vitello: 'carne', maiale: 'carne', lonza: 'carne', arista: 'carne',
  costina: 'carne',
  salsiccia: 'carne', salsicce: 'carne', // -cia/-ce
  wurstel: 'carne', agnello: 'carne', coniglio: 'carne', anatra: 'carne',
  prosciutto: 'carne', 'prosciutto cotto': 'carne', 'prosciutto crudo': 'carne',
  speck: 'carne', pancetta: 'carne', guanciale: 'carne', salame: 'carne',
  mortadella: 'carne', bresaola: 'carne', coppa: 'carne', lardo: 'carne',

  // ── Pesce ────────────────────────────────────────────────
  pesce: 'pesce', // stem "pesc" also covers "pesca" (the fruit) — documented collision, see module doc
  'pesce spada': 'pesce', tonno: 'pesce', salmone: 'pesce',
  'salmone affumicato': 'pesce', merluzzo: 'pesce', baccala: 'pesce',
  branzino: 'pesce', spigola: 'pesce', orata: 'pesce', sogliola: 'pesce',
  platessa: 'pesce', sgombro: 'pesce', alice: 'pesce', acciuga: 'pesce',
  sardina: 'pesce', gambero: 'pesce', gamberetto: 'pesce',
  mazzancolla: 'pesce', scampo: 'pesce', calamaro: 'pesce', seppia: 'pesce',
  polpo: 'pesce', cozza: 'pesce', vongola: 'pesce', trota: 'pesce',

  // ── Latticini and eggs ───────────────────────────────────
  latte: 'latticini', panna: 'latticini', 'panna da cucina': 'latticini',
  'panna fresca': 'latticini', 'panna acida': 'latticini', burro: 'latticini',
  yogurt: 'latticini', 'yogurt greco': 'latticini', kefir: 'latticini',
  uovo: 'latticini', albume: 'latticini', tuorlo: 'latticini',
  mozzarella: 'latticini', 'mozzarella di bufala': 'latticini',
  fiordilatte: 'latticini', burrata: 'latticini', stracciatella: 'latticini',
  ricotta: 'latticini', mascarpone: 'latticini', parmigiano: 'latticini',
  'parmigiano reggiano': 'latticini',
  grana: 'latticini', // stem "gran" also covers "grano" — documented collision, see module doc
  'grana padano': 'latticini', pecorino: 'latticini',
  'pecorino romano': 'latticini', gorgonzola: 'latticini',
  taleggio: 'latticini', fontina: 'latticini', asiago: 'latticini',
  scamorza: 'latticini', provola: 'latticini', provolone: 'latticini',
  stracchino: 'latticini', crescenza: 'latticini', robiola: 'latticini',
  caciotta: 'latticini', caprino: 'latticini', feta: 'latticini',
  emmental: 'latticini', brie: 'latticini', formaggio: 'latticini',
  'formaggio spalmabile': 'latticini',

  // ── Cereali: pasta, rice, flours ─────────────────────────
  farina: 'cereali', 'farina 00': 'cereali', 'farina integrale': 'cereali',
  'farina di mandorle': 'cereali', 'farina di ceci': 'cereali',
  'farina di riso': 'cereali', semola: 'cereali', semolino: 'cereali',
  'amido di mais': 'cereali', maizena: 'cereali', fecola: 'cereali',
  'fecola di patate': 'cereali', pasta: 'cereali', spaghetto: 'cereali',
  penna: 'cereali', fusillo: 'cereali', rigatone: 'cereali',
  linguina: 'cereali', tagliatella: 'cereali', fettuccina: 'cereali',
  pappardella: 'cereali', farfalla: 'cereali', orecchietta: 'cereali',
  lasagna: 'cereali', cannellone: 'cereali', tortellino: 'cereali',
  raviolo: 'cereali', gnocco: 'cereali', riso: 'cereali',
  'riso arborio': 'cereali', 'riso carnaroli': 'cereali',
  'riso basmati': 'cereali', orzo: 'cereali', farro: 'cereali',
  avena: 'cereali', 'fiocco di avena': 'cereali', "fiocco d'avena": 'cereali',
  muesli: 'cereali', couscous: 'cereali', cuscus: 'cereali',
  quinoa: 'cereali', bulgur: 'cereali', miglio: 'cereali',
  polenta: 'cereali', 'grano saraceno': 'cereali', mais: 'cereali',

  // ── Legumi ───────────────────────────────────────────────
  fagiolo: 'legumi', 'fagiolo cannellino': 'legumi', cannellino: 'legumi',
  'fagiolo borlotto': 'legumi', borlotto: 'legumi', cece: 'legumi',
  lenticchia: 'legumi', fava: 'legumi', lupino: 'legumi', soia: 'legumi',

  // ── Condimenti: oil, vinegar, sauces, canned goods, pantry sweets ──
  olio: 'condimenti', 'olio di oliva': 'condimenti',
  'olio extravergine': 'condimenti', 'olio extravergine di oliva': 'condimenti',
  'olio evo': 'condimenti', 'olio di semi': 'condimenti',
  'olio di girasole': 'condimenti', aceto: 'condimenti',
  'aceto balsamico': 'condimenti', 'aceto di vino': 'condimenti',
  'aceto di mele': 'condimenti', sale: 'condimenti', 'sale fino': 'condimenti',
  'sale grosso': 'condimenti', zucchero: 'condimenti',
  'zucchero a velo': 'condimenti', 'zucchero di canna': 'condimenti',
  miele: 'condimenti', marmellata: 'condimenti', confettura: 'condimenti',
  'crema di nocciole': 'condimenti', 'burro di arachidi': 'condimenti',
  maionese: 'condimenti', ketchup: 'condimenti', senape: 'condimenti',
  'salsa di soia': 'condimenti', pesto: 'condimenti',
  'passata di pomodoro': 'condimenti', 'polpa di pomodoro': 'condimenti',
  'pomodoro pelato': 'condimenti', 'concentrato di pomodoro': 'condimenti',
  cappero: 'condimenti', oliva: 'condimenti', 'oliva nera': 'condimenti',
  'oliva verde': 'condimenti', sottaceto: 'condimenti',
  cetriolino: 'condimenti', dado: 'condimenti', brodo: 'condimenti',
  'brodo vegetale': 'condimenti', 'brodo di carne': 'condimenti',
  'brodo di pollo': 'condimenti', cioccolato: 'condimenti',
  'cioccolato fondente': 'condimenti', 'cioccolato al latte': 'condimenti',
  'gocce di cioccolato': 'condimenti', // plural in common use: the stem of "goccia" does not cover "gocce"
  cacao: 'condimenti', 'cacao amaro': 'condimenti',

  // ── Spezie and aromatic herbs ────────────────────────────
  basilico: 'spezie', prezzemolo: 'spezie', rosmarino: 'spezie',
  salvia: 'spezie', timo: 'spezie', origano: 'spezie', maggiorana: 'spezie',
  alloro: 'spezie', menta: 'spezie', 'erba cipollina': 'spezie',
  aneto: 'spezie', dragoncello: 'spezie', coriandolo: 'spezie',
  pepe: 'spezie', 'pepe nero': 'spezie', peperoncino: 'spezie',
  paprika: 'spezie', paprica: 'spezie', curcuma: 'spezie', curry: 'spezie',
  zenzero: 'spezie', cannella: 'spezie', 'noce moscata': 'spezie',
  'chiodo di garofano': 'spezie', zafferano: 'spezie', cumino: 'spezie',
  anice: 'spezie', sesamo: 'spezie', 'seme di sesamo': 'spezie',
  vaniglia: 'spezie', vanillina: 'spezie', 'estratto di vaniglia': 'spezie',

  // ── Bevande ──────────────────────────────────────────────
  acqua: 'bevande', // Spec D's isTrivialIngredient filters it out upstream when active
  'acqua frizzante': 'bevande', 'acqua naturale': 'bevande',
  vino: 'bevande', 'vino bianco': 'bevande', 'vino rosso': 'bevande',
  birra: 'bevande', caffe: 'bevande', te: 'bevande', 'te verde': 'bevande',
  tisana: 'bevande', camomilla: 'bevande', succo: 'bevande',
  'succo di frutta': 'bevande', 'latte di soia': 'bevande',
  'latte di avena': 'bevande', 'latte di mandorla': 'bevande',
  'latte di cocco': 'bevande', spumante: 'bevande', prosecco: 'bevande',
  marsala: 'bevande', rum: 'bevande', brandy: 'bevande', grappa: 'bevande',
  limoncello: 'bevande', aranciata: 'bevande',

  // ── Typical Surgelati ────────────────────────────────────
  gelato: 'surgelati', ghiacciolo: 'surgelati',
  pisello: 'surgelati', // curated choice: in Italy peas are almost always bought frozen
  'bastoncino di pesce': 'surgelati', 'spinacio surgelato': 'surgelati',
  'verdura surgelata': 'surgelati', 'patatina fritta': 'surgelati',

  // ── Panetteria and leavened goods ────────────────────────
  pane: 'panetteria', 'pane in cassetta': 'panetteria', pancarre: 'panetteria',
  panino: 'panetteria', focaccia: 'panetteria', piadina: 'panetteria',
  grissino: 'panetteria', cracker: 'panetteria',
  'fetta biscottata': 'panetteria', pangrattato: 'panetteria',
  'pane grattugiato': 'panetteria', pizza: 'panetteria',
  'impasto per pizza': 'panetteria', 'pasta sfoglia': 'panetteria',
  'pasta brisee': 'panetteria', 'pasta frolla': 'panetteria',
  lievito: 'panetteria', 'lievito di birra': 'panetteria',
  'lievito madre': 'panetteria', 'lievito per dolci': 'panetteria',
  brioche: 'panetteria', cornetto: 'panetteria', croissant: 'panetteria',
  biscotto: 'panetteria', tarallo: 'panetteria', tortilla: 'panetteria',
  pita: 'panetteria',
};

/** Lookup map: canonical stem → department slug. Built once at load. */
export const DEPARTMENT_BY_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [rawKey, dept] of Object.entries(RAW_INGREDIENT_DEPARTMENTS)) {
    const key = canonicalIngredientKey(rawKey);
    if (!map.has(key)) map.set(key, dept); // first declaration wins; tests forbid conflicting declarations
  }
  return map;
})();

const KNOWN_DEPARTMENT_IDS = new Set(PANTRY_CATEGORIES.map(c => c.id));

export type DepartmentSource = 'pantry' | 'override' | 'dictionary' | 'fallback';

export interface DepartmentClassification {
  /** Slug in PANTRY_CATEGORIES — always a known, valid department. */
  departmentId: string;
  /** Which link of the precedence chain produced departmentId. */
  source: DepartmentSource;
  /** Canonical key of the name — the key an override would be written under. */
  canonicalKey: string;
}

/**
 * Precedence chain (roadmap contract §3):
 * 1. categoryId of the matched pantry entry (only if a known slug — an
 *    unknown slug on the pantry doc does NOT classify and the chain continues);
 * 2. user override (ignored if it points to a slug that is no longer known);
 * 3. static dictionary;
 * 4. 'altro' fallback.
 */
export function classifyIngredientDepartment(
  name: string,
  pantryItems: PantryItem[],
  overrides: Record<string, string>
): DepartmentClassification {
  const canonicalKey = canonicalIngredientKey(name);

  const match = matchIngredientToPantry(name, pantryItems);
  if (match.item && KNOWN_DEPARTMENT_IDS.has(match.item.categoryId)) {
    return { departmentId: match.item.categoryId, source: 'pantry', canonicalKey };
  }

  const override = overrides[canonicalKey];
  if (override && KNOWN_DEPARTMENT_IDS.has(override)) {
    return { departmentId: override, source: 'override', canonicalKey };
  }

  const fromDictionary = DEPARTMENT_BY_KEY.get(canonicalKey);
  if (fromDictionary) {
    return { departmentId: fromDictionary, source: 'dictionary', canonicalKey };
  }

  return { departmentId: DEPARTMENT_FALLBACK_ID, source: 'fallback', canonicalKey };
}
