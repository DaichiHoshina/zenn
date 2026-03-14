# Zenn コンテンツリポジトリ

Zenn記事・本の管理リポジトリ。GitHub連携で`main`ブランチへのpush時に自動デプロイ。

## コマンド

| コマンド | 説明 |
|----------|------|
| `bun run new:article` | 新しい記事を作成 |
| `bun run list` | 記事一覧を表示 |
| `bun run status` | ステータス確認 |
| `bun run preview` | ローカルプレビュー (localhost:8000) |

### 記事作成オプション

```bash
bun run new:article -- --title "タイトル" --topics "bun,typescript" --type tech
```

## ディレクトリ構造

```
articles/   Zenn記事 (Markdown)
books/      Zenn本
scripts/    管理ツール
```

## ワークフロー

1. `bun run new:article` で記事作成
2. `bun run preview` でプレビュー確認
3. frontmatterの`published: true`に変更して公開
4. `main`にpushでZennに自動デプロイ
