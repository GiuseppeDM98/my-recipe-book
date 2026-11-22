# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on each machine and in a cloud
> session. A tracked file travels with the clone and is reviewed in a diff. If you are an agent
> with persistent memory, save one pointer to this file, not the rules. If
> the owner states a new rule, it is added *here*, in that session's commit: to section 3 if it holds
> for this repo only; if it holds for every repo, ask the owner, because it enters the standard
> first (`claude-config/prompts/WORKFLOW_STANDARD.md`) and reaches the repos from there.
>
> Sections 1-2 are the portable standard, identical across every repo that adopts it. Section 3 is
> the only project-specific part: it says what "automate it yourself" and "show me the app"
> concretely mean *here*.

---

## 1. Session and collaboration rules

1. **Never commit without explicit approval.** Do not run `git commit` (nor `--amend`) until the
   owner gives the OK for that specific commit. Finish the work, summarise the diff, then ask.
   Branches and edits need no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Check which one that is; never assume `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit, never
   scattered across several.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English. **Every tracked document is written in
   the repo's documentation language** (2026-11-01): English in the open repos, Italian where the
   repo's documentation is Italian (its WORKFLOW.md says which). In an English-language repo, Italian
   is reserved for the UI text a document quotes, page and feature names (the labels the product
   shows) and the owner's own words, quoted as such (the launch prompt at the end of a spec, pasted
   text). A guide still in the
   other language is rewritten when a session rewrites it anyway, never in a session of its own.

5. **Questions and proposals are asked interactively** (2026-09-11). When a decision is the owner's —
   which layers to build, on which surfaces, a wording — put it through the agent's interactive
   question tool, in groups of four, one topic at a time, multi-select where the options are not exclusive and the
   recommended option first; never a numbered list of questions in prose. The owner refines the wording in the free-text answer.

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. If § 3 provides a copy of real data for the
   guided tour, it serves the tour only and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15; code comments
   too since 2026-11-15): a draft, comment, critique, screenshot, fixture or example sentence takes
   invented figures and generic names, never an amount, holding, account, start date or family
   detail from the real data — «seen live» and the lesson, not the figure. In a public
   repo this has no exception. A private repo may waive it, or narrow it, only by saying so in § 3
   with the owner's decision and its date; public data that is not the owner's (a listed company's
   published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

8. **Dependencies: compare at session start, upgrade in a session of their own** (2026-10-26). If
   the repo has a lockfile, the first thing a session does is install from it with every server
   stopped (`npm ci`, `pnpm install --frozen-lockfile`; 2026-11-17: the audit reads the lock, not
   what is installed), then run the package manager's audit (`npm audit --json`, `pnpm audit --json`, …) and compare it with `doc/guide/dipendenze.md`,
   which records the date of the last audit, the framework version and every open advisory with
   the owner's decision (accepted because dev-only, waiting for version X, to upgrade). The answer
   is one line: «dipendenze: invariate dal <data>» or «N avvisi nuovi: …». A new advisory is
   written into the guide with its decision, asked through rule 5; nothing is upgraded in that
   session. An upgrade is a session on its own branch with its own verification; never
   `audit fix --force` or the command an advisory suggests: the version is chosen and installed by
   hand, preferring a release at least a few days old. If the guide is
   missing, the session that notices it creates it (`TEMPLATES.md`). A repo without a lockfile skips this rule.

9. **`SESSION_NOTES.md` is the session's temporary container** (2026-10-26). A working file in the
   repo root, created at the start of the session and never committed. Before the closing prompt it
   ends with one block per thing learned: *Cosa* (what was done), *Perché* (the decision behind
   it), *Nota* (traps and measurements, dated), *Dove va a fine sessione* (`AGENTS.md`
   if it holds for the whole repo · `doc/guide/<tema>.md` if a domain lesson · `WORKFLOW.md` if a
   session rule · `CLAUDE.md` if project state · a comment at the right line if it is the why of one
   line). The closing prompt writes every entry into its destination and deletes the file before
   the single commit; a note that names no destination is lost. A `SESSION_NOTES.md` still on the
   remote means a session was not closed.

10. **The commit's «Model: … · effort …» line is read from the spec, never asked** (2026-11-18). A
    session that implements a spec writes the model and the effort the spec names (its prompt, or its
    row in the series index); the session that retires it writes the SAME pair as the implementation
    (its commit's line, `git log`). The owner is asked only when no spec is behind the session or it ran at another model or effort.

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Five obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Never entered by hand.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   "Together, in chat" does not mean "one dictated click at a time". If the sessions are scriptable (e.g. JWT), write a throwaway script that opens a **real browser** (e.g. Playwright)
   with an authenticated session — your own if the role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome **against the database or the HTTP
   response, never against the look of the page alone**. Report phase by phase, expected outcome first.
   **Any automated end-to-end test that you are able to run, you run.** Never declare a feature
   verified with an automated check left unrun. What is left to the
   owner is only what is genuinely not automatable: visual and aesthetic judgement, physical
   hardware (a real barcode scanner), or an interactive login that cannot be driven by a script (a
   real OAuth flow with MFA).
   **The whole suite is launched last, when no file of the repo is left to change** (2026-11-22). A
   run builds and fingerprints the tree it starts from: a file edited while it runs (a document, a
   note, `CLAUDE.md`) makes the server refuse the build as stale and the run dies at start-up, or
   measures a tree that no longer exists. So finish every edit first — code, documents, release
   notes, the deletion of `SESSION_NOTES.md` —, start the suite, touch nothing in that repo until it
   reports, and if a file changes after it, run it again. A file in another repo, or in the
   scratchpad, may change meanwhile.

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each one, what must happen and
   what would be the bug. **The tour starts at the owner's go** (2026-10-05): finish everything that needs no eyes, say it is ready, and wait. **A tour the spec
   plans is always done, and before the commit** (2026-11-14): never offered as optional, never
   traded for green tests, and never begun without the owner's go; the diff summary and the request
   for the commit's OK (rule 1) follow the tour, never precede it (2026-11-21). The assistant opens
   the windows itself (2026-11-21): a before/after comparison as its two windows side by side, an
   action as the page already on it, so the owner only looks and acts. Where obligation 4
   allows it, **open the page for the owner, already authenticated**: one item per message, one page
   at a time, waiting for the outcome; two pages together only for a comparison (the same URL under
   two identities), saying which window is which.
   Five windows at once turn the tour into working out which belongs to which item. Only what a probe cannot say: layout, whether the screen says what it must
   say, the words, whether an action gives feedback that it happened. State also **what that tour
   does not cover**, and never ask the owner to redo by hand something already verified. Whatever
   the tour finds becomes an assertion before the session ends, or it comes back: the tour
   discovers what nobody thought to assert, it does not replace the tests.

**A before/after comparison of screenshots is shown cropped, one item at a time** (2026-10-30, after
twenty near-identical PNGs left the owner unable to tell what to compare): never a folder of files to
open. The agent opens a browser window on an HTML page with BEFORE and AFTER **cropped to the area that
changes** (one above the other; side by side for phone screenshots), **enlarged** when the difference
is a few pixels, with a title saying where to look, and checks the crop with a headless screenshot
first. The message says «Comparison N of M», what changes and which side is which; the window rules of
obligation 5 apply.

**A window ends by itself, and is closed by its tree** (2026-11-09). The script that opens a visible
browser exits when the owner closes the **page** (closing a driven window closes the page, not the
browser, so `browser.on("disconnected")` alone never fires), when the browser goes, or after a time
limit; never an endless wait. The repo writes that wait **once**, in a helper the throwaway scripts
import. Stopping the background task kills the shell, not the tree beneath it
(`npx → tsx → node → Chromium`): a window is closed by its root with the whole tree, then the count
says zero.
**Once the owner confirms an item, the agent closes its windows** (2026-11-13; the comparison page
too, 2026-11-21: it opens in a driven window, never in the owner's default browser, where only the
owner could close it): the owner never closes a window to move on. The agent stops the helper by its
root (it closes its browser on SIGTERM), checks the count at zero and only then opens the next item.

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not — obligation 4 matters most here: automate |
| **D** | Sotto la UI | The same rules hold when the route is called directly |
| **E** | Casi negativi | Someone without rights is refused, with the right error |
| **F** | Giro guidato | The only phase the owner executes: they look with their own eyes, fixtures still alive |
| **G** | Ripristino | Configuration restored, fixtures removed, script deleted |

### A negative test alone never proves a security guard

It always takes the pair: **own resource** (positive control — must succeed) and **someone else's
resource** (the test — must fail), with the same identical file or record.

### Closing a verification

Restore any configuration that was changed, remove fixtures and test attachments, delete the script,
and **record the outcome somewhere that survives the session** (`CLAUDE.md` or equivalent).

**No collaudo script outlives its session** (2026-11-09; the services too, 2026-11-13). `node ~/.claude/processi-collaudo.mjs` counts the
trees of `scripts/collaudo-*` alive in the repo and the services a session starts and forgets (the Firebase
emulators with their JVM, the Next.js `dev`/`start` servers), and says whose they are: this session's (closed with
`--chiudi`), another open session's (never touched), or nobody's known (named to the owner, closed with
`--chiudi --anche-ignote` only on their yes). The count is the **first gate** of every repo's gate list: zero, or none starts. The standard `settings.json` runs it with `--hook` at `SessionEnd`
(a service gets SIGTERM first: the emulators export on exit); a session that dies without ending is
caught by the next gate and by the same count at the start of every session (`prompts/01_SESSION_START.md`).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is still open and what comes next; it
replaces the previous one. The session's signals — type-check, test counts, E2E runs, flakes,
skipped phases, the guided tour's walk and findings (2026-10-23) — go in the commit message and,
where they teach something, in the area's guide, never in `CLAUDE.md`: it is injected into every
turn, and an entry that collects them grows back into a diary. Of the tour it keeps only the
outcome: done and closed, or what is left open.

---

## 3. What this means in THIS repo

The rules above are the standard. This section is their local translation: the tooling behind
obligations 4 and 5, plus this repo's branches and where things are recorded. It changes from repo
to repo and is the only part to rewrite when the tooling or those conventions change.

The repo already has all the guided-testing tooling configured (see the "Guided
testing tooling" section in [CLAUDE.md](CLAUDE.md)); below are only the concrete
commands and paths.

**Verified commands** (`package.json`):
- `node ~/.claude/processi-collaudo.mjs` → collaudo count, **the first gate**: zero collaudo
  trees and forgotten services (the Firebase emulators, the Next `dev` server), or the gates
  below do not start (§ 2)
- `npm run test` → Jest (unit/integration)
- No lint step: Next 16 removed `next lint` and the repo has no ESLint
  configuration, so `package.json` has no `lint` script (see AGENTS.md) —
  type-check and build below cover it
- `npx tsc --noEmit` → type-check (no dedicated script in `package.json`, but
  `tsconfig.json` is present and `tsc` resolves the project)
- `npx next build --webpack` → verification build (the command recommended by
  CLAUDE.md, more reliable than `npm run build` at catching errors)
- `npm run test:e2e` → Playwright (`playwright.config.ts`, `testDir: ./e2e`)
- There is no CI (`.github/workflows` is absent): the commands above must be run by
  hand before proposing a commit.

**Isolated local environment**: Firebase Emulator Suite, already wired up.
- `npm run emulators` → starts Auth (`:9099`), Firestore (`:8080`), Storage
  (`:9199`), UI on `:4000` (config in `firebase.json`)
- `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` → points the client SDK
  (`src/lib/firebase/config.ts`, `src/lib/firebase/storage.ts`) at the emulators
  instead of production
- The Admin SDK (`src/lib/firebase/admin.ts`) attaches to the emulators on its own
  when the standard `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env
  vars are set — no flag to pass, and no real service-account credentials required
  in that case

**Test identities**: no reusable helper for synthetic users exists yet (by choice,
see below; the tracked mirror scripts cover only the real account) — the
guided test's throwaway script creates the user on the fly with the Firebase client
SDK (`createUserWithEmailAndPassword` against the Auth emulator, since the
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR` flag already routes there) or via the Firebase
Admin SDK (`getAuth().createUser(...)`, with `FIREBASE_AUTH_EMULATOR_HOST` set). From
there you get the ID token and/or Playwright's `storageState` for a real, not
simulated, authenticated session.

**Mirroring the real account (realistic data)**: synthetic fixtures prove the logic
does what it should, but they don't contain what only the real archive contains —
volume, legacy recipes with only `categoryId`, inert `subcategories` documents,
hand-written text, old weekly plans. When the guided test touches pre-existing data
(reads, read-time corrections, sorting, aggregations, UI over long archives), start
from a **copy of the user's personal account inside the emulators**, never from
production.
- **Which account**: the identity is never written in the repo, which is public. It
  lives in `.env.local` (gitignored) as `MIRROR_SOURCE_EMAIL`; if it's missing, ask
  the user for it and have them add it there. Never paste it into tracked scripts,
  commits, CLAUDE.md or guided-test records — the same goes for its uid.
- **Production is read-only**: the phase that reads from production uses the Admin
  credentials in `.env.local` and only does `get`/queries. No `set`/`update`/`delete`,
  no writes to Auth or Storage: a mistake there hits the user's real data, not a
  fixture.
- **Tracked helpers** (promoted from `e2e/scratch/` on 2026-09-17, third guided test
  that wanted the mirror): `node e2e/mirror-dump.mjs` (step 1, read-only, loads
  `.env.local` by itself) and `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node e2e/mirror-load.mjs` (step 2). They
  are tracked ON PURPOSE: reading production is gated by a permission rule on that exact
  command (`Bash(node e2e/mirror-dump.mjs)` in the gitignored
  `.claude/settings.local.json`), and a rule is only as safe as the code behind it — a
  tracked file is reviewed in the diff, a scratch file is not. Keep the dump's SAFETY
  CONTRACT header true, and never put the account, its uid or any document content in
  them: the repo is public. Without that rule the dump is run by the user from the
  prompt (`! node e2e/mirror-dump.mjs`).
- **Two processes, not one**: the Admin SDK routes to the emulator for the whole
  process as soon as `FIRESTORE_EMULATOR_HOST` is set, so the same script can't read
  from production and write to the emulator (and without `gcloud` there is no managed
  Firestore export, which would copy every user anyway).
  1. *Dump* (no emulator env): `getAuth().getUserByEmail()` for the uid, then
     `users/{uid}` and every document with `userId == uid` in the collections of
     `firebase/firestore.rules` (currently `recipes`, `categories`, `techniques`,
     `cooking_sessions`, `cooking_history`, `meal_plans`, `pantry_items` — realign if
     new ones appear), saved as JSON in `e2e/scratch/mirror/`. Serialize `Timestamp`s
     in a reversible form: `JSON.stringify` flattens them into plain objects and
     sorting by `createdAt`/`completedAt` breaks.
  2. *Load* (with `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST`):
     `getAuth().createUser({ uid, email, password })` with **the same uid**, so
     ownership rules and `userId` filters match without rewriting anything, then the
     documents with the same ids and the `Timestamp`s rebuilt.
- **Password**: the real one is not copied and isn't needed. In the emulator the user
  has a throwaway local password chosen by the script, same email: the guided tour
  uses an email/password login even if production sign-in is via Google.
- **Images**: `recipe.images` holds download URLs from the production bucket, which
  the browser loads read-only anyway, so Storage doesn't need copying. Uploads made
  during the guided test land in the Storage emulator.
- **Decoy words still apply**: assertions never target content from the real archive
  (it changes over time, and writing it into scripts or records would make it
  public). The script adds its own decoy-word fixtures on top of the mirror and asserts
  on those; the mirror provides context. Aggregate assertions on real data are fine
  (before/after counts, "no recipe loses its categories").
- **Teardown (phase G)**: `e2e/scratch/mirror/` contains personal data and is deleted
  at the end of the guided test together with the script. The emulators persist
  nothing unless `--export-on-exit` is passed: don't pass it with a mirror loaded. In
  the guided-test record in CLAUDE.md write "mirror of the personal account" plus any
  counts, never recipe names, email or uid.

**Inspecting the real data state**: use the Admin SDK with `FIRESTORE_EMULATOR_HOST`
set (the same pattern as the API routes, which already do it) to read the collections
listed in CLAUDE.md directly (`recipes`, `meal_plans`, `pantry_items`,
`cooking_history`, etc.) — never infer state from the page rendering alone.
Alternatively, the Emulator UI on `localhost:4000` for a quick visual inspection
while debugging (not for automated assertions, which remain the script's job).

**Where scripts go**: `e2e/scratch/` — gitignored (`/e2e/scratch/*` in `.gitignore`), only
`.gitkeep` survives. Each guided test writes its own script there and deletes it at
the end, per the protocol. A helper that proves reusable across guided tests gets
promoted to tracked `e2e/` — so far only `e2e/mirror-dump.mjs` and
`e2e/mirror-load.mjs` (2026-09-17); everything else staying in scratch is the repo's
intentional choice, not a gap.

**Guided tour (obligation 5)**: the app has neither CI nor a preview environment (no
`.github/workflows` folder), so the local dev server is the only way to show the live
UI.
- Start it with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` (Next.js,
  default port `:3000`, overridable with `-p`) while `npm run emulators` runs in
  another terminal — the same pair of commands as the automated guided test, so the
  dev server sees the same data seeded by the script.
- **How to get there already authenticated**: there is no way to "hand over" a
  ready-made session to a human browser (no storageState shareable outside
  Playwright, no magic link). The seed script creates the test user with a known
  email/password (via the Firebase client SDK `createUserWithEmailAndPassword`
  against the Auth emulator, or Admin SDK `getAuth().createUser(...)`); the guided
  tour therefore consists of giving the URL `http://localhost:3000/login` and those
  exact credentials, so the user does a real login (two clicks) and lands on the
  seeded data.
- **Roles**: the app has no per-role views (no `role`/`isAdmin` field in the data
  model) — every authenticated user sees the same UI, isolated by `userId`. So there
  is no "view the user can't open with their own account" to reach with a different
  identity. In the emulators, however, the personal account exists only if the
  guided test mirrored it (see above): in that case the guided tour uses it (same
  email, local password chosen by the script); otherwise the test account created by
  the seed. Any specific data state a guided test needs is always created by the
  script, in the emulator, never on the production account.

**Branches**: `main` is the production/release branch, `develop` is the integration
branch (session branches start from `develop` and merge back into it via PR;
`develop` merges into `main` separately). Verified via `git branch -a` and the
history (`Merge branch '...' into develop`, then `Merge pull request ...` into
`main`).

**Where things are recorded**:
- During the session: `SESSION_NOTES.md` at the root, a working file deleted at the
  end of the session. Before asking for the commit OK, close it with one entry for
  each thing learned or decided: **What** (what was implemented), **Why** (the
  motivation behind the decision), **Note** (gotchas or important details, with the
  date if it is a measurement), **Where it goes at session end** (`AGENTS.md` if it
  applies to the whole repo · `doc/guide/<topic>.md` if it is a domain lesson ·
  `WORKFLOW.md` if it is a session rule · `CLAUDE.md` if it is project state · a
  comment at the right spot in the code if it is the why of a line). The last field
  is not decorative: every entry must **already have been written** to its
  destination before closing.
- A guided test's outcome: the "Guided testing tooling" section of CLAUDE.md, list
  "Guided tests run with this tooling" — one line for each closed guided test.
- Project state: CLAUDE.md "Recent Changes" keeps only the latest session's entry;
  older ones live in `git log`.
- Repo-wide gotchas: AGENTS.md. A domain lesson goes in `doc/guide/<topic>.md`, and
  AGENTS.md keeps only the listing with the link.
- User-facing release notes: `Draft Release Temp.md` is a draft that **accumulates
  until the tag** — only the user empties it, when publishing the release. Edit it in
  place (never rewrite the file: the diff must only add or rewrite lines); before
  adding an entry, look for one on the same surface and rewrite that one to its final
  state (a feature added and removed before the tag simply disappears); group entries
  by area; English, user-facing, "Added/Fixed/Improved", at most two sentences, no
  file/function names or test figures; 60,000-character ceiling.
