# Little Finds MY — Master Autonomous Task Prompt

Copy this prompt into Claude Code for each approved task. Fill in the bracketed fields.

---

Implement **[TASK ID AND NAME]** in Little Finds MY Creator Intelligence Studio.

## Approval and scope
- User-approved task: [DESCRIBE]
- Acceptance criteria: [LIST]
- Explicitly out of scope: [LIST]
- Expected branch: `taste-experiment`
- Expected base commit: [COMMIT HASH]
- Commit message: [MESSAGE]

Read `CLAUDE.md` first and obey it.

## End-to-end workflow
1. **Preflight:** inspect branch, HEAD, `git status --short`, package scripts and relevant code. Record all pre-existing modified/untracked files. Preserve them.
2. **Audit/plan:** identify exact files/functions and risks. Stop if work exceeds approved scope.
3. **Implement:** smallest complete change; add tests. Do not alter unrelated design, storage, backups, secrets or integrations.
4. **Verify:** run `scripts/Invoke-LfmQualityGates.ps1`. If browser E2E is missing, do not claim it passed; configure isolated E2E only if approved, otherwise stop before commit.
5. **Browser QA:** synthetic data, isolated browser context/profile, separate port. Check console, hydration, navigation, core flow and responsive overflow.
6. **Review:** inspect full diff, `git diff --check`, changed file list and protected files. Confirm no unrelated changes.
7. **Commit/push:** only if every acceptance criterion and gate passes. Stage exact task files only. Never use `git add -A`, `git add .`, or `git commit -a`. Verify staged paths against the allowlist. Use `scripts/Commit-LfmTask.ps1` with the exact allowlist and `-AutoApprove` only after all gates pass; push to `origin taste-experiment`; never force-push.
8. **Report:** exact files, tests, browser QA, commit hash, push status and remaining issues.

## Stop conditions
Stop without committing/pushing if branch/base differs unexpectedly; protected files change; tests/build/browser QA fail; scope expands; secrets/real user data/production side effects are involved; or staged files include unapproved paths.

Do not silently fix unrelated issues, weaken tests, or invent successful checks.

## Exact commit allowlist
[LIST EXACT RELATIVE PATHS]

## Protected by default
- `next.config.ts`
- `audit-data-model.txt`
- `audit-integrations.txt`
- `.env*`, credentials, local user data and browser profiles

Operate autonomously within these boundaries. Do not ask for approval for routine code edits or passing checks. Ask only when a stop condition is reached.
