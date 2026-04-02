---
name: gitops
description: GitOps workflow conventions — branching strategy, commit standards, PR process, CI/CD, versioning, and rollback procedures.
---

# GitOps Skill

## Branching Strategy

We use **trunk-based development** with short-lived feature branches.

```
main  ──────────────────────────────────────────────────► (always deployable)
        │          │              │            │
        feat/…     fix/…          feat/…       release/1.2.0
        (≤2 days)  (≤1 day)       (≤2 days)    (hotfix only)
```

### Branch naming

```
<type>/<ticket-id>-<short-description>

feat/PROJ-123-user-authentication
fix/PROJ-456-login-redirect-loop
chore/PROJ-789-upgrade-dependencies
docs/PROJ-101-api-reference
refactor/PROJ-202-extract-auth-service
release/1.4.0
hotfix/PROJ-999-critical-payment-bug
```

| Prefix | Use for |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `chore/` | Tooling, deps, config |
| `docs/` | Documentation only |
| `refactor/` | Code restructure, no behaviour change |
| `test/` | Adding/fixing tests only |
| `release/` | Release preparation |
| `hotfix/` | Emergency fix to production |

### Rules
- Branch off `main`, merge back to `main`
- Delete branch after merge
- Never commit directly to `main`
- Max branch lifetime: **2 days** — if it lives longer, break it up or use a feature flag

---

## Commit Message Standard

We follow **Conventional Commits** (`https://www.conventionalcommits.org`).

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Type reference

| Type | When to use |
|------|------------|
| `feat` | New user-facing feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace (no logic change) |
| `refactor` | Code change that's neither a fix nor a feature |
| `test` | Adding or correcting tests |
| `chore` | Build process, deps, tooling |
| `perf` | Performance improvement |
| `ci` | CI/CD pipeline changes |
| `revert` | Reverts a previous commit |

### Examples

```bash
# Feature
feat(auth): add OAuth2 login with Google

# Bug fix with ticket reference
fix(payments): prevent double-charge on retry

Closes PROJ-456

# Breaking change
feat(api)!: rename /users endpoint to /accounts

BREAKING CHANGE: All clients must update the base path from /users to /accounts.
Closes PROJ-789

# Chore
chore(deps): upgrade react to 19.1.0

# Revert
revert: feat(auth): add OAuth2 login with Google

Reverts commit a1b2c3d
```

### Rules
- Subject line: **≤72 characters**, **no period** at the end
- Use **imperative mood**: "add feature" not "added feature"
- **Body** explains *why*, not *what*
- Reference tickets in footer: `Closes PROJ-123` / `Refs PROJ-456`
- Breaking changes: append `!` after type and add `BREAKING CHANGE:` footer

---

## Commit Workflow

```bash
# 1. Stage only what belongs together
git add src/auth/login.ts tests/auth/login.test.ts

# 2. Verify what you're committing
git diff --staged

# 3. Commit
git commit -m "feat(auth): add JWT token refresh logic"

# 4. Push and open PR
git push -u origin feat/PROJ-123-jwt-refresh
gh pr create --fill
```

### Atomic commits
- Each commit should do **one thing** — the code compiles and tests pass at every commit
- Squash work-in-progress commits before opening PR: `git rebase -i origin/main`

---

## Pull Request Process

### Before opening a PR

```bash
# 1. Rebase onto latest main (not merge)
git fetch origin
git rebase origin/main

# 2. Run full local checks
pnpm lint && pnpm tsc --noEmit && pnpm test:run      # React
ruff check . && mypy src/ && pytest                   # Python

# 3. Self-review: read your own diff
git diff origin/main...HEAD

# 4. Push
git push -u origin feat/PROJ-123-my-feature
```

### PR template

```markdown
## Summary
<!-- 2-3 bullet points of what changed and why -->

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Tested manually in dev environment

## Checklist
- [ ] No console.log / print statements left in
- [ ] Env vars documented in .env.example
- [ ] No secrets committed
- [ ] Linked ticket: PROJ-XXX

## Screenshots (if UI change)
```

### PR rules
- **Max size:** 400 lines changed (excluding lock files / generated code) — split larger changes
- **1 approval** required to merge
- **CI must pass** — no merging red PRs
- **No force push** to PR branches after review has started
- **Squash merge** into main (clean linear history)
- Delete branch after merge

---

## CI/CD Pipeline (GitHub Actions)

### Standard pipeline structure

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm tsc --noEmit

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
        env:
          NPM_PRIVATE_TOKEN: ${{ secrets.NPM_PRIVATE_TOKEN }}
      - run: pnpm test:run --coverage
      - uses: codecov/codecov-action@v4

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
        env:
          NPM_PRIVATE_TOKEN: ${{ secrets.NPM_PRIVATE_TOKEN }}
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: .next/

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - run: echo "Deploy to staging"
      # your deploy steps here
```

### Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `NPM_PRIVATE_TOKEN` | Private npm registry auth |
| `DEPLOY_KEY` | SSH key for deploy target |
| `SLACK_WEBHOOK_URL` | CI notifications |

---

## Versioning (Semantic Versioning)

Format: `MAJOR.MINOR.PATCH[-prerelease]`

| Bump | When |
|------|------|
| `MAJOR` | Breaking API / behaviour change |
| `MINOR` | New feature, backward-compatible |
| `PATCH` | Bug fix, backward-compatible |

### Tagging a release

```bash
# 1. Update version
npm version minor   # or: major / patch / 1.4.0 (explicit)
# This updates package.json and creates a git tag

# 2. Push tags
git push origin main --tags

# 3. Create GitHub release
gh release create v1.4.0 \
  --title "v1.4.0 — User Management" \
  --generate-notes
```

### Automated versioning with semantic-release

```json
// package.json
{
  "release": {
    "branches": ["main"],
    "plugins": [
      "@semantic-release/commit-analyzer",
      "@semantic-release/release-notes-generator",
      "@semantic-release/changelog",
      "@semantic-release/npm",
      "@semantic-release/github"
    ]
  }
}
```

With semantic-release, the version bump is derived automatically from commit types (`feat` → minor, `fix` → patch, `feat!` → major).

---

## Environment Promotion

```
Developer machine
      │  git push + PR
      ▼
main branch  ──► staging (auto-deploy on merge)
      │
      │  git tag v1.x.x
      ▼
production  ──► deploy triggered by tag (manual approval gate)
```

### Environment config

| Env | Branch/Tag | Deploy trigger | Approval |
|-----|-----------|---------------|---------|
| `dev` | feature branch | PR preview | None |
| `staging` | `main` | Automatic on merge | None |
| `production` | `v*` tag | Tag push | 1 approver |

---

## Hotfix Workflow

For critical bugs in production:

```bash
# 1. Branch from the production tag (not main)
git checkout v1.3.2
git checkout -b hotfix/PROJ-999-payment-crash

# 2. Fix the bug
# 3. Commit
git commit -m "fix(payments): prevent null pointer on empty cart"

# 4. Tag and merge to main
git tag v1.3.3
git push origin hotfix/PROJ-999-payment-crash --tags

# 5. Open PR to main so the fix is included in future releases
gh pr create --base main --title "hotfix: prevent null pointer on empty cart"

# 6. Deploy the tag to production
gh workflow run deploy.yml --ref v1.3.3
```

---

## Rollback Procedures

### Option 1 — Re-deploy previous tag (preferred)

```bash
gh workflow run deploy.yml --ref v1.3.2
```

### Option 2 — Revert commit

```bash
# Find the bad commit
git log --oneline -10

# Revert it (creates a new commit — safe for shared history)
git revert abc1234 --no-edit
git push origin main

# Fast-track through CI using label
gh pr create --label "fast-track" --title "revert: bad deploy"
```

### Option 3 — Feature flag disable (zero-downtime)

If the feature was shipped behind a flag, disable the flag in the config dashboard immediately — no deploy required.

---

## Useful Git Aliases

```bash
# Add to ~/.gitconfig
[alias]
  lg     = log --oneline --graph --decorate --all
  st     = status -sb
  co     = checkout
  br     = branch -vv
  recent = for-each-ref --sort=-committerdate refs/heads/ --format='%(refname:short) %(committerdate:relative)'
  undo   = reset HEAD~1 --mixed    # un-commit last commit, keep changes staged
  wip    = commit -am "wip: checkpoint"
```

---

## Git Hygiene Rules

```bash
# Never rebase shared branches (branches others have checked out)
# ✅ OK to rebase your own feature branch onto main
git rebase origin/main

# Never force-push to main
# ✅ Only force-push to your own feature branch before review starts
git push --force-with-lease origin feat/my-feature

# Keep commits clean before PR
git rebase -i origin/main   # squash/fixup WIP commits

# Verify no secrets before push
git diff --staged | grep -E "(password|token|secret|key)" -i
```

---

## `.gitignore` Essentials

```gitignore
# Environment
.env
.env.local
.env.*.local

# Dependencies
node_modules/
.venv/
__pycache__/
*.pyc

# Build outputs
dist/
build/
.next/
out/

# IDE
.vscode/settings.json
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Test coverage
coverage/
.nyc_output/
htmlcov/

# Secrets (explicit safety net)
*.pem
*.key
*_rsa
id_rsa*
```

---

## Agent Instructions

When working on GitOps tasks:

1. **Check branch name** before committing — it must follow `<type>/<ticket>-<description>` format.
2. **Write Conventional Commits** — type, optional scope, imperative subject, ≤72 chars.
3. **Never commit to `main` directly** — always use a branch + PR.
4. **Never commit secrets** — check `.gitignore` covers `.env`. Run `git diff --staged` before every commit.
5. **Rebase, don't merge** when syncing with main: `git rebase origin/main`.
6. **One logical change per commit** — the repo should compile and tests pass at every commit.
7. **Reference tickets** in commit footers: `Closes PROJ-123`.
8. When creating a release: update `CHANGELOG.md`, bump version, tag, push tags.
9. When a CI check fails, fix it before merging — never merge a red PR.
10. For hotfixes: branch from the production **tag** (not main), fix, tag patch, then back-merge to main.
