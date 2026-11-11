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
| `git-graph-ray.view` | グラフを開く。`startup.repoOfActiveFile` ならアクティブ文書のリポジトリ優先 |
| `git-graph-ray.contributors` | Contributors タブを開く。人ごとのコミット数と追加・削除行数。Author タブは author date、Committer タブは committer date で、直近 7 / 30 / 90 日、12 か月、任意の期間に絞る。グラフの Contributor ポップオーバーの Activity からも開く |
| `git-graph-ray.fetch` | グラフを開き全リモート fetch |
| `git-graph-ray.addGitRepository` | フォルダ選択して手動追加し開く |
| `git-graph-ray.removeGitRepository` | QuickPick で hidden に追加 |
| `git-graph-ray.clearAvatarCache` | アバターキャッシュ削除 |
| `git-graph-ray.version` | `Git Graph Ray v{version}` と `{git --version}` を1行ずつ。Copy で同じ文字列をコピー。Git を実行できないときは2行目が `Git version unavailable` |
| `git-graph-ray.openFile` | Diff 上の `git-graph-ray-file` から実ファイルを開く |
| `git-graph-ray.graph.refresh` / `git-graph-ray.graph.scrollToStash` | グラフにフォーカスがあるときのキー割り当て用（§6 ショートカット） |

- ステータスバー「Git Graph Ray」→ view
- SCM タイトルに view（`startup.scmButton`: `bar` はタイトルバー、`menu` はオーバーフロー）
- ピンしたグラフタブは起動時に再オープン・再ピン
- webview を隠しても保持するかは `startup.keepWebview`。変えると開いているグラフタブと Contributors タブを開き直す

## 4. リポジトリ

- `startup.searchDepth` まで探索。worktree パスは独立リポジトリ
- 手動追加・hidden 除外
- ドロップダウン順は `startup.repoOrder`（`workspace` / `name` / `path`）
- `.git` 変更を約 400ms デバウンスで再読込。アクション実行中は静穏。静穏中に HEAD や refs が変わったときも、`history.autoRefresh`（既定オン）ならそのあと再読込する。Source Control の commit と amend の直後も同じ設定で再読込する。オフならその自動再読込はしない
- per-repo: 非表示 remote、Issue Linking、PR。remote / stash / tag / worktree / reflog / first parent は、そのリポジトリの値が `history.*` と違うときだけ保存する。同じ値なら `history.*` に戻る

## 5. グラフデータ

- `git log`（件数 `history.pageSize` / `history.pageMore`、どちらも 1 以上、順序 `date` | `author` | `topo`）
- mailmap、ブランチ複数選択または Show All、remote heads、stash/tag/worktree refs
- 未コミット行と未追跡。他 worktree パスは status から除外
- 追加読み込み自動可
- mute: merge、HEAD 非祖先
- ログは subject のみ。body は詳細時
- アバターは設定オン時 GitHub / GitLab / Gravatar / イニシャル

## 6. グラフ UI

- sticky ツールバー: リポジトリ、ブランチ/remote/tag の詮索付きマルチセレクト、Fetch、Jump HEAD、Refresh、Find、Graph Settings（スライダー）、Repo Settings（歯車）、Help
- 列: Graph と Description は常時。切替可: Author、Author Date、Commit、Committer、Committer Date
- `when.format` を両日付列に適用。日付の種類を一つに絞る設定はない
- 初期: Committer と Committer Date のみ非表示。列ヘッダ右クリックで切替。幅ドラッグ、ダブルクリックでリセット
- 仮想スクロール、行クリックで詳細、再クリックで閉じる、Ctrl/Cmd+クリックで比較
- テーマ `graph.theme`: `classic` / `Ray` / `Ray Wave` / `Ray Cycle` / `Ray Stream`
- 背景 `graph.background`: `auto` / `dark` / `light`、既定 `dark`。`dark` と `light` は VS Code のテーマと OS の外観に関係なく固定。`auto` は VS Code がページに付けるテーマのクラスに従う
- `graph.lanePriority`: ブランチ glob → 数値。大きいほどその線を左に固定する。第一親で一本のときラベルより上も含む。先端まで左列は空く。同点は上にある線、次に名前。`*` は `/` を含む。リモートは `origin/name` と `remotes/origin/name` も比較し、最大値が勝つ。0 以下は予約しない。未設定は従来の列。Graph Settings で追加・編集・削除する
- ショートカット: Find `mod+f`、Refresh `mod+r`、HEAD `mod+h`、stash `mod+s`。空文字ならその操作は無効。Refresh と stash が既定値のときは VS Code のキー割り当てにも登録し、グラフにフォーカスがある間は Open Recent / Reload Window / Save より優先する。stash の既定値では Ctrl/Cmd+Shift+S で前の stash へ移る
- 開いているグラフは設定変更を受ける。見た目は描き直し、コミットやリポジトリ一覧の条件が変わったときは再読込する。グラフ上の編集は、いま表示に使われているユーザ設定またはワークスペース設定へ書く
- Escape は1回で1層だけ閉じる: 確認ダイアログ → 開いているポップオーバー（Find、Graph Settings、フィルタ、Undo / Redo 履歴、列メニューなど）→ 複数選択 → 詳細。ポップオーバーを閉じても詳細は開いたまま

## 7. 詳細と比較

- `details.place` は `inline` または `bottom`。高さ自動（min 88、既定上限 300）。sash、ダブルクリックで自動復帰
- メタ: hash コピー、Parents ナビ、Author/Committer、日付、subject/body、Issue リンク
- 詳細のメッセージ・メタ・余白の右クリックは Copy（開いた時点の選択範囲）。選択が空なら Copy は無効。ファイル行とフォルダはそれぞれのメニュー。グラフの空白は Apply patch のまま
- ファイル Tree（compact folders）または List。Diff / リビジョン表示 / パスコピー / 作業ツリーを開く
- Diff は `git-graph-ray-file`
- 2件比較は既定で共通親から（Since diverge）。ファイル一覧は片側だけの変更と両側で変わったファイルに分け、各セクションは折りたためる。Tree では両側で変わったファイルも同じフォルダツリーに置き、側ごとに1行。ファイルを開くとその側の共通親からの diff を出し、もう片側の変更を削除として見せない。セクションは色分けし、比較相手がブランチなら見出しは短縮ハッシュではなくブランチ名。Snapshot で2リビジョン間の直接の差分に切り替える。共通親がない比較は直接の差分のまま
- 署名は一覧の Signature 列と、詳細の Committer Date 直下の折りたたみ行（内容は §11 末尾）

## 8. Git 操作

ダイアログの初期値は `actions`。ref 入力のスペース置換は `actions.nameSpaces`（`keep` / `hyphen` / `underscore`）。

- Worktree: 開く（同/新窓）、削除（メイン以外）、追加
- Stash: apply/pop/branch/drop、未コミット全体、または詳細で Ctrl/Cmd+クリックしたファイルだけ
- Tag: add/delete/push/rebase interactive
- Branch: create/checkout/rename/delete/merge/rebase/rebase interactive/push/PR
- Remote: checkout/delete/fetch-into/merge/pull（rebase / no-ff / squash）/rebase interactive/PR
- Uncommitted: stash/reset/clean/SCM、パッチ作成、パッチ適用
- Commit: tag/branch/checkout/cherry-pick/revert/drop（親1）/merge/rebase/reset/worktree/copy/reword、パッチ作成、パッチ適用
- 選んだローカルブランチの rebase 先はローカルブランチ、リモートブランチ、タグ、コミット。対話 rebase はコミットに加え、ローカルブランチ、リモートブランチ、タグのラベルから。現在のブランチ自身は対話 rebase の対象にしない
- ファイル: 未コミットの選択ファイルは stash またはパッチ。コミット上の選択ファイルはパッチ
- Shift+クリックでグラフ上の範囲を選ぶ。Ctrl/Cmd+クリックで個別に追加・解除でき、連続していなくてもよい。2件のときはその差分を開き、3件以上では詳細を閉じる。右クリックで cherry-pick。マージは除き、古い順
- 進行中の merge / rebase / cherry-pick / revert / `git am` は衝突ファイル名から VS Code のマージエディタを開く
- 自動 fetch は `fetch.auto`（既定オフ）。間隔は `fetch.everySeconds`（既定 180 秒、最小 15）
- Reword: Git >= 2.54 のみ。未満はメニュー非表示。履歴書き換え時は確認
- 対話 rebase は統合ターミナル。シェルは `terminal.shell`。空なら統合ターミナルの既定。rebase が成功したらそのターミナルを閉じる。止まったときは開いたまま。askpass は InputBox

## 9. Repository Settings

- Remotes CRUD
- Issue Linking（regex + URL、グローバル）
- PR: GitHub / GitLab / Bitbucket + custom providers
- Graph Settings: Appearance（theme、background、Ray Cat）、General（表示、fetch prune、auto fetch、Source Control コミット後の再読込、Undo プレビュー）、Graph lane priority

## 10. Code Review

作らない。

## 11. 設定

`startup.searchDepth`、`startup.repoOrder`、`startup.repoOfActiveFile`、`startup.editorColumn`、`startup.statusBar`、`startup.scmButton`、`startup.keepWebview`、`startup.scrollToHead`、`startup.onlyCheckedOut`、`startup.branches`、`history.pageSize` / `pageMore` / `autoPage` / `autoRefresh` / `order`、`history.mailmap`、`history.remoteHeads` / `uncommitted` / `untracked` / `remotes` / `stashes` / `tags` / `worktrees` / `tagOnlyCommits`、`history.muteMerges` / `dimNotOnHead` / `reflog` / `firstParent` / `avatars` / `openCircle`、`fetch.prune` / `pruneTags` / `auto` / `everySeconds` / `tagCacheSeconds`、`details.maxHeight` / `place` / `files` / `foldSingleFolders` / `markdown`、`graph.palette` / `bend` / `theme` / `background` / `lanePriority`、`when.format`、`columns`、`keys.find` / `refresh` / `head` / `stash`、`pullRequests`、`actions`、`branches.globs`、`emoji`、`menus`、`labels.layout` / `combine` / `remote` / `colors`（ブランチ・タグ名の glob → ラベル色。`*` は `/` を含む。先勝ち。グラフの右クリックからも編集でき、初期値はその名前）、`sign.commits` / `sign.tags`、`files.encoding`、`terminal.shell`、`refs.branchSort` / `tagSort` / `listLimit`、`rayCat.enabled` / `count`、`undo.preview`

一覧の Signature 列は有無と種類のみ。詳細は Committer Date 直下の折りたたみ行で、検証結果（status / signer / key / fingerprint / primary / trust）に加え、SSH は鍵の種類・ハッシュ・名前空間、GPG は署名時刻・公開鍵アルゴリズム・ハッシュ・鍵と署名の有効期限を表示する。

## 12. 決定済み

1. Reword は Git 2.54 未満で非表示
2. 日付は Author Date と Committer Date。`when.format` のみ
3. テーマは `graph.theme` の1 enum
4. 初期列は Committer / Committer Date 以外を表示
