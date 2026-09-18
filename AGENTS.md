# AI Agent Guidelines - Il Mio Ricettario

**Focus**: only gotchas that can cause >30min of debugging. For architectural context: [CLAUDE.md](CLAUDE.md). For session rules and guided testing: [WORKFLOW.md](WORKFLOW.md)

**Domain guides** (`doc/guide/`, read before working in that domain):
- [pantry-matching.md](doc/guide/pantry-matching.md) — ingredient ↔ pantry engine, "Hai già in casa", checked items → pantry, end-of-cooking deduction

---

## Quick Reference

| Gotcha | Problem | Solution |
|--------|---------|----------|
| Custom `@keyframes` in `@layer` | `@keyframes` defined inside `@layer utilities` are ignored by Tailwind Animate | Define `@keyframes` at root level in `globals.css`, BEFORE the `@layer` blocks; the utility classes that use them go inside `@layer utilities` |
| Stagger with Tailwind | `animation-delay-[--delay]` and `[animation-delay:var(--delay)]` don't work as arbitrary classes on every build | Use inline `style={{ animationDelay: '...' }}`; cap delay at 350ms on large collections |
| Leftover `[QTY:n]` in AI steps | Claude resets the `[ING:n]` numbering per section on multi-section recipes; the parser leaves raw `[QTY:n]` in Firestore; `renderStepDescription` doesn't handle it → visible to the user | Parser: return `''` instead of `match` in `replaceAiQuantityReferences`; renderer: append `.replace(/\[QTY:\d+\]/gi, '')` at the end for backward compat with already-saved data |
| Semi-transparent fixed nav on light palette | `bg-background/92` on a cream background is perceptually identical to the content underneath — it looks transparent. On iOS, `backdrop-filter` may fail to composite with the cards' `will-change-transform` layers | Use `bg-background` (100% opaque) on any fixed nav with a light palette; keep `backdrop-blur` for those who support it |
| Static `will-change-transform` on cards | Creates a GPU compositing layer for every card. With 20+ recipes it exhausts mobile GPU memory → scroll jank. On touch, `hover` never fires, so the cost is purely passive | Use `group-hover:will-change-transform` to promote the layer only at hover time (desktop). Never use static `will-change-transform` on card lists |
| `shadow` in `transition-[...]` on mobile | The `shadow` transition is always CPU-bound (no browser GPU-composites it) — repaint on every frame even though `hover` doesn't fire on touch | Remove `shadow` from the transition list; the shadow can appear instantly on hover with no animation cost |
| `background-attachment: fixed` on body | On iOS Safari and mobile Chrome it disables the GPU-composited scroll path (the browser can't delegate scrolling to the compositor thread because the BG must stay fixed) → CPU-bound scroll → jank, worse in portrait where documents are tall | Never use it on mobile; if the BG must stay visually fixed, use an element or pseudo-element with `position: fixed; z-index: -1` separate from the scrollable content |
| `min-h-screen` on top-level mobile layout | `100vh` is static — it doesn't react to the browser address bar appearing/disappearing while scrolling → layout micro-shift | Use `min-h-[100dvh]` on top-level containers on mobile; on desktop `calc(100vh - X)` stays correct because the address bar doesn't change |
| Orientation classes | `portrait:` also applies to desktop | Use `max-lg:portrait:` |
| Page self-padding | Inner page adds `p-4 lg:p-8` on a layout that already provides `portrait:p-4` / `lg:px-10` | Pages inside the dashboard layout must not add outer padding; use `max-w-*` only to center content |
| Flex tab bar overflow | Tabs with fixed `px-5` in a `flex` container overflow at ≤375px (3 tabs ≈ 420px > 343px available) | `px-3 sm:px-5` + `flex-shrink-0` + `overflow-x-auto` on the container |
| CSS grid on narrow landscape | `repeat(N, 1fr)` with N=7 on iPhone SE landscape (~568px) = ~65px per column — unreadable cells | `repeat(N, minmax(72px, 1fr))` + `overflow-x-auto` on the wrapper |
| Firebase optional | `undefined` causes silent write errors | For persisted optional fields use `null` or omit the key entirely; never pass `undefined` to Firestore |
| Firestore composite index | `where + orderBy` query fails or breaks at runtime | Add the index in `firebase/firestore.indexes.json` and deploy |
| Firestore deploy drift | Rules/indexes updated in the repo but not in Firebase | Run `firebase deploy --only firestore` |
| Cooking sessions | Duplicated if created in `useEffect` | Use the setup screen pattern |
| Cooking history | Empty statistics if the user leaves without the final CTA | Record completion only from `Termina cottura` |
| Quantity format | Confusing fractions (`1 1/2`) | Decimals (`1,5`) |
| useState prop | `useState(prop)` doesn't react to changes | Add a sync `useEffect` |
| AI route auth | Protected AI routes fail with `401` | Always send `Authorization: Bearer <idToken>` with a refreshed token |
| Firebase Admin env | Protected AI routes fail even with a logged-in user | Configure Firebase Admin credentials server-side; `NEXT_PUBLIC_FIREBASE_*` alone is not enough |
| Firebase Admin base64 | `FIREBASE_ADMIN_CREDENTIALS_BASE64` looks valid but bootstrap fails | The service account JSON uses snake_case keys (`project_id`, `client_email`, `private_key`) |
| Docker env | `docker compose` doesn't read `.env.local` | Use `docker compose --env-file .env.local ...` |
| Local week dates | `toISOString().slice(0, 10)` shifts by a day in `Europe/Rome` | Use local formatters (`formatLocalDate`, `getWeekMonday`) |
| Dynamic step quantities | Quantities in steps stay static or end up misaligned | Use `{{qty:ingredientId}}` tokens resolved at runtime |
| AI quantity references | The AI doesn't know the final `ingredientId`s | Have it emit `[ING:n]` and `[QTY:n]`, then convert them in the parser |
| Sonnet 5 parameters → 400 | `temperature`/`top_p`/`top_k`/`budget_tokens` (or prefill on the last assistant turn) return **400** on Sonnet 5, with an unhelpful error on the route side (generic 500) | Never set them; to control depth use `thinking: {type:'adaptive'}` + `output_config.effort`. `effort` requires `@anthropic-ai/sdk >= ~0.100` |
| AI model literal drift | Changing the model but forgetting one of the endpoints → routes on different versions | The model is the `AI_MODEL` constant (`lib/utils/constants.ts`): change it there only, never a per-route literal |
| Family profile persistence | You think you need to deploy rules or create a new collection | Save to `users/{uid}.familyProfile`; the existing owner-based rules are enough |
| Family context scope | The family context alters flows that must stay faithful to the input | Use it only in generative/adaptive flows (`chat`, `testo libero`), NOT in `Carica PDF` nor in the planner (now local, no AI) |
| Shopping list debounce non-flushed | The Firestore write of the check marks is debounced 500ms; if the component unmounts or the tab goes to background within 500ms the timer was cancelled without saving → check marks "reappear" unchecked days later | Flush the pending write on `unmount` + `visibilitychange(hidden)` + `pagehide`, reading from a `latestStateRef` (no stale closure); reset the timer ref when it fires |
| New persistence target forgotten in the flush | `useShoppingList` writes to two independent documents (plan on `meal_plans`, ad-hoc on `users/{uid}`): adding a third target with its own debounce but forgetting to call it from the existing `unmount`/`visibilitychange`/`pagehide` handlers silently reproduces the same lost-check-marks bug, but only for the new field | Every new persistence target needs its own timer/ref **and** must be explicitly added to the shared flush function (`flushAll()` in `useShoppingList`) |
| Shopping list check marks "reset" on remount | `useShoppingList` lives inside the page component (`lista-spesa/page.tsx`): leaving the page and coming back unmounts/remounts the hook. The plan query has `staleTime: 2min`, so a remount within that window reuses the snapshot cached by the **first** fetch — and the init effect blindly trusted that snapshot, overwriting local state with the old check marks even though the Firestore write had already succeeded in the meantime | Every change to `checkedIdsList`/`customItems` also immediately updates the React Query cache (`queryClient.setQueryData` on the plan's query key), not just Firestore — so a remount within `staleTime` re-reads the current state and not the one from the original fetch |
| Shopping list `localStorage` fallback never re-read | If a Firestore write fails and the `localStorage` fallback kicks in, that fallback is never re-read as long as `shoppingCheckedIds` on Firestore is not empty — init only checks empty/non-empty, not which of the two is more recent | Not fixed (rare case): to be handled separately if it comes back, by comparing a timestamp instead of just the empty/non-empty state |
| Shuffle `preferredCategoryId` hard filter | Setting a preferred category per meal type limits the shuffle to ONLY that category for that meal (all lunches the same) | To get variety while avoiding certain dishes use `excludedCategoryIds` (Escludi), not `preferredCategoryId` |
| Planner per-meal config invisible | The "Categorie per portata" section appears only in the *setup* step (new plan), inside the collapsed "Stagione e regole" panel, and only with `categories.length > 0` | If you can't see it: open "Stagione e regole"; or a plan already exists for that week (you're on the calendar → "Nuovo piano"); or you have no categories (a hint is shown) |
| Collapsible auto-close mount | `prevCheckedRef = useRef([])` triggers auto-close of already-complete sections on mount | Initialize `prevCheckedRef` with the current value of `checked*`, not with `[]` |
| isToday timezone | Timestamp comparison shifts by a day in `Europe/Rome` | Use `getFullYear()/getMonth()/getDate()` (local), not timestamps |
| YYYY-MM-DD string parsing | `new Date('2026-05-06')` is interpreted as UTC midnight → in `Europe/Rome` (+1/+2) it lands on the previous day | Always add the local suffix: `new Date(dateStr + 'T00:00:00')` — applied in `expiryStatus()`, `formatLocalDate`, `getWeekMonday` |
| React Query + user null | Query runs before auth is ready | Always add `enabled: !!user` (and `!!recipeId` where needed) |
| React Query DevTools | The icon doesn't appear despite having QueryClientProvider | The separate `@tanstack/react-query-devtools` package is required |
| React Query + useEffect init | Cache revalidation re-runs `useEffect([recipe])` | Use a `sessionInitialized` ref to guard one-time init |
| Step duration max | Browser validation error on steps lasting many hours | Use `max={9999}` not `max={999}` — 24h = 1440 min |
| Multiple timers | A single `setInterval` + single state doesn't support parallel timers | Use `Map<stepId, setInterval>` in a ref + `Record<stepId, secondsLeft>` in state |
| Hardcoded `bg-white` | `bg-white` is always `#ffffff` — it ignores the `--background` token | Use `bg-background`, `bg-card`, `bg-muted`, `bg-secondary` |
| Nonexistent OKLCH color scale | `bg-primary-100`, `border-primary-200`, `text-primary-700` don't exist with a custom OKLCH palette — Tailwind generates scales only for static colors, not for CSS vars | Use the opacity modifier: `bg-primary/10`, `border-primary/20`, `text-primary` |
| Theme color without `<alpha-value>` = opacity modifier emits NO CSS | Tailwind 3 cannot parse `oklch(var(--primary))`, and for a color it cannot parse it emits **no utility at all** for `bg-primary/10`, `ring-primary/40`, `border-border/70`, `hover:bg-primary/90`… — no warning, the class is simply absent. The element silently falls back: no tint, and `ring-1 ring-primary/40` becomes Tailwind's default **blue** ring (it was the planner's "today" marker). It went unnoticed from the OKLCH migration (2026-04) to 2026-09-17: 0 such rules in the production CSS against ~237 usages in `src`, dark mode full of harsh lines | Every color in `tailwind.config.js` is declared `'oklch(var(--x) / <alpha-value>)'` (static scale steps too) — keep it that way for any color you add. The CSS variables keep holding OKLCH components only, so the `.dark` overrides are unaffected. To check a suspicious class, look for it in the built CSS (`grep -F 'primary\/' .next/static/css/*.css`), not at the JSX. Watch text alpha: `text-primary/70` on cream is ~2.9:1, fine for an icon, not for text (2026-09-17) |
| Border with no color class = cold gray, glaring in dark mode | `border`, `border-t`, `divide-y` without a color use Tailwind's default `gray-200`: a cold gray the palette forbids, nearly invisible as a mistake on cream, but a near-white line in dark mode because it doesn't follow the theme (sidebar edge, footer, every bare `border` card) | `theme.extend.borderColor.DEFAULT` is bound to the `--border` token in `tailwind.config.js`; a bare `border` is now correct by default, `border-border` stays valid but is no longer required (2026-09-17) |
| Native HTML elements without `bg` | `<textarea>`, `<select>`, `<input>` show a white background even with the OKLCH theme | Always add `bg-background text-foreground` explicitly — the browser doesn't inherit CSS custom properties from the theme |
| Side-stripe design ban | `border-l-[2px+]` on card/list item is an AI slop tell — banned even when semantic | Replace with an `absolute top-1.5 left-1.5` badge (icon + color) or a background tint; never side-stripe |
| Dated `animate-bounce` | Bounce easing on a typing indicator or buttons looks dated | Use `animate-pulse` for activity indicators; `ease-out` easing for intentional motion |
| Delight state drift | Loading/empty/error boxes built ad hoc page by page break visual consistency and bring hardcoded color classes | Reuse `EditorialLoader`, `EditorialEmptyState`, `StatusBanner`; if a `react-hot-toast` toast is needed, style it globally in `providers.tsx`, not locally |
| React Query stale cache after write | After `createCookingSession` / `deleteCookingSession` (or any Firestore write), navigating to a list page shows stale data until `staleTime` expires | Always call `queryClient.invalidateQueries({ queryKey: [...] })` after every write that affects a query on another page |
| Stale shopping list after a plan change | A concrete and particularly insidious case of the gotcha above: the shopping list is a **derived view** cached on `['shoppingList', uid, weekStartDate]`. Writing to the slots doesn't touch that cache, so for 2 minutes (`staleTime`) the list keeps asking you to shop for a removed meal, and it looks correct until you do a hard refresh | **Every** plan mutator must call `invalidateShoppingList()` (`useMealPlanner`), including plan deletion, which lives in `pianificatore/page.tsx`. Partial match on the key (without `weekStartDate`): `copyPlanToWeek` writes to a different week than the one on screen |
| `next/dynamic` on tab UI components | `dynamic()` with a `loading` fallback shows a visible loader on the first tab switch — unacceptable for small components on the same route | Use normal static imports; `next/dynamic` only makes sense for heavy components at whole-page level |
| Raw Tailwind colors outside the design system | `green-*`, `orange-*`, `purple-*` used for states (completion, validation, AI) are visually inconsistent — the project's `accent` token is already sage green | For completion states: `text-accent`, `bg-accent/10`, `border-accent/40`; for warnings: `text-primary`; never `purple-*` |
| Filter counts computed on the full set | A category badge `useMemo` that depends on `recipes` instead of the upstream subset: changing season doesn't update the category counts | Compute `recipeCountByCategoryId` on `recipesForCategoryFilter` (post-season); a multi-category recipe increments **every** id returned by `getRecipeCategoryIds(recipe)`; season counts stay on the full `recipes` |
| Multi-category recipe: reading `categoryId` directly | `recipe.categoryId` alone ignores `categoryIds[]` (new format) and skips multi-category recipes in filters/counts/badges | **Always** read through `getRecipeCategoryIds(recipe)` (`lib/utils/recipe-categories.ts`, dual-read: prefers `categoryIds[]`, falls back to legacy `categoryId` for pre-migration recipes). Never access `recipe.categoryId` directly outside that helper |
| Multi-color badge from `category.color` (hex) | You need a background tint from the saved hex color without nonexistent OKLCH scales (`bg-primary-100` etc. don't exist, see above) | Inline hex alpha on the saved color: `style={{ color: category.color, backgroundColor: `${category.color}1a` }}` (10% alpha) — not a tailwind arbitrary class with a dynamic color |
| Invisible test credentials | You think the login panel has disappeared, but the UI is correct | Test credentials in the login appear only with `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true`; after changing env restart `npm run dev` |
| `jest.setup.js` vs `.ts` | `@testing-library/jest-dom` v6 uses module augmentation to extend Jest matchers; TypeScript ignores `.js` files → `toBeInTheDocument` and similar are typed as nonexistent | The Jest setup file that does a side-effect type import (`import '@testing-library/jest-dom'`) must have a `.ts` extension; also update `jest.config.js` (`setupFilesAfterEnv`). Applies to any package that extends Jest matchers (e.g. `jest-extended`) |
| `next/font` in `'use client'` | Runtime error — `next/font/google` works only in Server Components | Root layout must be a server component; extract QueryClient+Auth into `src/components/providers.tsx` |
| Collapsible `max-h` animation | `max-h-[2000px]` thrashes layout/paint on every frame (not GPU-accelerated) | Use `grid-rows-[0fr] → grid-rows-[1fr]` with an `overflow-hidden` wrapper; add `motion-reduce:transition-none` |
| Unconfigured `container mx-auto` | Tailwind's `container` expands without limits if not configured in `tailwind.config.js` | Use explicit `max-w-*` (`max-w-4xl`, `max-w-5xl`) instead of `container` |
| `max-w-*` without `mx-auto` | Content stays left-aligned on wide desktop even with `max-w` | Always add `mx-auto` together with `max-w-*` on pages with centered content |
| Step editor actions inline on mobile | A `su/giu/elimina` toolbar on the same row as the content reduces the textarea's usable width and makes the step look "squashed" | On mobile put the controls on a separate row below the content; from `sm` up they can sit at the top right |
| Sandbox build `spawn EPERM` | `npx next build --webpack` can fail in the sandbox even when the code is correct | If `spawn EPERM` appears, rerun the build outside the sandbox; don't treat it as an application error |
| Action hidden in `group-hover` on touch | `opacity-0 group-hover:opacity-100` on a control (e.g. the ↺ reshuffle-slot button) makes it **invisible on mobile**: touch doesn't trigger `hover`, the action seems not to exist | Keep the control always visible below `lg` and hide it only from desktop: `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100`; add `aria-label` (a `title=` isn't enough for screen readers) |
| Native `confirm()`/`alert()` | The browser's system dialogs are off-brand, neither stylable nor focus-trappable | For destructive confirmations use `ConfirmDialog` (`components/ui/confirm-dialog.tsx`, controlled, built on Radix `Dialog`); for validation/errors use `react-hot-toast`. Never `window.confirm`/`window.alert` |
| `position: sticky` inside `overflow:hidden` | An ancestor with `overflow:hidden` (e.g. `.shell-stage`) becomes a scroll container and **cancels `sticky`** relative to window scroll: the element doesn't stick and scrolls away (symptom: `sticky top-0` header disappearing on scroll, unreachable sidebar footer) | Don't rely on `sticky` inside `.shell-stage`. On desktop the dashboard uses an **app-shell with internal scroll** (`<main>` with `lg:overflow-y-auto`, fixed viewport-height shell) so header/sidebar/footer stay put without `sticky`. Alternative: `overflow: clip` (doesn't create a scroll container, preserves `sticky`) |
| Dark mode — `.dark` block | Rewriting tokens with a full `oklch()` (e.g. `oklch(1 0 0)`) breaks the inline alpha `oklch(var(--x) / a)` used everywhere | In the `.dark` block (`globals.css`) override ONLY the OKLCH components (`16% 0.012 65`), never with wrapper/alpha. Surfaces with light literals "baked" into arbitrary classes (`body` gradient, `.shell-stage`, `.shell-panel`, sidebar drawer, `more-sheet`, `status-banner` warning, auth pages) need explicit `.dark`/`dark:` overrides |
| next-themes hydration mismatch | next-themes writes the `.dark` class on `<html>` client-side → hydration warning/mismatch | `suppressHydrationWarning` on `<html>`; components that display the theme state (e.g. `ThemePicker`) use the `mounted` pattern (`useEffect`) so SSR and CSR don't diverge |
| Content inside `shell-panel` under the overlay | `.shell-panel::before` is `position:absolute; inset:0` (decorative gradient): content in normal flow ends up **under** the overlay and looks washed out | Wrap the panel content in `relative z-10` (same pattern as `recipe-card`, `EditorialEmptyState`, `StatusBanner`) |
| Blue native checkbox/`<input type=checkbox>` | Without `accent-color`, the checkbox uses the system blue → breaks DESIGN.md's "Anti-Cold Rule" on the cream palette (common in cooking checklists) | Always add `accent-primary` to the checkbox; for the most-touched controls a ≥44px area and `tabIndex={-1}` if the row is already `role="button"` (avoids a double tab stop) |
| `next lint` removed in Next 16 | `npx next lint` interprets `lint` as a directory and fails; there's no ESLint config in the repo | Validate with `npx tsc --noEmit` + `npx next build --webpack`; don't rely on `next lint` |
| Silent `pause_turn` with server tools | With a server-side tool (web search) the API stops at 10 iterations and returns `stop_reason: 'pause_turn'` on **HTTP 200**: no error. In the `[RISPOSTA]`/`[RICETTE]` format the text truncates after `[/RISPOSTA]` has closed but before `[/RICETTE]` → the user sees a normal reply and **the recipes have simply vanished** | Always go through `createMessageWithToolLoop()` (`lib/api/claude-tool-loop.ts`): it resends the conversation with the paused assistant turn at the end and **no new user message** (a "Continua." breaks the resumption because it reads as a new instruction) |
| Web search error = `content` object, not array | A search error (`max_uses_exceeded`, etc.) returns **HTTP 200** with `web_search_tool_result.content` being an *object* `{error_code}` instead of the usual *array* of results: `.map()` on it throws, or you read `undefined` | `Array.isArray(content)` before iterating (done in `extractWebSearchSources`, `lib/utils/claude-blocks.ts`). A search error is degraded quality, not a failed request: `console.warn` and let the reply through, since the model has already produced it and it has already been paid for |
| Rotated phone photos | `createImageBitmap(file)` without options ignores EXIF orientation: photos taken in portrait arrive rotated by 90°, and a sideways label is unreadable for the model — which is exactly the use case | `createImageBitmap(file, { imageOrientation: 'from-image' })`. Also `toBlob` (not `toDataURL`): you need `blob.size` before the base64 expansion. And `bitmap.close()` + **sequential** processing: mobile Safari goes OOM with several 12 MP decodes in parallel |
| Images replayed in the history | Each photo costs up to ~4784 tokens: 3 photos resent over 20 turns are ~280k input tokens in **one** request | In the history store only a text marker (`[L'utente ha allegato N foto...]`); the model's own description of the photos (required by `VISION_GUIDANCE`) is what carries the context forward. It also avoids restructuring `ApiHistoryMessage.content` from `string` to a block array |
| `image/*` accepts HEIC | iPhones deliver HEIC, which isn't a valid media type for the API **and** which Chrome on Android can't even decode in canvas | List the explicit types (`image/jpeg,image/png,image/webp`) in `accept` and validate them client- and server-side. Failing immediately with a clear message is better than failing later during decoding or with a 400 |
| Non-discriminated union → lost narrowing | A helper returning `{blocks: X[]; error: null} \| {blocks: null; error: string}` isn't narrowed by `if (result.error)`: TS still sees `blocks` as possibly `null` | Use a literal discriminant (`{ok: true, ...} \| {ok: false, ...}`) and branch on that |
| Total kcal instead of per serving | A recipe total silently goes out of sync as soon as `servings` changes in the form or cooking mode scales it at runtime | `caloriesPerServing`, `servingWeightGrams` and `macrosPerServing` are **always** per serving. Totals/densities (e.g. kcal/100g) are derived at render time, never the other way around |
| Optional numeric field as `number` in state | `useState(recipe?.caloriesPerServing || 0)` doesn't distinguish "empty" from `0`: clearing the field writes `0` and the estimate becomes impossible to delete | Keep the state as a **string** and convert on save; in `updateDoc` an empty value must become `deleteField()`, because omitting the key merges and keeps the previous value. Same pattern for `servingWeightGrams` and the three macro fields |
| Truthy gate on a legitimately-zero value | `recipe.macrosPerServing?.fatGrams &&` (or any bare `if (x)`) treats `0` as absent — a fat-free dish silently loses its "0 g" display or drops out of a count | Gate optional-but-possibly-zero fields on `!= null`/`== null`, never truthiness. `caloriesPerServing`'s existing truthy gates stay valid only because 0 kcal is unreachable by construction (server min 20, form `> 0`) — don't copy that gate to a field where 0 is legitimate |
| Partial macro trio | `MacrosPerServing` (`{ proteinGrams, carbsGrams, fatGrams }`) has no optional fields: writing only 1-2 of the 3 either throws a type error or silently drops the rest | Treat the trio as all-or-nothing in the UI too — block submit with a toast unless all three fields are filled (0 counts as filled) or all three are empty, then build the object only once all three have parsed |
| AI totals vs. per-serving for weight/macros | Asking the model directly for a per-serving weight/macro figure risks the same "skipped division" failure as calories, but for two more fields at once | `/api/estimate-calories` requests weight/macros as recipe TOTALS (`totalWeightGrams`, `totalMacros`); the server (`deriveNutritionPerServing()`, `lib/utils/nutrition-estimate.ts`) always does the division, then clamps and applies the Atwater consistency check (`4·protein + 4·carbs + 9·fat ≈ kcal`, ±30% tolerance) before persisting |
| `json_schema` with length constraints | Structured outputs do **not** support `minItems`/`maxItems` on arrays (nor `minimum`/`maximum`, `minLength`/`maxLength`, `multipleOf`): the API responds **400** and the request fails entirely — `output_config.format.schema: For 'array' type, property 'maxItems' is not supported`. The downstream symptom is misleading: the client catches the error and returns `null`, so the feature just seems to "not work" instead of reporting an invalid schema | Put only shape and types in the schema (`type`, `enum`, `required`, `additionalProperties: false`). Quantity constraints go in the **prompt**, and if a guarantee is needed it's applied server-side on the result (`.slice(0, 3)`): truncating is an acceptable degradation, a 400 on the whole request is not |
| Orphan slots after removing a meal type | `buildContributions` (`ingredient-aggregator.ts`) iterates **all** slots without filtering by `activeMealTypes`: removing the meal type from `activeMealTypes` without deleting its slots leaves its ingredients in the shopping list, for a meal the calendar no longer shows | `removeMealType` (like `removeDay`) clears `activeMealTypes` **and** the slots in a single `updateMealPlan` |
| Unordered `activeMealTypes` | The persisted array IS the render order (grid, chips, form): point writes (`addMealType`, setup toggle) that only append break the canonical order of the day (e.g. adding colazione to an existing plan shows it last) | Always pass the array through `sortMealTypes()` (`lib/constants/meal-types.ts`) both on write and on read: it sorts by index in `SELECTABLE_MEAL_TYPES`, legacy types at the end (stable sort) — reading also self-corrects Firestore plans saved before the fix, without a migration |
| Optional group + `$` anchor in a header regex | `/##\s+Ingredienti(?:\s+(per\s+.+))?$/i` fails **as a whole** on `## Ingredienti La pasta` (the optional group doesn't match, `$` anchors the rest); a `startsWith` guard consumes the line anyway, so the section vanishes without an error | Permissive lazy capture `(.+?)` + `[\s:]*$`, kept in `SECTION_HEADER_PATTERNS` (`recipe-parser.ts`), with one test per header form the prompt can produce (2026-09-11, `recipe-parser.test.ts` → `recipe-parser section headers`) |
| Alphabetical sort on recipe sections | Sections are the order of **preparation**: `localeCompare` puts "Per la crema" before "Per la base" | Order of first appearance (a `Map` keeps insertion order), section `null` first — for ingredients and for steps without `sectionOrder` (2026-09-11, `ingredient-list-collapsible.tsx`, `steps-list-collapsible.tsx`) |
| `?? 999` fallback as sort key | A shared sentinel collapses every keyless element into one tie, left in arbitrary order (steps created from the form have no `sectionOrder`) | Use the index of first appearance, on the same scale as the real key; `sort` is stable (2026-09-11, `steps-list-collapsible.tsx` → `sectionSortKeys`) |
| Section order after assigning sections to a flat list | `Ingredient` has no order field: once sections are assigned after the fact, the ingredient array's first-appearance order no longer follows the cooking order, and the Ingredients and Preparation columns contradict each other | Steps are the authority: `orderedSectionNamesFromSteps()` (`lib/utils/section-assignments.ts`) passed as `orderedSections` to `IngredientListCollapsible` and used by `summarizeSectionProposal`. An invariant linking two views must be asserted across both, not inside each (2026-09-11, `section-assignments.test.ts`) |
| Jest and Playwright competing for `*.spec.ts` | Any Playwright spec in `e2e/` (guided-test scratch scripts included) makes `npm run test` fail with `TypeError: Class extends value undefined`, which looks like a broken unit test | `testPathIgnorePatterns` with `<rootDir>/e2e/` and `<rootDir>/.next/` (2026-09-11, `jest.config.js`) |
| Playwright guided-test script + Next env | A script in `e2e/scratch/` that imports a module from `lib/utils` pulls in `lib/firebase/config.ts` through import chains, and Playwright does **not** load `.env.local` the way Next does: it fails with `FirebaseError: auth/invalid-api-key` before the test even runs | Launch with the env exported by hand: `set -a; . ./.env.local; set +a; FIRESTORE_EMULATOR_HOST=... npx playwright test ...` — can't be solved in config, it goes in the command (2026-09-11) |
| Playwright + async Firestore write: false positive | An assertion on text already present in the **previous** step of the flow (e.g. a form label visible even before submit) resolves `toBeVisible()` to `true` immediately, even if the click that was supposed to trigger a Firestore write hasn't completed yet — the test "passes" and the browser context closes mid-write, aborting the in-flight request | Always wait for a marker visible **only in the next step** (e.g. a title present only in the calendar view, not in the setup form), never a text that already exists before the action under test |
| New FIELD on an existing persistence target | A field added to the plan's shopping write isn't a new target, so the flush gotcha above looks irrelevant — but it still has to go through **every** point of the circuit; the easy ones to miss are the React Query cache-sync effect (field dropped on a remount within `staleTime`) and the init "Firestore has state" test (field overwritten by the localStorage fallback) | Follow the CHECKLIST comment on `useShoppingList` (2026-09-15, both points asserted in the Spec D guided test) |
| `undefined` inside an element of a persisted array | `{ ...item, flag: undefined }` makes `updateDoc` reject the **whole** array write; with a best-effort silent `catch` the change simply doesn't survive a reload | Set the flag to `true` or `delete` the key on a copy (2026-09-15, `withPantryIncluded` in `useShoppingList`) |
| Array field rewritten from a cached copy | Writing `[...cached.array, value]` from a React Query copy (up to 2 min old) drops what another device added meanwhile | `arrayUnion` for additive array writes (2026-09-15, `addPantryItemAlias` in `lib/firebase/pantry.ts`) |
| Two updates on one doc in a `writeBatch` | `batch.update` twice on the same document keeps only the last one, with no error | Accumulate per document **before** building the ops (2026-09-15, `buildPantryBatchOps` / `buildPantryDeductionUpdates`, tested in `pantry-batch.test.ts` / `pantry-deduction.test.ts`) |
| Retried multi-write completion | `addDoc` followed by a write that fails → the user retries and the first write is duplicated (cooking history counted twice by statistics) | Deterministic ids for writes that can be retried (`createCookingHistoryEntry({ entryId: session.id })` → `setDoc`), writes ordered so each partial failure is retry-safe, non-idempotent steps guarded by a persisted flag (2026-09-15, `finalizeCooking` in `ricette/[id]/cooking/page.tsx`) |
| `lg:hidden` on a Sheet/Dialog content | The Radix overlay is a sibling of the content: hiding only `SheetContent` above a breakpoint still renders the blurred full-screen overlay, so the page looks frozen and swallows every click | Adapt the content per breakpoint (bottom sheet → `lg:` centered modal, as in `PantryAddSheet`) or don't open it at that width; test sheets at a phone **and** a ≥1440px viewport — Playwright's default 1280px is still "mobile" here (2026-09-15, `PantryItemQuickSheet`) |
| Playwright locator on a "fully checked" section header | `ShoppingSection`/`DepartmentSection` prepend `"✓ "` to the header once every row is checked (by design); a locator anchored `name: /^Reparto/` stops matching the instant the section becomes fully checked, and the row inside reads as "not found" even though it's on screen | Match the optional prefix: `` new RegExp(`^(?:✓ )?${name}`) `` (2026-09-16, Spec E guided test) |
| Two plan mutations in the same tick | Every planner mutation rewrites the WHOLE `slots` array from the `currentPlan` it closed over. Two calls in the same tick (the slot editor flushes the debounced people stepper right before committing a variant) both start from the same render's plan, and the second write silently undoes the first | Slot mutations read `latestPlanRef.current`, updated synchronously inside `applyPlan()` — never `setCurrentPlan` directly (2026-09-17, CHECKLIST comment on `useMealPlanner`) |
| Scaling a legacy plan "at factor 1" | Routing a `servingsPlanned == null` slot through `scaleQuantity()` looks harmless, but the scaler reformats on its way (`1/2 tazza` → `0,5 tazza`, `1, 5 kg` → `1,5 kg`): existing shopping lists would change on their own after a deploy | Legacy slots copy `ing.quantity` as-is and never enter the scaler; `servingsPlanned` is written only after an explicit user action (shuffle, slot editor, a previously empty cell) — opening the editor must not persist it. Note that `ServingsStepper` re-emits its value on blur: ignore an unchanged value (2026-09-17, `buildContributions` + `ingredient-aggregator.test.ts` → `legacy invariant`) |
| Playwright `reload()` right after a shopping-list checkbox click | The Firestore write is debounced 500ms (see "Shopping list debounce non-flushed" above); a `page.reload()` issued a few ms after the click races the flush-on-unmount handler against an in-flight write, and the check mark reads back `false` | Wait for the write with `expect.poll` on the emulated Firestore doc before reloading, same convention as reading debounced state generally — don't rely on the unmount flush to win a race you didn't measure (2026-09-16, Spec E guided test) |

---

## 1. Responsive Navigation

**Breakpoint `lg` = 1440px**.

```tsx
className="max-lg:portrait:flex max-lg:landscape:hidden"  // ✅
className="portrait:flex landscape:hidden"                 // ❌ applies to desktop
```

- Desktop (≥1440px): sidebar always visible
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sidebar drawer

**Scroll model (desktop ≥1440px) = app-shell**: `.shell-stage` has a fixed viewport height (`lg:h-[calc(100vh-2rem)]`) and only `<main>` scrolls (`lg:overflow-y-auto`, flex row `lg:min-h-0`). Header, sidebar and footer stay put (no `sticky` — it wouldn't work inside `overflow:hidden`, see Quick Reference). The theme picker lives in the sidebar footer (item list in a `min-h-0 flex-1 overflow-y-auto` wrapper, picker anchored below). Below 1440px window scroll remains. The `--shell-focus` effect reads `mainRef.scrollTop`, not `window.scrollY`.

**Sticky button above the bottom nav:**
```tsx
<div className="sticky bottom-0 max-lg:portrait:bottom-20 bg-background border-t py-4 z-10">
```

**Pages must not add their own outer padding:**
The `<main>` in the dashboard layout already provides all per-viewport padding:
- `lg:px-10 lg:py-8` — desktop
- `max-lg:portrait:p-4 max-lg:portrait:pb-20` — mobile portrait
- `max-lg:landscape:p-4` — mobile landscape

```tsx
// ❌ WRONG — creates double padding (e.g. 32px on portrait instead of 16px)
return <div className="p-4 sm:p-6 lg:p-8">...</div>

// ✅ CORRECT — uses max-w only to center content, not for page padding
return <div className="max-w-2xl mx-auto">...</div>
```

**Grid with minimum-width columns + horizontal scroll:**
```tsx
// ❌ WRONG — 7 columns in 568px landscape = ~65px per column (unreadable)
style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}

// ✅ CORRECT — keeps a readable minimum, scrolls if needed
<div className="overflow-x-auto">
  <div style={{ gridTemplateColumns: `80px repeat(7, minmax(72px, 1fr))` }}>
```

---

## 2. Firebase Patterns

**`null` vs `undefined`**: Firebase rejects `undefined` on write. For persisted optional fields:
- use `null` when the data model explicitly expects it
- or omit the key with a conditional spread (`...(value ? { field: value } : {})`)
- never pass `undefined` to `addDoc()` / `updateDoc()`

**Composite Index**: `where(...) + orderBy(...)` queries require an index in `firebase/firestore.indexes.json`. If the error is caught in a generic `catch`, on the UI side it just looks like "no data". After every change: `firebase deploy --only firestore`.

Active indexes:
- `categories`: `userId ASC, order ASC`
- `cooking_history`: `userId ASC, completedAt DESC`
- `cooking_sessions`: `userId ASC, lastUpdatedAt DESC`
- `meal_plans`: `userId ASC, weekStartDate DESC`
- `pantry_items`: `userId ASC, createdAt DESC` (in the repo but unused: `getPantryItems` filters on `userId` only)
- `recipes`: `userId ASC, createdAt DESC`

**User Profile Extensions**: for user preferences that don't need dedicated queries, use the existing `users/{uid}` instead of opening a new collection (e.g. `familyProfile`).

**Cooking History**: `cooking_sessions` = ephemeral state; `cooking_history` = append-only event created only by `Termina cottura`. Statistics read only from `cooking_history`.

---

## 3. React Query Patterns

```ts
// ✅ Disabled until auth is ready
useQuery({ queryKey: ['recipes', user?.uid ?? ''], queryFn: ..., enabled: !!user });
// ❌ DO NOT use onSnapshot — avoided because of Firestore costs
```

**Standard query keys:**

| Key | Usage |
|-----|-------|
| `['recipes', uid]` | User recipe list |
| `['recipe', id, uid]` | Single recipe (shared between detail/edit/cooking) |
| `['categories', uid]` | Categories |
| `['cookingSessions', uid]` | Active sessions |
| `['cookingHistory', uid]` | Cooking history (statistics) |
| `['familyProfile', uid]` | Family profile (staleTime 5min) |
| `['shoppingList', uid, weekStartDate]` | Shopping list (derived from MealPlan) |
| `['adHocShopping', uid]` | "Voglio preparare questo" groups (global, on `users/{uid}`, not per week) |
| `['pantryItems', uid]` | Pantry items (`pantryQueryKey`); also read by the shopping list and cooking mode for matching |

Stale time: 2min global, 5min for familyProfile.

**Guard for one-time init** (avoids re-running on cache revalidation):
```ts
const sessionInitialized = useRef(false);
useEffect(() => {
  if (!recipe || sessionInitialized.current) return;
  sessionInitialized.current = true;
}, [recipe]);
```

---

## 4. Cooking Mode

**Setup Screen Pattern**: don't create sessions in `useEffect`.
```ts
useEffect(() => { setIsSetupMode(!await getCookingSession(recipeId, userId)); }, []);
const handleStart = () => createCookingSession(recipeId, userId, servings); // only from a click
```

**Completion Pattern**: don't auto-delete the session at 100%. Show `Termina cottura` explicitly → only then: create `cooking_history` + delete `cooking_session`.

**Pantry deduction at completion**: with pantry matches, `Termina cottura` first opens `PantryDeductionDialog`; `finalizeCooking` keeps a retry-safe write order (pantry → `pantryDeducted` → history with `entryId` = session id → session delete). The abandon path never deducts nor writes history. Details: [doc/guide/pantry-matching.md](doc/guide/pantry-matching.md#end-of-cooking-deduction).

**Multiple timers in parallel:**
```ts
const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
const [secondsMap, setSecondsMap] = useState<Record<string, number>>({});
// Mandatory cleanup:
useEffect(() => () => { intervalsRef.current.forEach(clearInterval); }, []);
```

**Section Auto-Close**: initialize `prevCheckedRef` with the current value, not with `[]`, otherwise sections already complete at mount close on load. Animate the collapse with `grid-template-rows` (not `max-height`) — the div must always be in the DOM so that the animation and the global step counter stay correct:
```tsx
<div className={cn(
  'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
  isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
)}>
  <div className="overflow-hidden">{/* content always rendered */}</div>
</div>
```

---

## 5. Recipe Data Structure

```ts
interface Ingredient { id; name; quantity; section?: string | null; }
interface Step { id; order; description; section?: string | null; sectionOrder?: number | null; duration?: number | null; }
```

**Step Duration**: `duration?: number | null` — `null` = no timer. Form: `max={9999}`. `extractStepDuration()` exported from `recipe-parser.ts` (used both by the parser and by auto-detect).

**Orphan ingredients (extraction/formatting)**: `EXTRACTION_PROMPT` and `FORMAT_RECIPE_PROMPT` include the "COERENZA INGREDIENTI ↔ PROCEDIMENTO" rule, which makes the AI **omit** ingredients never used/mentioned in any step (typos in the source, e.g. candied orange in sfogliatelle). **Conservative fail-safe** rule: it removes NOTHING if the procedure is terse/generic ("aggiungere i restanti ingredienti", "unire il tutto", etc.). Keep it in **both** prompts (mirror convention). `chat-recipe` doesn't have the rule (it generates new recipes, it doesn't extract).

**AI Duration Token**: in every AI prompt, in the PROCEDIMENTO section:
```
Se uno step ha UN SOLO tempo chiaramente identificabile, aggiungi [DUR:N] alla fine (N = minuti interi).
NON aggiungere se il tempo è un range, ambiguo, o lo step ha più tempi.
```
Consistent with `[ING:n]` and `[QTY:n]`.

**Dynamic Step Quantities**: stored as `{{qty:ingredientId}}`, resolved at runtime. The AI emits `[ING:n]`/`[QTY:n]`, converted in the parser. Legacy recipes: use the auto-adapt button in edit mode, high-confidence matches only.

**`renderStepDescription` — name fallback**: if the ingredient name keywords aren't in the surrounding text, it automatically appends `"di {simplifiedName}"`. If you change `getIngredientKeywords`, it affects both rendering and `adaptStepsToDynamicQuantities`.

**Step Ordering**: global reordering (not per section); always renormalize `order` to `1..n`.

**Section order across the two columns**: steps are the authority. `orderedSectionNamesFromSteps(recipe.steps)` must be passed as `orderedSections` to `IngredientListCollapsible` wherever a recipe's ingredients and steps are shown together (`recipe-detail.tsx`, `ricette/[id]/cooking/page.tsx`) — see the gotcha in Quick Reference.

**Sections**: headers accept **any** name (`## Ingredienti La pasta`, `## Procedimento per il ragù`), a bare `## Ingredienti` → section `null`; patterns in `SECTION_HEADER_PATTERNS` (`recipe-parser.ts`). Rendering sorts by **first appearance**, never alphabetically (see Quick Reference). `POST /api/reorganize-recipe` proposes sections for an existing flat recipe by returning **only** `id → section` assignments: no text and no id is rewritten, so active cooking sessions (checked by id) and `{{qty:ingredientId}}` tokens stay valid by construction. The proposal is applied with `applySectionAssignments()` (`lib/utils/section-assignments.ts`), which writes explicit `null` on unassigned items. The single `"Ingredienti"` section is an artifact of the form round-trip (`recipe-form.tsx` renames `null` → `'Ingredienti'` on load and persists it on save): `hasNamedSections()` counts it as "no sections", otherwise the button would disappear precisely from the recipes that need it.

**Recipe Categories (multi)**: `categoryIds?: string[]` replaces the old `categoryId?: string` (now `@deprecated`, kept only as a read fallback). Same migration scheme already used for `season` → `seasons[]`: dual-read + lazy on-edit migration, no batch migration. **Always** read through `getRecipeCategoryIds(recipe)` (`lib/utils/recipe-categories.ts`); never `recipe.categoryId` directly. On save (edit), the legacy `categoryId` is explicitly removed with `categoryId: deleteField()` (imported from `firebase/firestore`) to avoid drift — this requires a cast (`as unknown as Partial<Recipe>`) because `FieldValue` isn't assignable to `string`. **Subcategories have been removed entirely** (type, Firebase helpers, UI, Firestore rule and index): documents already in the `subcategories` collection stay inert and aren't read by any query.

---

## 6. UI Components & Theming

**Color tokens — never use `bg-white`**: `bg-white` is hardcoded `#ffffff` in Tailwind and ignores the `--background` token. Always use:
- `bg-background` for page/layout backgrounds
- `bg-card` for cards and panels
- `bg-muted` for disabled state or passive hover
- `bg-secondary` for secondary backgrounds (sections, filters)

**Native HTML elements**: `<textarea>`, `<select>`, `<input>` do NOT inherit `--background` automatically — the browser uses `white` by default. Always add `bg-background text-foreground placeholder:text-muted-foreground` explicitly. The shadcn `Input` component already does; native elements don't.

**OKLCH color scale**: `bg-primary-100`, `border-primary-200`, `text-primary-700` don't work — Tailwind generates numeric scales only for static colors. With OKLCH CSS vars always use the opacity modifier: `bg-primary/10`, `border-primary/20`, `text-primary`. It works only because every theme color carries `<alpha-value>` (see "Theme color without `<alpha-value>`" in Quick Reference).

**Side-stripe ban**: `border-l-2` or thicker with a color on card/list item is banned by the impeccable guidelines regardless of semantic intent. Replace with a corner badge `absolute top-1.5 left-1.5` (icon + tint) that carries the same information without the AI-slop visual pattern.

**OKLCH palette**: CSS tokens contain only the parameters (`--background: 97% 0.01 75`), the `oklch()` wrapper is in `tailwind.config.js`. This is the same pattern as the old `hsl()`. All modern browsers support `oklch()`.

**Dark mode (light / dark / system)**: handled by `next-themes` (`darkMode: 'class'`, `.dark` class on `<html>`, persistence + pre-paint anti-flash included). The `.dark` block in `globals.css` rewrites the **same tokens** (OKLCH components only, see gotcha) — components using `bg-background`/`text-foreground`/`bg-card`/`border-border` etc. adapt on their own. DO NOT add scattered `bg-white dark:bg-black`: use the tokens. Decorative surfaces with hardcoded light literals need explicit `.dark`/`dark:` overrides. `ThemePicker` (`components/ui/theme-picker.tsx`) is mounted in `Sidebar` and `MoreSheet`; the root layout must have `suppressHydrationWarning`.

**Delight shared states**: for loading, empty states and cross-app feedback use the shared wrappers:
- `EditorialLoader` for significant waits (auth bootstrap, dashboard load, AI generation)
- `EditorialEmptyState` for first use / no results
- `StatusBanner` for inline info/success/warning/error
- `ConfirmDialog` for every destructive confirmation (delete plan/recipe/session) — controlled, reuses Radix `Dialog`; never `window.confirm`/`window.alert`
This avoids duplicated classes, hardcoded blues/greens/reds and drift between pages.

**Hot toast styling**: if a page uses `react-hot-toast`, the look is defined in `src/components/providers.tsx`; pages only change the message content.

**Sheet Accessibility**: Radix requires `<SheetDescription className="sr-only">`, otherwise an a11y warning shows in the console.

**Category Colors**: use the preset palette `CATEGORY_COLOR_PRESETS` (`color-palette-picker.tsx`), not `input[type=color]` — a more stable UX on mobile. The palette is made of on-brand earthy tones (terracotta, ochre, olive, sage, cocoa); no neon blue/violet/teal. Existing categories keep their saved color even if it's no longer among the presets (no migration).

**Layout max-width per page type**:
- Card-grid pages (recipes, categories, cooking sessions): **no max-w** — the grid already handles responsiveness
- Narrow text-content pages (statistics, profile, shopping list): `max-w-Xrem mx-auto` for readability
- Mixed/centered pages (planner): `max-w-[1200px] mx-auto`; form sub-panels use `max-w-lg mx-auto`

**Editorial cinema shell**: the shared `shell-stage` and `shell-panel` wrappers live in `globals.css` and come with built-in pseudo-elements, gradients and shadows. Use them on key shells and panels, don't nest them deeply without reason; the parent hosting the stage must stay `relative`/`isolation:isolate` and motion must always have a `motion-reduce` fallback.

**Step editor mobile**: the step number badge must stay light and integrated into the card. Avoid absolute badges that stick out of the border or rigid toolbars on the same axis as the textarea: on phones they reduce the width too much and make the steps look shifted to the right.

---

## 7. API Routes

**AI Route Authentication:**
```ts
const idToken = await auth.currentUser?.getIdToken(true);
fetch('/api/...', { headers: { Authorization: `Bearer ${idToken}` } });
```
- `NEXT_PUBLIC_FIREBASE_*` are enough for the client, NOT for server-side verification
- Locally: `FIREBASE_ADMIN_PROJECT_ID` + `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`
- On Vercel: prefer `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- Firebase Admin JSON uses snake_case (`project_id`, `client_email`, `private_key`)

**File Limit**: AI upload max 4.4MB (Vercel limit). Validate client-side.

**Family Context Scope**: `Chat AI` ✓ · `Testo libero` ✓ · `Carica PDF` ✗ (pure extraction) · `Pianificatore` ✗ (now local, no AI).

**Prescriptive Sections Scope**: `Chat AI` ✓ · `Testo libero` ✓ · `Carica PDF` ✗ · `Pianificatore` ✗. The rule "if the dish has logically distinct components you MUST create sections" lives in `CHAT_SYSTEM_PROMPT` and in `FORMAT_RECIPE_PROMPT` §4 (mirror convention: changing one means changing the other) and is **deliberately absent** from `EXTRACTION_PROMPT`. Same doctrine as the family context: extraction promises fidelity to the source, so inventing a structure the PDF doesn't have would silently return a recipe different from the one uploaded. `EXTRACTION_PROMPT` §3 only **preserves** section names already present (`"La pasta"`, `"Il ragù"`) — and that's exactly the rule the parser regex bug was betraying (see Quick Reference). Don't "fix" the asymmetry: there's a scope note at the top of the route file that says so.

**Web Search & Vision Scope**: `Chat AI` ✓ (opt-in per message) · `Testo libero` ✗ · `Carica PDF` ✗ · `Pianificatore` ✗. Same doctrine as the family context, one notch stricter: `extract-recipes` and `format-recipe` promise fidelity to the source ("riporta le quantità esattamente come nel documento"), so a second source of truth would produce a silent and unfalsifiable substitution — the output is still a valid recipe, just no longer yours. The provenance of a chat recipe stays `{ type: 'manual', name: 'Generata con Chat AI' }`: `source.type` is a closed union and `source.url` is singular, while a chat can synthesize from 0, 1 or 4 pages — and `'url'` means *imported from*, not *generated*.

**Model**: `claude-sonnet-5` on the AI endpoints (`chat-recipe`, `extract-recipes`, `format-recipe`, `suggest-category`, `estimate-calories`, `reorganize-recipe`). The string is centralized in the `AI_MODEL` constant (`src/lib/utils/constants.ts`): to change model edit **only there** (+ tech stack in README/CLAUDE.md/AGENTS.md). Thinking config per endpoint: `extract-recipes` and `format-recipe` use `thinking: { type: 'adaptive' }` + `output_config: { effort: 'low' }` (light reasoning for ingredient↔procedure consistency, cost/latency close to no-thinking); `suggest-category` uses `thinking: { type: 'disabled' }` (trivial JSON classification, needs minimal latency); `estimate-calories` and `reorganize-recipe` use `adaptive` + `effort: 'low'` (arithmetic over several ingredients / grouping with a bit of sequencing, not hard problems); `chat-recipe` leaves adaptive default. `suggest-category`, `estimate-calories` and `reorganize-recipe` use `output_config.format` with `json_schema` (`additionalProperties: false` + `required`) instead of stripping backticks by hand. `output_config.effort` requires `@anthropic-ai/sdk >= ~0.100` (the repo has `^0.110.0`). No `temperature`/`top_p`/`top_k`/prefill (they would break with a 400 on Sonnet 5).

---

## 8. Deployment

- Docker Compose: always `--env-file .env.local` (it doesn't read `.env.local` automatically)
- Reliable build in sandbox: `npx next build --webpack` (avoids Turbopack issues)
- If `npx next build --webpack` fails with `spawn EPERM` in the sandbox, rerun outside the sandbox before investigating the code
- After `npm audit fix`: align `package.json` if the lockfile updates an already-validated direct dependency
- To show the test credentials panel in the login locally: `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true` and restart the dev server

---

## 9. Meal Planner Patterns

**Meal types and canonical order**: `MealType` includes `colazione`/`spuntino`/`pranzo`/`merenda`/`cena` (in this order, `SELECTABLE_MEAL_TYPES` in `lib/constants/meal-types.ts`) plus the legacy types `primo`/`secondo`/`contorno`/`dolce` (not selectable, only for rendering historical plans). `sortMealTypes(types)` sorts a `MealType` array by index in `SELECTABLE_MEAL_TYPES` (legacy at the end, stable sort) and must be applied **both on write** (`addMealType`/`copyPlanToWeek` in `useMealPlanner.ts`, `toggleMealType` in `MealPlanSetupForm.tsx`) **and on read** (`WeeklyCalendarGrid.tsx`, `PlanStructureCard.tsx`, `MealPlanSetupForm.tsx`) — see the unordered `activeMealTypes` gotcha in Quick Reference.

**Family model (people + variants)**: a slot's identity stays `(dayIndex, mealType)`; `MealSlot` carries `servingsPlanned?: number | null` (TOTAL people, variants included) and `variants?: MealSlotVariant[] | null` (existing cookbook recipes only, `memberIds` → `FamilyMember.id`). The base meal feeds `servingsPlanned − Σ variants[].memberIds.length`, clamped to 0. **`servingsPlanned == null` = legacy slot = no scaling, quantities as-is** (see Quick Reference). The slot rules are pure functions in `lib/utils/meal-plan-slots.ts` (`withBaseRecipe` keeps people+variants on a dish swap or ↺ re-roll and keeps a legacy slot legacy; `withSlotVariants` sets the default people in the same write; `buildPlanCopy`); `useMealPlanner` only orchestrates state → write → `invalidateShoppingList()`. Members and the default people come from `lib/utils/planner-members.ts` (`resolvePlannerMembers` reuses `normalizeFamilyProfile` + the shared `resolveFamilyMemberLabel`, so "Componente N" means the same person in the planner and in the AI context; default = the plan's persisted `MealPlan.defaultServingsPlanned` — the people chosen at setup, the one setup value that outlives it, carried by copy-plan — else family size, else 2). A variant member no longer in the profile is an **orphan**: still counted by scaling, absent from the per-member kcal, rendered "Componente rimosso" — never auto-cleaned (an implicit write would change the shopping list).

**Shopping list scaling**: `buildContributions` scales each contribution with `scaleQuantity(qty, recipe.servings || 4, people)`; variants contribute their own recipe for `memberIds.length` people under their own `recipeTitle`. The batch fetch must include variant recipes — use `collectPlanRecipeIds(plan)`, a variant left out is skipped as "deleted". Item ids don't depend on quantities, so check marks survive scaling. The ad-hoc "Voglio preparare questo" list is NOT scaled.

**Per-person nutrition**: `computeDayNutrition(plan, day, recipesById, members)` totals ONE person on the base path (same number as before the family model — `servingsPlanned` never enters kcal) and returns `memberDeltas` only for members who eat a variant that day, kcal and macros each with their own `≥` completeness. Desktop shows them in the badge `title`, mobile portrait in an expandable row (touch has no hover).

**Slot editor**: `MealSlotEditorSheet` (views `main` / `pick-base` / `variant-members` / `variant-recipe`) replaces the old one-tap `RecipePickerSheet` and stays open between commits; `RecipePickerPanel` is the reusable search+filters+list. The people stepper is debounced 600 ms and flushed on close, on unmount and before any other commit from the sheet. It is a bottom sheet below `lg` and a centered modal from `lg` (same pattern as `PantryAddSheet`).

**No AI / local shuffle**: the planner no longer calls Claude and `/api/plan-meals` no longer exists. Generation is local and free via `buildShuffledSlots()` in `meal-plan-shuffle.ts`. `family-context` is still used ONLY by chat/free text/extract, not by the planner.

**`buildShuffledSlots(recipes, config)`** (pure, tested): assigns existing recipes to each `(dayIndex, mealType)` respecting:
- season (`matchesSeason`: includes the season, `tutte_stagioni`, or a recipe without a season); falls back to the full pool if < 5 seasonal recipes for that meal type
- `mealTypeConfigs[mealType]`: `excludedCategoryIds` always removed; `preferredCategoryId` = **hard** filter (only that category) if it yields at least one recipe
- no repeats within the week as long as the pool allows; meal types without a pool stay empty slots and are reported in `unfilledMealTypes` (the UI shows a warning)
- `config.defaultServingsPlanned` becomes `servingsPlanned` on every generated slot (`variants: null`); omitted → legacy `null` slots, so callers must pass it

**`pickReshuffledRecipe(...)`**: local re-roll of a single slot — picks a different recipe from the **same category**, in season, not already used in the week; then relaxes season and finally category. Replaces the old AI regeneration; the ↺ button on the slot calls this.

**`MealTypeConfig`** (`preferredCategoryId` + `excludedCategoryIds`): "Categorie per portata" lives in the setup's **"Stagione e regole" disclosure, collapsed by default** with a live summary (`Autunno · 2 regole`), only if `categories.length > 0`. They are generation rules, never persisted on the plan. A category can't be both preferred and excluded (`setMealPreferred` removes it from excluded).

**Copy plan**: `copyPlanToWeek(targetWeek)` reuses `createMealPlan`; it **blocks** (throws) if the target week already has a plan. It copies only `slots` (verbatim: people and variants travel, a legacy slot stays legacy)/`activeMealTypes`/`season`/`activeDays` via `buildPlanCopy()`, NOT the shopping list state. The chosen date must be normalized to Monday (`getWeekMonday`).

**Backward-compat**: legacy AI plans with `newRecipe` slots (inline ParsedRecipe) stay viewable and savable into the recipe book; the shuffle never generates `newRecipe`. The `generatedByAI` flag stays in the type for compat (new plans always `false`).

**Shopping List — Derived View**: list derived from the `MealPlan`, no separate Firestore collection.
- `existingRecipeId` slot → `getRecipesByIds()` (batched, deduplicated); `newRecipe` slot → inline ingredients, zero extra reads
- Check mark state and custom items → `shoppingCheckedIds` + `shoppingCustomItems` fields on the `meal_plans` document (Firestore, cross-device). localStorage fallback only if no plan exists for that week. Writes debounced 500ms (see the *flush* gotcha in Quick Reference)
- On every local change, the state is also mirrored into the React Query cache of the plan query (`queryClient.setQueryData`), not just written to Firestore — otherwise a page remount within the 2 minutes of `staleTime` re-reads the first fetch's snapshot and "resets" the check marks made in the meantime (see gotcha in Quick Reference)
- Aggregation (`ingredient-aggregator.ts`): accent-insensitive canonical key + conservative Italian singular/plural (`canonicalIngredientKey`); quantities summed per convertible dimension (mass→g, volume→ml) and reformatted (g↔kg, ml↔l), `" + "` fallback for non-convertible or mixed units. Ambiguous or multi-word names stay separate (non-merge = safe choice)

**Ad-hoc Shopping List ("Voglio preparare questo")**: a mechanism separate from the plan-derived view above — a button on the recipe detail (`recipe-detail.tsx`) adds only that recipe's ingredients to an ad-hoc group, saved globally on `users/{uid}.adHocShoppingRecipes` (`lib/firebase/shopping-adhoc.ts`, same pattern as `familyProfile` — no new collection/rule/index), **not** tied to `weekStartDate`.
- **Dedup on `recipeId`**: re-adding the same recipe **replaces** the existing group (ingredient refresh), it doesn't add to it or duplicate it — intentional behavior, not a bug
- **Global checked state**: lives in `AdHocShoppingItem.checked`, cross-week; never reuse the plan's `shoppingCheckedIds` (which is per week) for ad-hoc items
- `useShoppingList` reads the `['adHocShopping', uid]` query and persists with a **second debounce timer/ref independent** of the plan's (see the "New persistence target forgotten in the flush" gotcha in Quick Reference)
- **No cross-block merge**: the same ingredient in ad-hoc and in the plan stays in separate sections, by explicit choice
- `ShoppingItemRow` takes explicit props (`name`/`quantity`/`checked`/`footnote`/`onToggle`/`onRemove`, plus the pantry ones `pantryBadge`/`secondaryAction`/`suggestion` built by `buildPantryRowProps()`) instead of a whole `ShoppingItem`, so it serves both the plan/custom rows (`ShoppingSection`) and the ad-hoc ones (`AdHocRecipeGroup`) without branching on `isCustom`

**Shopping list ↔ pantry**: the list classifies plan and ad-hoc items against the pantry (trivial items never listed, "Hai già in casa", stock badges, alias suggestions, "Aggiungi alla dispensa"). Everything domain-specific lives in [doc/guide/pantry-matching.md](doc/guide/pantry-matching.md); the repo-wide gotchas it produced are in Quick Reference ("New FIELD on an existing persistence target", "`undefined` inside an element of a persisted array", "Array field rewritten from a cached copy", "Two updates on one doc in a `writeBatch`").

**Shopping list "Per reparto" view**: a `ShoppingViewToggle` ("Per reparto" default, per-device `localStorage`, not Firestore — a pure presentation preference) switches between `DepartmentSection`s and the original per-recipe `ShoppingSection`s. Both views render from the SAME filtered `items`/ad-hoc arrays (pantry-owned items excluded upstream) so item ids and check marks never diverge between them. Classification chain and the "Sposta in reparto" override: [doc/guide/pantry-matching.md](doc/guide/pantry-matching.md#department-classification-classifyingredientdepartment).
