# ROADMAP — Guard-X

> A prioritized menu of upgrades, grounded in the verified codebase
> (`ARCHITECTURE.md`). Nothing here is implemented — Jéo picks, the agent
> builds via `FEATURE_PLAYBOOK.md`. Effort: S (< half day), M (1–2 days),
> L (3+ days). Risk = chance of breaking existing behavior.

> **Correction to the brief:** prospect persistence to Supabase already EXISTS
> (`backend/main.py:111-175`, tables in `supabase_setup.sql`). The Tier 2 item
> is reframed as *hardening* that persistence, because the current
> delete-all-then-reinsert design can wipe the prospect list on a failed save
> (`ARCHITECTURE.md` §5 debt #2).

---

## TIER 1 — FOUNDATIONS (do first)

### 1.1 Input validation on all uploads — French error messages
- **Value:** Today a wrong-schema Excel silently produces empty letters
  (`routes/letters.py:22-25`); a bad CSV yields a cryptic 500. Jéo should see
  « Colonnes manquantes : Adresse, Nb_Unites » instead of a broken ZIP.
- **What:** validate expected columns on `/preview-excel`, `/generate-letters`,
  `/check-duplicates`, `/import-prospects`, `/filter-properties`; return 400
  with a French message; surface it in the existing toast system.
- **Effort:** M **Risk:** Low — additive checks, no behavior change on valid input.

### 1.2 pytest suite for `fuzzy_matcher` + `address_normalizer`
- **Value:** These two pure functions decide what counts as a duplicate —
  the highest-stakes silent logic in the app. Tests lock in the normalization
  invariants (`ARCHITECTURE.md` §3.2) so future edits can't quietly break them.
- **What:** `backend/tests/` with cases for saint/sainte/boulevard/avenue
  rules, accent stripping, threshold boundaries (85/50), empty inputs.
  Also fixes debt #3 (zero tests).
- **Effort:** S **Risk:** None — no production code changes.

### 1.3 React error boundaries + loading states
- **Value:** A render error currently blanks the entire app (debt #12);
  several pages show nothing while fetching. Jéo should never stare at a
  white screen.
- **What:** top-level error boundary in `App.jsx` with a French fallback +
  reload button; consistent spinners/skeletons on Dashboard, ProspectTracker,
  and result tables.
- **Effort:** S **Risk:** Low.

### 1.4 `start.ps1` — Windows-compatible start script
- **Value:** `start.sh` is bash/macOS-only (`start.sh:1,31`); the dev machine
  is Windows. One double-click start ends the terminal gymnastics from setup.
- **What:** PowerShell script: check python/npm exist, install deps, launch
  uvicorn + vite in separate windows, open the browser. Update README
  (which is also stale — see `ARCHITECTURE.md` discrepancies).
- **Effort:** S **Risk:** None.

### 1.5 (added, strongly recommended) Fix delete-all-then-insert prospect save
- **Value:** `POST /api/prospects` deletes ALL rows before re-inserting
  (`main.py:125`) and the frontend ignores failures
  (`ProspectTracker.jsx:42`) — one bad save silently destroys the pipeline,
  Jéo's most valuable data.
- **What:** per-row upsert/delete by id instead of wipe-and-replace; surface
  save failures with a French toast.
- **Effort:** M **Risk:** Medium — touches the tracker's save path; needs
  careful Phase 2 test steps.

---

## TIER 2 — FORCE MULTIPLIERS

### 2.1 Harden Supabase prospect persistence (reframed — see correction above)
- **Value:** Reliable persistence Jéo can trust; no more Excel re-imports as
  an insurance policy against data loss.
- **What:** builds on 1.5 — add `updated_at` handling, optimistic UI with
  rollback on failure, and a « Dernière sauvegarde » indicator in
  ProspectTracker.
- **Extension point:** existing Supabase access via `get_db()`
  (`ARCHITECTURE.md` §4 "New persisted data").
- **Effort:** M **Risk:** Medium (same save path as 1.5).

### 2.2 Letter template editor in Settings
- **Value:** Body text, services list, and footer are hardcoded in
  `letter_generator.py:16-23,149-154`. Jéo can't adjust his pitch without a
  developer. Editable templates = the letter evolves with the sales approach.
- **What:** store template blocks (body, services, closing) in the Supabase
  `config` table; textarea editors in `Settings.jsx` with placeholder tags
  (`{gestionnaire}`, `{nb_unites}`, `{secteur}`); `generate_letter()` reads
  from settings with current text as fallback.
- **Extension point:** §4 frontend pattern (extend Settings) + `config`
  table; letter layout code untouched, only strings become data.
- **Effort:** M **Risk:** Medium — the letter is the product; needs
  side-by-side output comparison in Phase 4.

### 2.3 Batch history — remember past generations
- **Value:** « Est-ce que j'ai déjà écrit à ce syndicat ? » Currently
  unanswerable. History prevents embarrassing double-mailings and shows
  effort per secteur.
- **What:** new Supabase table `letter_batches` (date, mode, count, list of
  addresses); log on each `/generate-letters`; a history section on the
  Dashboard or a new page; cross-check new batches against past ones.
- **Extension point:** §4 route pattern (extend `letters.py`) + new table +
  §4 component/sidebar pattern if a full page.
- **Effort:** M **Risk:** Low — purely additive.

### 2.4 Close the loop: duplicates → letters
- **Value:** Today Jéo exports the « Liste nette » to Excel, then re-uploads
  it to the letter generator. One click should do it — the property filter
  already proves this pattern works (`PropertyFilter.jsx:88`).
- **What:** « Générer les lettres » button on the clean-list tab in
  `DuplicateChecker.jsx` that hands rows to the letter pipeline (either
  navigate with state or a JSON-accepting variant of `/generate-letters`);
  same for « Envoyer aux prospects ».
- **Extension point:** §4 route pattern (letters.py variant accepting JSON
  rows) + existing `/prospects/add` endpoint.
- **Effort:** M **Risk:** Low — new path alongside the existing one.

---

## TIER 3 — INTELLIGENCE

### 3.1 Auto-scoring of properties (priority score)
- **Value:** The Montréal évaluation foncière file has thousands of rows;
  Jéo's time is the scarce resource. A score (unit count × building age,
  tunable weights) sorts the list so the best doors get knocked first.
- **What:** compute `score` in `/filter-properties` results
  (`routes/properties.py:204-213` already extracts units and year); sortable
  score column + explanation tooltip in `PropertyFilter.jsx`.
- **Extension point:** §4 route pattern (pure scoring function in
  `backend/utils/`, unit-tested per 1.2's infra).
- **Effort:** S–M **Risk:** Low — additive field.

### 3.2 Map view of prospects by secteur
- **Value:** Route planning for dépôt days — see clusters, hit one
  arrondissement per trip instead of criss-crossing the island.
- **What:** Leaflet + OpenStreetMap (free, no API key) page showing prospects
  colored by statut; geocoding via Nominatim with local caching, or
  approximate positioning by arrondissement using the existing
  `arrond_map` (`routes/properties.py:68-91`).
- **Extension point:** §4 component/sidebar pattern (new page) + new
  dependency (leaflet — justified per FEATURE_PLAYBOOK anti-patterns).
- **Effort:** L **Risk:** Medium — geocoding quality varies; rate limits.

### 3.3 Follow-up reminders based on prospect status age
- **Value:** Deals die in silence. « Courriel envoyé » 14 days ago with no
  follow-up is money left on the table; the tracker already stores statut
  and dates (`supabase_setup.sql:33-49`).
- **What:** compute overdue follow-ups server-side (rules like: Courriel
  envoyé > 7 days → relancer); « À relancer » card on the Dashboard +
  a filter/badge in ProspectTracker. No emails, no cron — computed on load.
- **Extension point:** §4 route pattern (new endpoint reading `prospects`
  table) + Dashboard extension.
- **Effort:** M **Risk:** Low — read-only over existing data.

### 3.4 Email draft generation alongside letters
- **Value:** Half the pipeline statuses are about courriels, but the app only
  makes print letters. Same data, second channel, zero re-typing.
- **What:** `/generate-emails` endpoint reusing the prospect schema and
  template blocks from 2.2; output = per-prospect subject + body (French),
  exported as .txt/.eml files or copy buttons in the UI. `mailto:` links
  where a courriel column exists.
- **Extension point:** §4 route pattern + reuse of 2.2's template storage.
- **Effort:** M (S if 2.2 is done first) **Risk:** Low.

---

## NOT WORTH BUILDING

Features that sound impressive and would actively hurt a solo-operator tool:

- **Multi-user auth / roles / teams** — there is exactly one user. (API-level
  protection for the deployed instance is a security fix — debt #1 — not a
  user-management feature.)
- **Microservices / queues / Docker orchestration** — three pipelines and a
  serverless function do not need distributed systems. Complexity without a
  single new capability for Jéo.
- **Heavy CRM features** (pipelines with stages/weights, email sequence
  automation, lead scoring ML models) — ProspectTracker's six statuses match
  how one person actually sells. A real CRM is a product decision, not a
  feature.
- **A database abstraction layer / ORM migration** — `get_db()` + three
  tables is the right size. An ORM adds a dependency and a learning curve to
  solve a problem this app doesn't have.
- **Real-time sync / websockets** — one browser tab, one user. Fetch on load
  is correct.
- **Native mobile app** — the Vercel deployment is already reachable from a
  phone; responsive polish on ProspectTracker would deliver 90% of the value
  for 5% of the cost.
- **Multi-city expansion of the property filter** — the arrondissement maps
  (`routes/properties.py:68-116`) are Montréal-specific by design. Generalize
  only when a second city is actually on the calendar.
