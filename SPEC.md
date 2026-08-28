# Git Graph Ray 実装仕様

この文書が再実装の唯一の仕様である。識別子は `git-graph-ray`。Code Review は作らない。webview は UI フレームワークなしの Pure TypeScript と Baseline 2026 の HTML/CSS。

## 1. 製品識別

- 拡張 ID: `nohi.git-graph-ray`
- displayName: Git Graph Ray
- 設定プレフィックス: `git-graph-ray.*`
- Custom Editor `viewType`: `git-graph-ray.graph`
- URI: `git-graph-ray:/graph?root=<repoPath>`
- Diff スキーム: `git-graph-ray-file`
- ライセンス: MIT
- 旧 `git-graphn` 互換は持たない

## 2. アーキテクチャ

- **host**: コマンド、Custom Editor、git 実行、askpass、discover、永続化
- **webview**: グラフ・表・ダイアログ。ホストに git を直接叩かせない。ランタイム UI ライブラリなし
- **shared**: RPC と純粋関数のみ
- **ビルド**: TypeScript のバンドルのみ（Vite は開発時依存）

### 2.1 Webview

- Solid / React / Vue / Lit は使わない。TS は状態・仮想スクロール・グラフ座標・RPC に限る
- Baseline 2026 を積極採用。webview Chromium が足りない機能は feature detect。ランタイム polyfill パッケージは原則入れない
- モーダルは `<dialog>` + `command` / `commandfor`
- Find / Settings / Help / メニューは `[popover]`
- 設定の折りたたみは `<details>`
- 検索は `<search>` と `<input type="search">`
- 表は CSS Grid。行は `content-visibility: auto` 可
- グラフ線は SVG。座標計算は TS

## 3. コマンド

| ID | 仕様 |
| --- | --- |
| `git-graph-ray.view` | グラフを開く。`openToTheRepoOfTheActiveTextEditorDocument` ならアクティブ文書のリポジトリ優先 |
| `git-graph-ray.fetch` | グラフを開き全リモート fetch |
| `git-graph-ray.addGitRepository` | フォルダ選択して手動追加し開く |
| `git-graph-ray.removeGitRepository` | QuickPick で hidden に追加 |
| `git-graph-ray.clearAvatarCache` | アバターキャッシュ削除 |
| `git-graph-ray.version` | `Git Graph Ray v{version}` |
| `git-graph-ray.openFile` | Diff 上の `git-graph-ray-file` から実ファイルを開く |

- ステータスバー「Git Graph Ray」→ view
- SCM タイトルに view（Inline / More Actions）
- ピンしたグラフタブは起動時に再オープン・再ピン
- フェーズ1–7では webview コンテキスト常時保持。`retainContextWhenHidden` はフェーズ8

## 4. リポジトリ

- `maxDepthOfRepoSearch` まで探索。worktree パスは独立リポジトリ
- 手動追加・hidden 除外
- ドロップダウン順: Name / Full Path。Workspace Full Path はフェーズ8
- `.git` 変更を約 400ms デバウンスで再読込。アクション直後は静穏
- per-repo: remotes 表示、Issue Linking、PR、show* 上書き

## 5. グラフデータ

- `git log`（件数 initialLoad / loadMore、順序 date | author-date | topo）
- mailmap、ブランチ複数選択または Show All、remote heads、stash/tag/worktree refs
- 未コミット行と未追跡。他 worktree パスは status から除外
- 追加読み込み自動可
- mute: merge、HEAD 非祖先
- ログは subject のみ。body は詳細時
- アバターは設定オン時 GitHub / GitLab / Gravatar / イニシャル

## 6. グラフ UI

- sticky ツールバー: リポジトリ、ブランチ/remote/tag の詮索付きマルチセレクト、Fetch、Jump HEAD、Refresh、Theme、Find、Repo Settings、Help
- 列: Graph と Description は常時。切替可: Author、Author Date、Commit、Committer、Committer Date
- `date.format` を両日付列に適用。`date.type` なし
- 初期: Committer と Committer Date のみ非表示。列ヘッダ右クリックで切替。幅ドラッグ、ダブルクリックでリセット
- 仮想スクロール、行クリックで詳細、再クリックで閉じる、Ctrl/Cmd+クリックで比較
- テーマ `graph.theme`: `classic` / `Ray` / `Ray Wave` / `Ray Cycle`
- ショートカット: Find F、Refresh R、HEAD H、stash S（Shift で逆）。UNASSIGNED なら無効
- Escape: ダイアログ → 設定 → メニュー/Find/詳細

## 7. 詳細と比較

- Inline または Docked to Bottom。高さ自動（min 88、既定上限 300）。sash、ダブルクリックで自動復帰
- メタ: hash コピー、Parents ナビ、Author/Committer、日付、subject/body、Issue リンク
- ファイル Tree（compact folders）または List。Diff / リビジョン表示 / パスコピー / 作業ツリーを開く
- Diff は `git-graph-ray-file`

## 8. Git 操作

ダイアログ既定は `dialog.*`。ref 入力のスペース置換あり。

- Worktree: 開く（同/新窓）、削除（メイン以外）、追加
- Stash: apply/pop/branch/drop、未コミットから stash
- Tag: add/delete/push
- Branch: create/checkout/rename/delete/merge/rebase/push/PR
- Remote: checkout/delete/fetch-into/pull/PR
- Uncommitted: stash/reset/clean/SCM
- Commit: tag/branch/checkout/cherry-pick/revert/drop（親1）/merge/rebase/reset/worktree/copy/reword
- Reword: Git >= 2.54 のみ。未満はメニュー非表示。履歴書き換え時は確認
- 対話 rebase は統合ターミナル。askpass は InputBox
- `integratedTerminalShell` はフェーズ8

## 9. Repository Settings

- General: remotes / stashes / tags / worktrees / reflogs / first-parent
- Remotes CRUD、Fetch、Prune
- Issue Linking（regex + URL、グローバル）
- PR: GitHub / GitLab / Bitbucket + custom providers

## 10. Code Review

作らない。

## 11. フェーズ1–7で効く設定

`maxDepthOfRepoSearch`、`repositoryDropdownOrder`、`openToTheRepoOfTheActiveTextEditorDocument`、`openNewTabEditorGroup`、`showStatusBarItem`、`sourceCodeProviderIntegrationLocation`、commits の initialLoad/loadMore/loadMoreAutomatically/order、mailmap、showRemoteHeads/Uncommitted/Untracked/RemoteBranches/Stashes/Tags/Worktrees、fetchAndPrune、fetchAvatars、mute、reflogs、firstParent、details location/fileView/compactFolders、graph colours/style/uncommittedChanges/theme、date.format、defaultColumnVisibility、keyboardShortcut.*、customPullRequestProviders、dialog.*

## 12. フェーズ8設定

- `commitDetailsView.autoCenter`
- `enhancedAccessibility`
- `markdown`
- `customBranchGlobPatterns`
- `repository.onLoad.showCheckedOutBranch` / `showSpecificBranches` / `scrollToHead`
- `referenceLabels.alignment` / `combineLocalAndRemoteBranchLabels`
- `repository.showCommitsOnlyReferencedByTags`
- `repository.commits.showSignatureStatus`
- `repository.sign.commits` / `sign.tags`
- `fileEncoding`
- `contextMenuActionsVisibility`
- `customEmojiShortcodeMappings`
- `tabIconColourTheme`
- `retainContextWhenHidden`
- `integratedTerminalShell`
- `repositoryDropdownOrder` の Workspace Full Path

## 13. 決定済み

1. Reword は Git 2.54 未満で非表示
2. 日付は Author Date と Committer Date。`date.format` のみ
3. テーマは `graph.theme` の1 enum
4. 初期列は Committer / Committer Date 以外を表示
