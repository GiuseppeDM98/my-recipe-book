# Session workflow

Portable collaboration rules (the same in every repo/machine). They do not duplicate
the project's technical conventions, which live in [CLAUDE.md](CLAUDE.md) and
[AGENTS.md](AGENTS.md).

---

## Session and collaboration rules

1. **Never commit without explicit approval.** Do not run `git commit` (nor
   `--amend`) until the OK for that specific commit arrives. Finish the work,
   summarize the diff, then ask. Creating the branch and editing files needs no
   approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new
   branch from the branch that was active at the start of the session (always check
   which one it is; don't assume master/main).

3. **One commit per session.** All of a session's changes are squashed into a single
   commit, not spread across several.

4. **Always reply in Italian** when working on this repo (this applies to the
   conversational channel — code, identifiers, comments and documentation stay in
   English).

5. **Track the work in `SESSION_NOTES.md`** (a working file, deleted at the end of
   the session). Before asking for the commit OK, close it with a summary: one entry
   for each thing learned or decided, in this format:
   - **What**: what was implemented
   - **Why**: the motivation behind the decision
   - **Note**: gotchas or important details, with the date if it is a measurement
   - **Where it goes at session end**: `AGENTS.md` if it applies to the whole repo ·
     `doc/guide/<topic>.md` if it is a domain lesson · `WORKFLOW.md` if it is a session
     rule · `CLAUDE.md` if it is project state · a comment at the right spot in the
     code if it is the why of a line

   The last field is not decorative: `SESSION_NOTES.md` dies with the session, so
   every entry must **already have been written** to its destination before closing.

---

## Guided testing rule

When we need to manually verify that a freshly implemented feature works, don't
hand over a checklist and disappear. The guided test (*collaudo*) is done together,
in chat, one phase at a time. Five obligations:

1. **You prepare the test data** — a throwaway script (not tracked by git, deleted at
   the end of the guided test) using "spy words" (made-up words such as fenicottero,
   ornitorinco, that appear nowhere else in the archive), not entered by hand by the
   user.
2. **One phase per message** — give the phase, wait for the report, then the next
   one. Never deliver all phases at once: it breaks the prerequisites.
3. **Declare the expected outcome before running, not after** — otherwise the
   reading always adapts to whatever happened.
4. **Do every check you can automate yourself**, and leave only what can't be done.
   "Together, in chat" does not mean "one click at a time dictated to the user": if
   sessions are JWT or otherwise scriptable, write a throwaway script that opens a
   real browser (e.g. Playwright) with an authenticated session — your own if the
   role allows it, otherwise a throwaway test identity created for the occasion —
   and verify every outcome against the database or the HTTP response, never against
   the page's appearance alone. Report results phase by phase, with the expected
   outcome declared first. Every automated end-to-end test you are able to run must
   be run: never declare a feature verified if an automated check that could have
   covered it was left unexecuted. Leave to the user only what is genuinely not
   automatable: visual/aesthetic judgment, physical hardware (e.g. a real barcode
   scanner), or an interactive login that can't be driven by a script (e.g. a real
   OAuth flow with MFA).
5. **Before tearing down, let the user look.** When the session touched something
   visible, ask for the OK and then take the user to the dev server with the test
   data still live: exact URLs, which identity, and at most five things to look at —
   for each, what should happen and what would be the bug. Only what a probe can't
   tell: layout, whether the screen says what it should, the wording, whether an
   action gives feedback that it happened. Also state what that tour does NOT cover,
   and never ask the user to redo by hand what has already been verified. Whatever
   the user finds becomes an assertion before the session ends, or it will come
   back: the tour exists to discover what nobody thought to assert, not to replace
   the tests.

Standard phases to follow when it makes sense: A-Invariance (what was there before
still works) → B-Context switch (the new role/state is really active) → C-New
behavior (does what it should, not what it shouldn't — obligation 4 matters most
here: automate) → D-Below the UI (the same rules hold when calling the route by
hand) → E-Negative cases (whoever lacks rights is rejected, with the right error) →
F-Guided tour (the only phase the user does: look with their own eyes, with the
fixtures still live) → G-Teardown (configuration restored, fixtures removed, script
deleted).

A negative test alone does not prove a security guard: you always need the pair
own-resource (positive control, must succeed) / someone-else's-resource (the test,
must fail), with the exact same file/data. Closing the guided test: restore any
modified config, remove fixtures and test attachments, delete the script, and record
the outcome somewhere that outlives the session (CLAUDE.md or equivalent) — a guided
test that isn't recorded counts as not done.

---

## How it applies in this repo

The repo already has all the guided-testing tooling configured (see the "Guided
testing tooling" section in [CLAUDE.md](CLAUDE.md)); below are only the concrete
commands and paths.

**Verified commands** (`package.json`):
- `npm run test` → Jest (unit/integration)
- `npm run lint` → ESLint
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

**Test identities**: no reusable helper exists yet (by choice, see below) — the
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
- **Spy words still apply**: assertions never target content from the real archive
  (it changes over time, and writing it into scripts or records would make it
  public). The script adds its own spy-word fixtures on top of the mirror and asserts
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

**Where scripts go**: `e2e/scratch/` — gitignored (`.gitignore` lines 64-65), only
`.gitkeep` survives. Each guided test writes its own script there and deletes it at
the end, per the protocol. Reusable helpers, if they ever emerge from repeated guided
tests, get promoted to tracked `e2e/` — but until that happens, this is the repo's
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

**Where a guided test's outcome is recorded**: the "Guided testing tooling" section
of CLAUDE.md, list "Guided tests run with this tooling" — add one line for each
closed guided test, as already provided there.
