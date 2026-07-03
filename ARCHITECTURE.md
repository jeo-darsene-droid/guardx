# ARCHITECTURE — Guard-X

> Verified against the actual code on 2026-07-03. Every claim cites its source
> file and line. Where the README contradicts the code, the code wins and the
> discrepancy is flagged.

---

## ⚠️ README DISCREPANCIES (code is the truth)

1. **README claims "Aucune base de données — tout fonctionne avec des fichiers"**
   (`README.md:99`). FALSE. The backend uses **Supabase** for config, activity
   log, and prospects (`backend/db.py:1-21`, `backend/main.py:43-44`).
   `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are REQUIRED or the API raises at
   first DB call (`backend/db.py:16-19`).
2. **README claims settings are saved in `config.json`** (`README.md:93`).
   FALSE. `PUT /api/config` upserts into the Supabase `config` table
   (`backend/main.py:53-58`). `backend/config.json` is **dead legacy** — nothing
   in `main.py` reads it.
3. **README's structure omits** `backend/db.py`, `api/index.py`, `vercel.json`,
   and `supabase_setup.sql`, which are all load-bearing.
4. **`start.sh` is bash/macOS only** (`start.sh:1`, `start.sh:31` uses `open`).
   The dev machine is Windows — the script does not run there.

---

## 1. SYSTEM MAP

### Deployment topology
- **Local dev**: uvicorn serves `backend/main.py` on port 8000; Vite dev server
  on port 5173 proxies `/api` to 8000 (`frontend/vite.config.js:6-11`).
- **Vercel**: static frontend build from `frontend/dist`; all `/api/*` requests
  rewritten to the serverless function `api/index.py` (`vercel.json:6-9`),
  which re-exports the FastAPI app after path-hacking `backend/` onto
  `sys.path` (`api/index.py:6-11`).
- **Supabase**: 3 tables — `config`, `activity_log`, `prospects`
  (`supabase_setup.sql:5-49`), RLS enabled with allow-all policies
  (`supabase_setup.sql:52-59`). Accessed via service key singleton
  (`backend/db.py:12-21`).

### Backend (`backend/`)
| Module | Purpose |
|---|---|
| `main.py` | App factory, CORS (`main.py:22-29`), static `/assets` mount (`main.py:32-34`), router registration under `/api` prefix (`main.py:36-38`), plus config/activity/prospects/KPI endpoints |
| `db.py` | Cached Supabase client singleton; hard-fails if env vars missing (`db.py:16-19`) |
| `routes/letters.py` | `POST /api/generate-letters` (Excel → ZIP of .docx), `POST /api/preview-excel` (first 5 rows) |
| `routes/duplicates.py` | `POST /api/check-duplicates` (fuzzy match), `POST /api/export-excel` (generic rows → xlsx, also used by ProspectTracker) |
| `routes/properties.py` | `POST /api/filter-properties` (Montréal CSV filter), `POST /api/export-properties` (rows → xlsx) |
| `utils/letter_generator.py` | `generate_letter(prospect, settings) -> bytes` — builds one branded .docx (`letter_generator.py:65-216`) |
| `utils/fuzzy_matcher.py` | `match_score` = rapidfuzz `token_sort_ratio` over normalized addresses (`fuzzy_matcher.py:6-12`) |
| `utils/address_normalizer.py` | `normalize_address` — lowercase, saint→st, boulevard→boul, accent strip (`address_normalizer.py:5-15`) |

### Endpoints in `main.py`
| Endpoint | Purpose | Source |
|---|---|---|
| `GET /api/config` | Read config row id=1 from Supabase | `main.py:41-50` |
| `PUT /api/config` | Upsert config row | `main.py:53-58` |
| `GET /api/activity` | Last 5 activity entries | `main.py:61-69` |
| `POST /api/activity` | Append activity entry | `main.py:72-81` |
| `POST /api/upload-logo` | Save logo to `backend/assets/guardx_logo.png` (no-ops on serverless OSError) | `main.py:84-96` |
| `POST /api/import-prospects` | Excel → all rows as JSON | `main.py:99-108` |
| `GET /api/prospects` | Load persisted prospects | `main.py:111-116` |
| `POST /api/prospects` | **Delete-all-then-insert** full overwrite | `main.py:119-130` |
| `POST /api/prospects/add` | Merge with dedup key `adresse|nb_unites|notes` | `main.py:133-175` |
| `GET /api/kpis` | KPIs computed from `activity_log` aggregation | `main.py:178-197` |

### Frontend (`frontend/src/`)
| Component | Route | Purpose |
|---|---|---|
| `App.jsx` | — | Router, toast system, loads config on mount with hardcoded fallback (`App.jsx:29-41`), routes defined at `App.jsx:78-86` |
| `Sidebar.jsx` | — | Nav items array `Sidebar.jsx:4-11` — the single place to register a new page |
| `Dashboard.jsx` | `/` | Fetches `/api/kpis` + `/api/activity` (`Dashboard.jsx:13-22`) |
| `LetterGenerator.jsx` | `/lettres` | Dropzone → preview → generate ZIP; "Envoyer aux prospects" posts preview rows to `/api/prospects/add` (`LetterGenerator.jsx:75-91`) |
| `DuplicateChecker.jsx` | `/doublons` | Two dropzones, threshold slider, 3 result tabs, per-tab Excel export (`DuplicateChecker.jsx:63-81`) |
| `PropertyFilter.jsx` | `/coproprietes` | CSV upload + filters → `/api/filter-properties`; export + send-to-prospects (`PropertyFilter.jsx:49,67,88`) |
| `ProspectTracker.jsx` | `/prospects` | Loads/saves prospects to backend on every change (`ProspectTracker.jsx:29-48`), status pills (`ProspectTracker.jsx:6-13`) |
| `Settings.jsx` | `/parametres` | `PUT /api/config`, logo upload (`Settings.jsx:17-51`) |

All components call the API via relative `/api` (`App.jsx:12`) — works in dev
via the Vite proxy and in prod via the Vercel rewrite.

---

## 2. DATA FLOW — The 3 Pipelines

### Pipeline A — Letters
1. User drops `.xlsx` → `POST /api/preview-excel` returns columns + first 5 rows
   (`routes/letters.py:62-69`, `LetterGenerator.jsx:28`).
2. Generate → `POST /api/generate-letters` with the file + settings JSON form
   field (`LetterGenerator.jsx:53-59`).
3. Backend: `pd.read_excel` → per-row `generate_letter()` → each .docx written
   into an in-memory ZIP (`routes/letters.py:22-39`), filename from
   `Nom_Syndicat` else `Nom_Gestionnaire` else `prospect_N`
   (`routes/letters.py:31-38`).
4. Letter layout: logo letterhead, French date with `Secteur` (default "Anjou",
   `letter_generator.py:103-104`), recipient block only in `postal` mode
   (`letter_generator.py:110-127`), body interpolates `Nb_Unites` and `Secteur`
   (`letter_generator.py:145-154`).
5. Activity logged to Supabase, failures swallowed (`routes/letters.py:44-52`).
6. ZIP streamed back (`routes/letters.py:55-59`).

### Pipeline B — Duplicates
1. Two files uploaded (prospects + clients); each parsed as Excel with CSV
   fallback (`routes/duplicates.py:29-37`).
2. For every prospect row, best fuzzy score against ALL client addresses —
   O(n×m) loop (`routes/duplicates.py:48-56`) using
   `token_sort_ratio(normalize(a), normalize(b))` (`fuzzy_matcher.py:6-12`).
3. Classification: score ≥ threshold (default 85) → duplicate; ≥ 50 →
   uncertain; else clean (`routes/duplicates.py:62-67`). **The 50 floor is
   hardcoded.**
4. Full rows + `match_score` + `matched_address` returned
   (`routes/duplicates.py:80-88`); frontend tabs export any bucket via
   `POST /api/export-excel` (`routes/duplicates.py:91-105`).

### Pipeline C — Properties
1. Montréal évaluation foncière CSV uploaded; encoding tried in order
   utf-8 / latin-1 / cp1252, comma then semicolon separator
   (`routes/properties.py:31-44`).
2. Column detection is case-insensitive against candidate lists
   (`routes/properties.py:50-65`) — e.g. units from `NOMBRE_LOGEMENT`, street
   from `NOM_RUE`, borough code from `NO_ARROND_ILE_CUM`.
3. Filters applied in order: unit range → search term (street/municipality/
   borough code + name maps `arrond_map`/`suffix_map`,
   `routes/properties.py:68-145`) → condo-only category → year range
   (`routes/properties.py:148-157`).
4. Output rows reshaped into the **letters schema** with empty
   `Nom_Gestionnaire`/`Nom_Syndicat` (`routes/properties.py:204-213`) — this is
   the bridge that lets property results feed Pipeline A and the prospect
   tracker (`PropertyFilter.jsx:88`).

---

## 3. INVARIANTS — Never break these

1. **Excel prospect schema**:
   `Nom_Gestionnaire | Nom_Syndicat | Adresse | Ville_CodePostal | Nb_Unites | Secteur | Notes`
   — consumed by letter generation (`letter_generator.py:81-171`), prospect
   import mapping (`main.py:156-165`, `ProspectTracker.jsx:62-73`), and
   produced by the property filter (`routes/properties.py:204-213`).
2. **Address normalization rules**: lowercase, `saint-`→`st-`, `sainte-`→`ste-`,
   `boulevard`→`boul`, `avenue`→`av`, whitespace/hyphen collapse, unidecode
   accent stripping (`address_normalizer.py:9-14`). Duplicate detection
   correctness depends on these.
3. **Duplicate thresholds**: user threshold (default 85) for duplicates,
   hardcoded 50 for uncertain (`routes/duplicates.py:20,62-67`).
4. **Config shape**: `rep_name, phone, email, default_mode, logo_path` —
   Supabase `config` table id=1 (`supabase_setup.sql:5-13`), frontend fallback
   (`App.jsx:34-39`).
5. **Ports & proxy**: backend 8000, frontend 5173, Vite proxies `/api`
   (`vite.config.js:6-11`); CORS allowlist covers localhost:5173 and
   `*.vercel.app` (`main.py:22-29`). Frontend must always call relative `/api`.
6. **Vercel contract**: `/api/*` → `api/index.py`, everything else →
   `index.html` (`vercel.json:6-9`). `api/index.py` must keep re-exporting
   `app` from `backend/main.py` (`api/index.py:11`).
7. **Supabase env vars**: `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` in `.env`
   (loaded from `backend/.env` then root `.env`, `main.py:8-9`). Never commit.
8. **Mode values**: exactly `"postal"` and `"dépôt"` (with accent) — compared
   literally in `LetterGenerator.jsx:160-161` and `letter_generator.py:110`.
9. **French UI**: all user-facing strings are French.

---

## 4. EXTENSION POINTS

### New backend feature (route file pattern)
1. Create `backend/routes/<feature>.py` with `router = APIRouter()` and
   endpoints (model: `routes/letters.py:13-16`).
2. Register in `main.py`: `app.include_router(<feature>.router, prefix="/api", tags=["<feature>"])`
   (model: `main.py:36-38`).
3. Pure logic goes in `backend/utils/` as importable, testable functions
   (model: `utils/fuzzy_matcher.py`).
4. Log activity via `db.table("activity_log").insert(...)` inside
   try/except (model: `routes/letters.py:44-52`).

### New frontend page (component + sidebar pattern)
1. Create `frontend/src/components/<Feature>.jsx`; accept `showToast` prop
   (and `config` if needed) — model: `Settings.jsx:6`.
2. Add route in `App.jsx:78-86`.
3. Add nav entry in `Sidebar.jsx:4-11` (`to`, `icon`, `label`, `emoji`).
4. Call APIs with relative `/api`; downloads via blob + object URL
   (model: `DuplicateChecker.jsx:63-81`).

### New persisted data
Add a table in `supabase_setup.sql`, access via `get_db()` (`db.py:12`).

---

## 5. TECH DEBT LEDGER (ranked by risk)

| # | Risk | Debt | Evidence |
|---|---|---|---|
| 1 | **HIGH** | Zero authentication: the API is fully open and backed by the Supabase **service key**; anyone hitting a deployed URL can read/wipe all prospects | `main.py:119-130` (delete-all endpoint), `db.py:7` |
| 2 | **HIGH** | `POST /api/prospects` deletes ALL rows then re-inserts — a failed insert after delete loses the entire prospect list; frontend fires it on every edit and silently ignores failures | `main.py:125`, `ProspectTracker.jsx:37-43` |
| 3 | **HIGH** | No tests of any kind — no pytest, no vitest, nothing protects the normalization/matching logic or the Excel schema | absence of any test file in repo |
| 4 | **MEDIUM** | No input validation: uploads are trusted blindly; a wrong-schema Excel yields empty letters rather than an error | `routes/letters.py:22-25`, `main.py:104` |
| 5 | **MEDIUM** | Silent exception swallowing throughout (`except Exception: pass` on all activity logging; bare `except` on file parsing hides real errors) | `routes/letters.py:51-52`, `routes/duplicates.py:29-37` |
| 6 | **MEDIUM** | KPIs are derived from the activity log, not real data — "Doublons supprimés" is a lifetime sum of matches found, not removals; drift is guaranteed | `main.py:185-191` |
| 7 | **MEDIUM** | O(n×m) duplicate matching in pure Python; large prospect × client lists will be slow (rapidfuzz `process.cdist` unused) | `routes/duplicates.py:48-56` |
| 8 | **LOW** | Dead/legacy artifacts: `backend/config.json` unused; `find_best_match` in `fuzzy_matcher.py:15-24` duplicated inline in the route; README stale (see top) | `backend/config.json`, `routes/duplicates.py:50-56` |
| 9 | **LOW** | `start.sh` is not Windows-compatible; no `start.ps1` equivalent | `start.sh:1-35` |
| 10 | **LOW** | Typo `"ahunsic-cartierville"` in `arrond_map` (rem25) breaks search for that borough via code path | `routes/properties.py:84` |
| 11 | **LOW** | Logo upload writes to local disk only — no-op on Vercel serverless despite the docstring mentioning Supabase Storage | `main.py:84-96` |
| 12 | **LOW** | No React error boundaries; a render error blanks the whole app | `App.jsx` (none present) |
