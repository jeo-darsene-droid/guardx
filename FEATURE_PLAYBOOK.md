# FEATURE PLAYBOOK — Guard-X

> The mandatory ritual for implementing ANY new feature or change in this
> repository. No phase may be skipped, reordered, or merged. Subordinate to
> `AGENT_CONSTITUTION.md`; grounded in `ARCHITECTURE.md`.

---

## PHASE 0 — UNDERSTAND

Before anything else:

1. **Restate the feature request in one or two sentences.** If you cannot
   restate it precisely, you do not understand it — ask one clarifying question.
2. **Identify the user problem it solves.** The user is Jéo, a solo
   fire-protection sales rep in Montréal. Every feature must serve one of:
   - **Prospecting** — finding and targeting copropriétés to sell to
   - **Letter generation** — producing professional outreach documents faster
   - **Lead tracking** — knowing who was contacted, when, and what's next
3. **Challenge misfit requests.** If the feature does not clearly serve one of
   those three jobs, say so plainly: state why it doesn't fit, what it would
   cost in complexity, and propose the closest alternative that does fit.
   Jéo has the final word — but he gets the honest assessment first.

**Exit criteria:** a one-sentence goal statement and the job it serves.

---

## PHASE 1 — DESIGN

Write a design note of exactly 5 lines:

1. **Files touched** — every file that will be created or modified
   (read them all first; see `ARCHITECTURE.md` §4 for extension points).
2. **API contract changes** — new/changed endpoints, request/response shapes.
   "None" is a valid and common answer.
3. **UI changes** — new components, routes (`App.jsx`), sidebar entries
   (`Sidebar.jsx`), or modifications to existing pages.
4. **Data shape changes** — Excel schema, Supabase tables, config keys.
   Any change here is automatically NON-TRIVIAL (see invariants,
   `ARCHITECTURE.md` §3).
5. **Failure modes** — what breaks if the input is wrong, the network fails,
   or Supabase is unreachable; how the user finds out (French error toast).

**Present the note to the user for approval on anything non-trivial.**
Non-trivial = touches 3+ files, changes any API contract or data shape,
adds a dependency, or alters an invariant. Trivial fixes may proceed with the
note stated inline.

**Exit criteria:** design note written; approval obtained if required.

---

## PHASE 2 — TEST FIRST

Define how success will be verified BEFORE writing any implementation code.

1. **If test infra exists** (pytest for `backend/utils/`, vitest for frontend):
   write or update the tests first. Pure logic (normalization, matching,
   filtering) MUST have unit tests.
2. **If no test infra applies**: write explicit manual test steps —
   numbered, concrete, with expected outcomes. Example:
   - "Upload `prospects.xlsx` with 3 rows missing `Adresse` → expect a French
     error toast, not a ZIP of broken letters."
3. **Cover the failure modes from Phase 1**, not just the happy path.
4. **NEVER weaken or delete an existing test to make code pass.** If a test
   fails, either the code is wrong or the test encodes an outdated
   requirement — in the second case, flag it to the user before touching it.

**Exit criteria:** a written verification plan (tests or manual steps).

---

## PHASE 3 — IMPLEMENT

1. **Smallest possible diff** that fully achieves the goal. Prefer one-line
   fixes. No drive-by refactors, renames, or reformatting mixed with feature
   work — if cleanup is genuinely needed, propose it as a separate change.
2. **Follow existing patterns exactly:**
   - Backend: new route file in `backend/routes/` with `router = APIRouter()`,
     registered in `main.py` with `prefix="/api"`; pure logic in
     `backend/utils/` as importable functions; activity logging in
     try/except (models in `ARCHITECTURE.md` §4).
   - Frontend: one component per page in `frontend/src/components/`, route in
     `App.jsx`, nav entry in `Sidebar.jsx`; `showToast` for feedback; relative
     `/api` calls; blob + object URL for downloads.
   - Styling: Tailwind utility classes matching the existing palette
     (`navy`, `accent`, rounded-xl cards, shadow-sm borders).
3. **French-language UI strings** — every label, toast, error, and placeholder
   matches the app's existing French voice.
4. **Imports at the top of the file.** Secrets only via `.env`.
5. **Respect all invariants** in `ARCHITECTURE.md` §3 — especially the Excel
   schema, the `"postal"`/`"dépôt"` mode strings, and relative `/api` calls.

**Exit criteria:** the diff exists, is minimal, and matches house style.

---

## PHASE 4 — VERIFY

1. **Run the app locally:**
   - Backend: `python -m uvicorn main:app --reload --port 8000` (from `backend/`)
   - Frontend: `npm run dev` (from `frontend/`)
2. **Exercise the feature end-to-end** through the real UI at
   `http://localhost:5173` — not just the endpoint in isolation.
3. **Check both sides:** browser console for JS errors, uvicorn output for
   Python exceptions and swallowed errors.
4. **Run the Phase 2 verification plan** step by step, including failure cases.
5. **State plainly what was and wasn't verified.** "I ran steps 1–3; step 4
   (Supabase outage) was not testable locally" is the required level of
   honesty. Never imply verification that didn't happen.

**Exit criteria:** verification report delivered to the user.

---

## PHASE 5 — DELIVER

1. **Summarize the change:** what changed, why, what was verified, what remains.
2. **Propose a commit message** — conventional format (`feat:`, `fix:`,
   `refactor:`, `docs:`), one logical change per commit.
3. **ASK before committing.** Wait for the user's answer.
4. **NEVER push without explicit permission given in that moment.** Show the
   branch, commits, and diff stat first, then ask "May I push?" and wait.
   Prior blanket permissions do not count. Silence does not count.
   (See `GIT_PROTOCOL.md` and `AGENT_CONSTITUTION.md` LAW 1.)
5. Never commit `.env`, `node_modules/`, `__pycache__/`, or generated
   `.docx`/`.xlsx`/`.zip` output.

**Exit criteria:** user has approved (or declined) commit and push explicitly.

---

## ANTI-PATTERNS — Forbidden Moves

- **No speculative abstractions.** Do not build plugin systems, generic
  handlers, or "future-proof" layers for needs that don't exist yet. Guard-X
  is a solo-operator tool; three concrete pipelines beat one clever framework.
- **No new dependencies without justification.** Every added package must be
  named in the Phase 1 note with the reason no existing dependency suffices.
  Prefer the already-installed stack: pandas, rapidfuzz, python-docx, axios,
  lucide-react, react-dropzone.
- **No rewriting working modules.** If `letter_generator.py` produces correct
  letters, its internals are off-limits during unrelated work. Improvement
  proposals go to the user as separate suggestions, not as smuggled rewrites.
- **No silent schema changes to the Excel format.** The column set
  `Nom_Gestionnaire | Nom_Syndicat | Adresse | Ville_CodePostal | Nb_Unites | Secteur | Notes`
  is consumed by letters, prospect import, AND produced by the property
  filter. Any change requires an explicit Phase 1 approval and coordinated
  updates to every consumer — never a quiet rename in one place.
- **No silent error swallowing in new code.** The existing
  `except Exception: pass` pattern for activity logging is tolerated legacy,
  not a license. New code surfaces failures with French error messages.
- **No mixing English into the UI.** The app speaks French to Jéo.
- **No "it should work" claims.** Phase 4 or it didn't happen.
