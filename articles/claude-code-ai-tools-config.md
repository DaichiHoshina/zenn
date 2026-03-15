---
title: "Claude Codeをガチで使い倒すための設定管理術"
emoji: "⚙️"
type: "tech"
topics: ["claudecode", "ai", "devtools", "cli", "productivity"]
published: false
---

## Claude Codeの設定、散らばってませんか？

Claude Codeを使い込んでいくと、スラッシュコマンドを自作したり、Hooksで自動化を入れたり、プロジェクトごとのガイドラインを書いたりと、設定がどんどん増えていきます。

でもこれ、全部 `~/.claude/` に入ってるんですよね。PCを移行したら消える。チームメンバーに共有もできない。「あの設定どこに書いたっけ」になる。

そこで、Claude Codeの設定をまるごとGitリポジトリで管理して、どのマシンでも同じ開発体験を再現できるようにしました。

https://github.com/DaichiHoshina/ai-tools

この記事では、このリポジトリ（ai-tools）の構成と、各機能の使い方を紹介します。

## 全体像

```
ai-tools/
└── claude-code/
    ├── commands/        # 27個のスラッシュコマンド
    ├── skills/          # 20個のスキル定義
    ├── agents/          # 9個のエージェント定義
    ├── guidelines/      # 35個の言語・設計ガイドライン
    ├── hooks/           # 12個のイベントHook
    ├── rules/           # Markdownルール等
    ├── output-styles/   # 返信フォーマット定義
    ├── install.sh       # 初回インストール
    └── sync.sh          # 設定同期
```

`install.sh` を実行すると、これらが `~/.claude/` 配下にリンクされます。リポジトリで管理しているので、`git pull` するだけで最新の設定が手に入ります。

## コマンド（commands/）

Claude Codeのスラッシュコマンドは、`~/.claude/commands/` にMarkdownファイルを置くだけで自作できます。

### 3つの基本コマンド

迷ったらこの3つだけ覚えればOKです。

| コマンド | 用途 | いつ使う |
|---------|------|---------|
| `/flow` | 万能 | タスクを丸投げしたいとき |
| `/dev` | 実装専用 | やることが明確なとき |
| `/review` | レビュー | 変更を確認したいとき |

### `/flow` の動き

`/flow ユーザー認証機能を追加して` と打つと、内部でこういう流れが自動実行されます。

```mermaid
flowchart LR
    A[/flow] --> B[タスク判定]
    B --> C[PRD作成]
    C --> D[設計]
    D --> E[実装]
    E --> F[テスト]
    F --> G[レビュー]
    G --> H[PR作成]
```

タスクの内容を自動判定して、必要なステップだけ実行してくれます。単純なバグ修正ならPRD作成はスキップして直接実装に入る、みたいな感じですね。

### その他のコマンド

よく使うものをいくつか紹介します。

```bash
/prd ユーザー認証機能を追加したい   # 対話式で要件整理→PRD生成
/diagnose この認証エラーを修正      # ログ解析→原因特定→修正提案
/commit                             # diff分析→コミットメッセージ自動生成
/git-push --main                    # commit→push→PR作成を一括
/review-fix-push                    # レビュー→修正→pushを一気に
```

コマンドの中身はただのMarkdownファイルなので、自分のワークフローに合わせて自由にカスタマイズできます。

## スキル（skills/）

コマンドが「何をするか」の定義だとすると、スキルは「どうやるか」の知識です。

### コマンドとスキルの違い

| | コマンド | スキル |
|--|---------|--------|
| 呼び出し | ユーザーが `/xxx` で直接呼ぶ | コマンドやHookから自動呼び出し |
| 役割 | ワークフロー定義 | 専門知識・判断基準 |
| 例 | `/review` | `comprehensive-review`（7観点レビュー） |

### ガイドライン自動読み込み

`load-guidelines` というスキルが、プロジェクトの技術スタックを検出して、必要なガイドラインだけを自動で読み込みます。

```
プロンプト: "Go APIのバグを修正してください"
↓ 自動検出
🔍 Tech stack detected: go
💡 Applied: golang.md, clean-architecture.md
```

Go、TypeScript、React、Terraform など、言語・フレームワークごとのガイドラインを用意しています。全部手動で指定する必要はなくて、勝手に適用されます。

## Hooks（hooks/）

Hooksは、Claude Codeの特定のイベントに反応して自動実行されるスクリプトです。ここが一番面白いところだと思います。

### 主要なHook

| Hook | タイミング | やってること |
|------|-----------|-------------|
| `UserPromptSubmit` | プロンプト送信時 | 技術スタック検出、スキル推奨 |
| `PreToolUse` | ツール実行前 | 危険操作の検出・ブロック |
| `PreCompact` | コンパクション前 | コンテキストの自動バックアップ |
| `SessionEnd` | セッション終了時 | 統計ログ、完了通知音 |

### PreToolUse: 危険操作ブロック

例えば、`git push --force` や `rm -rf` みたいな危険なコマンドを実行しようとすると、Hookが検出してブロックしてくれます。GitHub Actionsのワークフローファイルを編集するときは、セキュリティリスクの注意喚起も自動で表示されます。

### SessionEnd: 完了通知音

長いタスクを実行中に別の作業をしてることが多いので、セッション終了時に通知音を鳴らすようにしています。地味ですが結構便利です。

## エージェント（agents/）

`/flow` コマンドの裏側では、複数のエージェントが協調して動いています。

```
PO Agent          → 要件分析、アーキテクチャ設計
  └→ Manager Agent  → タスク分割、配分計画
      └→ Developer Agent × n  → 実装（並列実行可能）
      └→ Reviewer Agent       → コードレビュー
```

それぞれのエージェントにMarkdownで役割と制約を定義しています。例えばDeveloper Agentには「Serena MCPを必須使用」「実装に集中し設計判断はManagerに委ねる」といったルールが書かれています。

単純なタスクなら `/dev` で直接実行した方が速いですが、複数ファイルにまたがる大きなタスクでは、このマルチエージェント構成が効いてきます。

## 同期の仕組み

### install.sh: 初回セットアップ

```bash
git clone https://github.com/DaichiHoshina/ai-tools.git ~/ai-tools
cd ~/ai-tools && ./claude-code/install.sh
```

これだけで `~/.claude/` 配下にコマンド・スキル・Hooks・ガイドラインが全部セットアップされます。

### sync.sh: 双方向同期

```bash
# リポジトリの変更をローカルに反映
./claude-code/sync.sh to-local

# ローカルの変更をリポジトリに反映
./claude-code/sync.sh from-local

# 差分確認
./claude-code/sync.sh diff
```

新しいPCをセットアップするときも `git clone` → `install.sh` で完了です。チームメンバーにも同じリポジトリを共有すれば、全員が同じClaude Code環境で開発できます。

## おわりに

Claude Codeの設定をリポジトリで管理するようにしてから、「あの設定どこだっけ」がなくなりました。新しいコマンドやスキルを思いついたらMarkdownを書いてpushするだけなので、設定を育てていく感覚が楽しいです。

コマンド27個、スキル20個、Hook12個と数は多いですが、最初は `/flow`、`/dev`、`/review` の3つだけ覚えれば十分です。使っていくうちに「ここ自動化したいな」と思ったらHookを追加して、「この判断基準を共有したいな」と思ったらスキルを追加する、という感じで少しずつ増やしていけばいいと思います。

リポジトリは公開しているので、興味があれば覗いてみてください！

https://github.com/DaichiHoshina/ai-tools
