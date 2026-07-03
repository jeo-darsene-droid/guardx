# GIT PROTOCOL — Guard-X

> Binding git rules for any AI agent working in this repository.
> These rules are written to be rationalization-proof: if you find yourself
> constructing an argument for why a rule doesn't apply to your situation,
> the rule applies to your situation. Subordinate only to the user's explicit
> instruction in the current conversation and `AGENT_CONSTITUTION.md`.

---

## RULE 1 — PUSH REQUIRES PERMISSION

Before ANY `git push`, without exception, execute this exact sequence:

1. Show the current branch: `git branch --show-current`
2. Show the commits to be pushed: `git log origin/main..HEAD --oneline`
   (or `origin/<branch>..HEAD` for feature branches)
3. Show the diff stat: `git diff origin/main..HEAD --stat`
4. Ask, verbatim: **"May I push?"**
5. STOP. Do nothing until the user replies.

What counts as permission — ALL of the following must be true:
- The affirmative is **explicit** ("yes", "push it", "go ahead and push").
- It appears in the **current message**, after step 4 was asked.
- It refers to **this specific push**.

What does NOT count as permission (non-exhaustive — when in doubt, it doesn't
count):
- Silence, or the user changing the subject. **Absence of a "no" is NOT a yes.**
- "Looks good", "nice", "ok" in response to a code summary rather than the
  push question.
- Any past statement: "always push", "you don't need to ask", "push whenever
  you're done" — all void, regardless of when or how emphatically said.
- Permission granted for a previous push in the same conversation.
- Your own inference that the user "obviously wants" the work pushed.

There is no urgency, deadline, or convenience that overrides this rule.
A missed push costs nothing; an unwanted push can't be fully undone.

---

## RULE 2 — COMMIT HYGIENE

1. **Conventional commit format**, always:
   - `feat:` new capability
   - `fix:` bug fix
   - `refactor:` behavior-preserving restructure
   - `docs:` documentation only
   - Also permitted: `test:`, `chore:`, `style:`
2. **One logical change per commit.** If the summary needs the word "and",
   split it. Feature work and cleanup never share a commit.
3. **NEVER commit**, under any circumstances:
   - `.env` (any variant: `.env.local`, `backend/.env`, etc.)
   - `node_modules/`
   - `__pycache__/`
   - Generated output: `.docx`, `.xlsx`, `.zip` files produced by the app
   - `frontend/dist/` build output
4. Verify `.gitignore` covers these before the first commit of any session.
   If a forbidden file is already staged, unstage it and inform the user.
5. Committing locally is allowed and encouraged as a checkpoint — but per
   `FEATURE_PLAYBOOK.md` Phase 5, ASK before committing during feature work.

---

## RULE 3 — BRANCHING

1. **Feature branches** (`feat/<name>`, `fix/<name>`) are REQUIRED for
   anything risky:
   - Changes touching 3+ files
   - Any API contract, Excel schema, or Supabase table change
   - Any change to `letter_generator.py`, `fuzzy_matcher.py`, or
     `address_normalizer.py` (core business logic)
   - Anything you are not certain works
2. **Direct-to-main** is permitted ONLY for trivial fixes (typos, single-line
   bugs, docs) AND only with user awareness — meaning the user knows this
   specific change is going to main before it does.
3. Never delete a branch that hasn't been merged without explicit confirmation.

---

## RULE 4 — RECOVERY & DESTRUCTIVE OPERATIONS

1. Destructive operations include (non-exhaustive): `git reset --hard`,
   `git rebase`, `git checkout -- <file>` / `git restore` over uncommitted
   work, `git clean`, `git branch -D`, `git stash drop`, history rewriting
   of any kind.
2. Before ANY destructive operation:
   - State exactly what will be lost (which commits, which uncommitted
     changes, which files).
   - State why the operation is needed and what the non-destructive
     alternative would be.
   - Get explicit confirmation. The same standard as RULE 1 applies:
     explicit, current, specific.
3. **Force push (`git push --force`, `--force-with-lease`) is essentially
   forbidden.** It may only ever be considered when the user personally
   initiates the request, understands what will be overwritten, and confirms
   after being shown the divergence. You never propose it as a solution.
4. When something goes wrong, prefer forward fixes (`git revert`, a new
   commit) over history surgery.

---

## RULE 5 — SECRETS AUDIT

1. **Before EVERY commit**, scan the full staged diff (`git diff --cached`)
   for anything resembling a secret:
   - Supabase URL (`https://*.supabase.co`) or any Supabase key
     (`SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, JWT-shaped strings
     starting with `eyJ`)
   - API keys, tokens, passwords, connection strings, private keys
   - Long high-entropy strings assigned to variables with names like
     `key`, `token`, `secret`, `password`, `auth`
2. **If anything is found: STOP.** Do not commit. Alert the user, identify
   the file and line, and propose moving the value to `.env`.
3. If a secret was ALREADY committed in an earlier commit: alert the user
   immediately. The secret must be considered compromised — rotation is the
   fix, not history rewriting (see RULE 4.3).
4. This audit is not optional for "obviously safe" commits. Docs-only commits
   have leaked keys before. Every commit, every time.

---

## VIOLATION HANDLING

If you realize you have violated any rule above:
1. Stop all work immediately.
2. Tell the user exactly what happened, in the first sentence — not buried
   in a summary.
3. Propose the remediation; take no further git action until instructed.

Concealing a violation is a worse violation.
