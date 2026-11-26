# Little Finds MY — Autonomous Development Rules

## Project
- Windows project: `C:\Users\boomd\Documents\little-finds-my-studio`
- Also follow `AGENTS.md`: this Next.js version differs from older ones; read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code.
- Stack: Next.js, React, TypeScript, Tailwind CSS.
- Work on `taste-experiment` unless explicitly approved otherwise. Never modify `main`.
- Use `npm.cmd` in PowerShell.

## Autonomy
Within the task scope and acceptance criteria explicitly approved by the user:
1. Inspect Git state and relevant code.
2. Audit and plan.
3. Implement and add tests.
4. Run all quality gates and isolated browser QA.
5. Review the complete diff and protected files.
6. If every gate passes, commit only approved task files and push `origin taste-experiment`.
7. Report exact results, commit hash and push status.

Stop and ask only if scope, product behaviour, security, secrets, destructive operations, or an unexpected architectural decision is unclear.

## Mandatory Git safety
- Begin with `git status --short`, `git branch --show-current`, `git log -1 --oneline`.
- Confirm expected branch and base commit.
- Preserve all pre-existing modifications and untracked files. Never clean, reset, stash, restore, delete or overwrite them.
- Never use `git add -A`, `git add .`, or `git commit -a`.
- Stage exact task files only; inspect `git diff --cached --name-status` before commit.
- Never modify or stage `next.config.ts` unless explicitly approved.
- Preserve `audit-data-model.txt` and `audit-integrations.txt`; do not edit or stage by default.
- Never commit secrets, `.env*`, credentials, local data, browser profiles or generated build output.
- If a protected file changes during the task, stop before commit. Do not revert it.
- Commit/push only after all required gates pass and the diff is reviewed.
- Push only to `origin taste-experiment`. Never force-push.
- If push fails, report the state; do not blindly retry or amend.

## Protected local files
- `next.config.ts` (committed in `eab88ca`; do not modify or stage it without explicit approval)
- `audit-data-model.txt`
- `audit-integrations.txt`
- `README-SETUP.txt` (setup-pack instructions; kept local)
- `.env*`, credentials and local secrets
- browser profiles and user data

## Quality gates
Run `scripts/Invoke-LfmQualityGates.ps1`, which runs:
1. `npm.cmd test`
2. `npm.cmd run lint`
3. `npm.cmd run build` (before tsc, so generated route types are fresh)
4. `npx.cmd tsc --noEmit`
5. `git diff --check`
6. Isolated browser E2E using the configured `test:e2e` script (Playwright, installed Edge, port 3107).

Commit with `scripts/Commit-LfmTask.ps1 -Files <exact allowlist> -MessageFile <file>`: without `-AutoApprove` it is a dry run; with it, it stages only the allowlist, checks `git diff --cached --check`, commits and pushes.

Do not claim browser QA passed if no automated browser test ran. If `test:e2e` is missing, report NOT CONFIGURED and do not auto-commit as QA-approved.

## Browser QA
- Use synthetic data, a throwaway browser context/profile and separate test port.
- Never use the user's normal browser profile or real saved app data.
- No real accounts, payments, production credentials or external side effects.
- Check console errors, hydration warnings, failed requests, key flows and responsive overflow.
- Clean up only resources created by the current QA run.

## Implementation
- Keep changes minimal and task-scoped.
- Preserve approved product/design requirements.
- Do not change storage schema, migrations, backup format, authentication, secrets or integrations without explicit approval.
- No paid APIs/services unless approved.
- Do not silently weaken/delete tests to pass.

## Final report
List task summary, exact files, tests/lint/typecheck/build, browser QA and viewports, branch/commit/push, protected files untouched, and limitations.
