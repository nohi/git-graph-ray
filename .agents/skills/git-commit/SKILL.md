---
name: git-commit
description: Analyze staged changes, create a Japanese bulleted commit message, and commit. Use when the user explicitly requests a commit or invokes @git-commit.
disable-model-invocation: true
---

# Git Commit

## Objective

On explicit user request, review changes and commit using the message format defined below.

## Prerequisites

- Commit only when the user explicitly asks. Do not commit otherwise.
- Follow Git safety rules in the user rule `committing-changes-with-git` (no `git config` changes, amend/force-push restrictions, secret exclusion, etc.). Do not duplicate those rules here.

## Workflow

### 1. Inspect changes

Run in **parallel**:

```bash
git status
git diff
git diff --staged
git log --oneline -10
```

### 2. Decide what to stage

| Situation | Action |
|-----------|--------|
| Staged changes exist | Commit staged changes only |
| Only unstaged changes | Ask the user. `git add` only if commit intent is clear from the request |
| Staged and unstaged mixed | Ask whether to include unstaged changes. Unless the user says "commit all", commit staged only |
| No changes to commit | Do not commit; report that |

Abort and warn the user if staged files look like secrets (`.env`, credentials, etc.).

### 3. Split commits when needed

If staged changes contain unrelated concerns, suggest splitting before committing. If the user agrees, stage and commit per concern.

### 4. Write the commit message

Base the message strictly on staged changes. Do not invent or assume unimplemented work.

#### Message format (skill-specific)

- **Language**: Japanese
- **Subject line**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `ci:`, etc.). Add scope when helpful (e.g. `fix(ci):`)
- **Blank line**: one
- **Body**: bulleted list with `- `. Describe changes accurately; include file or feature names when useful

```
<type>(<scope>): <summary in Japanese>

- <change 1>
- <change 2>
```

#### Type guide

| type | Use for |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Refactor without behavior change |
| `test` | Test changes |
| `ci` | CI / workflow changes |
| `chore` | Build, deps, misc |

### 5. Commit

Stage relevant files, then commit with HEREDOC:

```bash
git add <paths>

git commit -m "$(cat <<'EOF'
fix(ci): ci_blade-formatter ジョブ名のマトリックス参照を修正

- blade-formatter ジョブ名で誤って `matrix.php-versions` を参照していた箇所を `matrix.node-versions` に修正

EOF
)"
```

### 6. Verify

```bash
git status
```

Report success only after confirming the commit succeeded.

### 7. Pre-commit hook failure

- Do **not** amend. Fix the issue and create a **new** commit.
- Amend only when the hook auto-modified files and the user rule amend conditions are met.

## Examples

Output must be Japanese. Examples:

**Bug fix:**
```
fix(ci): ci_blade-formatter ジョブ名のマトリックス参照を修正

- blade-formatter ジョブ名で誤って `matrix.php-versions` を参照していた箇所を `matrix.node-versions` に修正
```

**Feature:**
```
feat(auth): ログイン失敗時のレート制限を追加

- `LoginRequest` に試行回数のバリデーションを追加
- 超過時に `429 Too Many Requests` を返すよう `LoginController` を修正
- `tests/Feature/Auth/LoginRateLimitTest.php` を追加
```

**Refactor:**
```
refactor(order): 注文金額計算ロジックをサービスクラスへ移動

- `OrderTotalCalculator` を新規作成
- `OrderController` から金額計算処理を削除し、サービスを呼び出すよう変更
```

## Out of scope

- Merge commits, revert, cherry-pick, and other non-standard commits
- Push to remote (only when explicitly requested; follow user rules separately)
