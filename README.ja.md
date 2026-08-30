# Git Graph Ray

[English](README.md) | [日本語](README.ja.md)

リポジトリの Git グラフを表示し、そこから Git 操作を実行できます。

![Git Graph Ray](resources/screenshot001.png)

コマンドパレット（**Git Graph Ray: View Git Graph**）、SCM のタイトルバー、またはステータスバーからグラフを開けます。コミット、ブランチ、タグ、リモート、stash、worktree をまとめて表示し、エディタを離れずに履歴の確認と操作ができます。

## 機能

- **コミットグラフ** — 色分けされたブランチ、マージ、ref を仮想スクロールの表（説明、Author、日付、ハッシュ）で表示します。
- **コミット詳細** — メタデータ、親コミット、ファイル変更を Tree / List で表示します。グラフから diff やリビジョンを開けます。
- **Git 操作** — ブランチ、merge、rebase、cherry-pick、revert、reset、tag、stash、pull/push、worktree をグラフから実行できます。
- **リポジトリと worktree** — 入れ子のリポジトリを検出し、フォルダの追加・非表示ができます。worktree は独立したリポジトリとして扱います。
- **フィルタとナビゲーション** — ブランチ / リモート / タグの複数選択、HEAD へのジャンプ、検索、マージコミットのミュート、スクロール時の追加読み込みに対応します。
- **テーマ** — Classic、Ray、Ray Wave、Ray Cycle などのグラフテーマがあります。

## 必要環境

- Visual Studio Code 1.128 以降
- PATH 上で利用できる Git

## コマンド

| コマンド | 説明 |
| --- | --- |
| **Git Graph Ray: View Git Graph** | 現在のワークスペースのグラフを開く |
| **Git Graph Ray: Fetch from Remote(s)** | リモートを fetch してグラフを開く |
| **Git Graph Ray: Add Git Repository...** | 自動検出されなかったリポジトリを追加する |
| **Git Graph Ray: Remove Git Repository...** | グラフからリポジトリを非表示にする |

## ライセンス

[MIT](https://github.com/nohi/git-graph-ray)
