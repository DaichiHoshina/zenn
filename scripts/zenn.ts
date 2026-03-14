import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ARTICLES_DIR = join(import.meta.dir, "../articles");
const BOOKS_DIR = join(import.meta.dir, "../books");

interface ArticleFrontmatter {
  title: string;
  emoji: string;
  type: string;
  topics: string[];
  published: boolean;
  slug: string;
  filename: string;
}

function parseFrontmatter(
  content: string,
  filename: string,
): ArticleFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {
      title: "",
      emoji: "",
      type: "",
      topics: [],
      published: false,
      slug: "",
      filename,
    };
  }
  const fm = match[1]!;
  const get = (key: string) => {
    const m = fm.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"));
    return m?.[1] ?? "";
  };
  const topicsMatch = fm.match(/^topics:\s*\[(.+?)\]/m);
  const topics = topicsMatch?.[1]
    ? topicsMatch[1].split(",").map((t) => t.trim().replace(/["']/g, ""))
    : [];
  const slug = filename.replace(/\.md$/, "");

  return {
    title: get("title"),
    emoji: get("emoji"),
    type: get("type"),
    topics,
    published: get("published") === "true",
    slug,
    filename,
  };
}

async function listArticles(): Promise<ArticleFrontmatter[]> {
  let files: string[];
  try {
    files = (await readdir(ARTICLES_DIR)).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const articles: ArticleFrontmatter[] = [];
  for (const file of files) {
    const content = await Bun.file(join(ARTICLES_DIR, file)).text();
    articles.push(parseFrontmatter(content, file));
  }
  return articles.sort((a, b) => a.filename.localeCompare(b.filename));
}

async function cmdList() {
  const articles = await listArticles();
  if (articles.length === 0) {
    console.log("記事がありません。`bun run new:article` で作成してください。");
    return;
  }
  console.log(`\n記事一覧 (${articles.length}件)\n${"─".repeat(60)}`);
  for (const a of articles) {
    const status = a.published ? "公開" : "下書";
    const topics = a.topics.length > 0 ? a.topics.join(", ") : "-";
    console.log(`  [${status}] ${a.emoji || " "} ${a.title || "(無題)"}`);
    console.log(`        slug: ${a.slug}  topics: ${topics}`);
  }
  console.log();
}

async function cmdStatus() {
  const articles = await listArticles();
  const published = articles.filter((a) => a.published);
  const drafts = articles.filter((a) => !a.published);

  console.log(`\nステータス\n${"─".repeat(40)}`);
  console.log(`  記事総数:   ${articles.length}`);
  console.log(`  公開済み:   ${published.length}`);
  console.log(`  下書き:     ${drafts.length}`);

  if (drafts.length > 0) {
    console.log(`\n下書き記事:`);
    for (const d of drafts) {
      console.log(`  - ${d.emoji || " "} ${d.title || "(無題)"}  (${d.slug})`);
    }
  }

  // books
  let bookCount = 0;
  try {
    const bookDirs = await readdir(BOOKS_DIR);
    bookCount = bookDirs.filter((d) => !d.startsWith(".")).length;
  } catch {}
  console.log(`  本:         ${bookCount}`);
  console.log();
}

async function cmdNew() {
  const args = process.argv.slice(3);

  // Parse options
  let title = "";
  let emoji = "";
  let type = "tech";
  let topics: string[] = [];
  let published = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--title" && args[i + 1]) title = args[++i]!;
    else if (arg === "--emoji" && args[i + 1]) emoji = args[++i]!;
    else if (arg === "--type" && args[i + 1]) type = args[++i]!;
    else if (arg === "--topics" && args[i + 1]) topics = args[++i]!.split(",");
    else if (arg === "--published") published = true;
  }

  // Generate slug
  const slug = generateSlug();

  // Pick random emoji if not specified
  if (!emoji) {
    const emojis = [
      "📝",
      "🚀",
      "💡",
      "🔧",
      "📚",
      "🎯",
      "⚡",
      "🔥",
      "🌟",
      "🛠️",
      "📖",
      "🧪",
      "🎨",
      "🔍",
      "💻",
    ];
    emoji = emojis[Math.floor(Math.random() * emojis.length)]!;
  }

  const frontmatter = `---
title: "${title}"
emoji: "${emoji}"
type: "${type}"
topics: [${topics.map((t) => `"${t}"`).join(", ")}]
published: ${published}
---

`;

  const filepath = join(ARTICLES_DIR, `${slug}.md`);
  await Bun.write(filepath, frontmatter);
  console.log(`\n記事を作成しました: articles/${slug}.md`);
  console.log(`  slug:  ${slug}`);
  console.log(`  emoji: ${emoji}`);
  console.log(`  type:  ${type}`);
  if (title) console.log(`  title: ${title}`);
  console.log(`\nプレビュー: bun run preview\n`);
}

function generateSlug(): string {
  const chars = "0123456789abcdef";
  let slug = "";
  for (let i = 0; i < 16; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

// Main
const command = process.argv[2];

switch (command) {
  case "new":
    await cmdNew();
    break;
  case "list":
    await cmdList();
    break;
  case "status":
    await cmdStatus();
    break;
  default:
    console.log(`
Zenn管理ツール

コマンド:
  new      新しい記事を作成
  list     記事一覧を表示
  status   ステータスを表示

new のオプション:
  --title <title>      タイトル
  --emoji <emoji>      絵文字
  --type <tech|idea>   記事タイプ (デフォルト: tech)
  --topics <a,b,c>     トピック（カンマ区切り）
  --published          公開状態で作成

使用例:
  bun scripts/zenn.ts new --title "Bunの使い方" --topics "bun,typescript"
  bun scripts/zenn.ts list
  bun scripts/zenn.ts status
`);
}
