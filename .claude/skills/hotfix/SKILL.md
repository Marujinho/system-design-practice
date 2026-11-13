---
name: hotfix
description: Ship a trivial, zero-risk change — copy, color, spacing, order of static items — straight to the staging and default branches, skipping the pipeline
argument-hint: "<change: text | path | url | tracker id> [--target <branch>]..."
---

# Hotfix

**Input**: $ARGUMENTS (what to change — pasted text, a path, a URL, or a tracker item; resolve it per CLAUDE.md § Inputs. `--target` replaces the branches the change lands on, repeatable — CLAUDE.md § Pipeline settings `hotfix_targets`)

The fast lane. For a change so small that nothing can break, the six-stage pipeline costs more than the change. No PRD, no plan, no review, no tests — the change is committed and pushed to the staging branch and the default branch, and that's it.

What keeps this safe is not verification. It's the eligibility rule: only a change that *cannot* break anything gets in. If you're unsure whether it can, it can't be a hotfix.

## Eligible

A hotfix changes how something looks or reads, never what it does. One concern, a few lines, obvious by inspection:

- Text: a label, a message, a heading, a translation string, a typo, a comment, docs
- Style: color, size, spacing, font, alignment, a CSS rule that breaks a layout
- Order or visibility of static items: cards, menu entries, columns, sections
- A static asset: icon, image, logo

## Not eligible — any one of these means the pipeline

- Logic: a condition, a calculation, a default value, a loop, error handling
- Data: a query, a schema, a migration, a model, anything stored or sent
- Security: auth, permissions, validation, sanitization, headers, secrets, env vars
- Contracts: an API shape, an event name, a config key something else reads
- Dependencies, build, CI, deploy config
- Text that carries legal, pricing, security, or compliance meaning — terms, prices, consent copy, permission labels
- More than one concern, or a change you can't describe in one sentence
- Anything you'd want a test for. Needing a test means it isn't a hotfix

The user calling it simple doesn't make it eligible. You decide from the diff you're about to make, and you say so when it isn't.

## Process

1. **Mark the stage**: `printf hotfix > .claude/.stage` (CLAUDE.md § Hooks). Resolve the input.

2. **Classify.** Find the exact file and lines. If the change fails any *Not eligible* row, stop: say which row and why, clear the stage marker, and invoke `/create-prd` with the same input. Don't do a partial hotfix.

3. **Check the tree.** `git status --porcelain` must be empty — a hotfix lands on shared branches and must not carry someone's uncommitted work. Dirty tree → stop and ask the user to commit or stash first. Note the current branch to return to it.

4. **Targets.** `--target` if given; otherwise `hotfix_targets` from CLAUDE.md § Pipeline settings; otherwise `base_branch` plus the repo default branch, deduplicated. A target that doesn't exist on the remote is a stop, not a branch to create.

   Read the CI config for what a push to each target triggers. If a push deploys to production by itself, that push is a production deploy — a hard gate under every autonomy level (CLAUDE.md § Execution boundaries). Ask before it, name the branch, and push the others meanwhile.

5. **Make the change** on the first target:

   ```bash
   git fetch origin
   git checkout {target}
   git pull --ff-only origin {target}
   ```

   Edit the lines. Nothing else: no reformatting, no "while I'm here". Re-read the diff — it must be exactly the one sentence from step 2.

6. **Commit and push.** One commit, message `hotfix: {what changed}`. Under `autonomy: suggest` stop here with the diff instead.

   ```bash
   git commit -am "hotfix: {what changed}"
   git push origin {target}
   ```

   Then for every other target: `git checkout {next}`, `git pull --ff-only origin {next}`, `git cherry-pick {sha}`, `git push origin {next}`. A cherry-pick conflict means the targets have diverged where this change lives — abort the cherry-pick, report which target didn't get it, never force or resolve by guessing.

7. **Return and report.** `git checkout {original branch}`. Clear the stage marker: `rm -f .claude/.stage`. If the user said this must also be deployed, that's `/deploy-work`, not a push.

## Output

```markdown
## Hotfix: {one sentence}

- `{file:line}` — {what changed}

| Target | Commit | Pushed |
|---|---|---|
| `{branch}` | `{sha}` | ✅ / ❌ {why} |

Triggers: {what each push kicks off in CI, or "nothing"}
```

## Rules

- Eligibility is decided from the diff, not from the request. "It's simple" is a claim; the diff is the evidence.
- Not eligible means `/create-prd`, every time. Never a smaller hotfix than the user asked for.
- One commit, one concern, no drive-by changes.
- No tests, no review, no PR — by design. The eligibility rule is the control; don't weaken it to compensate.
- Never push a branch that doesn't exist, never force-push, never resolve a conflict by guessing.
- A push that deploys to production is a production deploy. Ask.
