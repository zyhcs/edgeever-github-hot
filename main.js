/**
 * EdgeEver GitHub Hot Digest & Benchmark Plugin
 * 开源热搜日报 / 周刊 / 月刊 & 竞品选型横向对比调研
 * 聚合 GitHub 实时开源热榜（日榜/周榜/月榜）与自定义关键词检索（如 EdgeEver 对标知识库、AI Agent 等），
 * 通过 EdgeEver 原生 AI 或自定义代理深度提炼技术亮点、横向对比矩阵与生态洞察。
 */

// ==================== 1. 分类配置与基础常量 ====================
const PRESET_CATEGORIES = [
  { id: "all", name: "🔥 全语言总榜", type: "trending", path: "", query: "" },
  {
    id: "custom_notes",
    name: "📝 笔记/知识库 (EdgeEver对标)",
    type: "search",
    query: "markdown note OR knowledge base OR pkm OR local-first editor",
    targetTerm: "开源笔记与知识库系统 (类似 EdgeEver)",
  },
  {
    id: "custom_agent",
    name: "🤖 AI Agent 与工作流",
    type: "search",
    query: "ai agent OR llm workflow OR mcp server",
    targetTerm: "AI Agent 与自主智能体框架",
  },
  { id: "python", name: "🐍 Python (AI/深度学习)", type: "trending", path: "python" },
  { id: "typescript", name: "🔷 TypeScript (全栈/前端)", type: "trending", path: "typescript" },
  { id: "rust", name: "🦀 Rust (高性能/基础设施)", type: "trending", path: "rust" },
  { id: "go", name: "🐹 Go (云原生/后端微服务)", type: "trending", path: "go" },
  { id: "javascript", name: "🟨 JavaScript (现代Web)", type: "trending", path: "javascript" },
  { id: "cpp", name: "⚡ C/C++ (底层引擎/计算)", type: "trending", path: "c++" },
];

const LANG_COLORS = {
  python: "#3572A5",
  typescript: "#3178c6",
  javascript: "#f1e05a",
  rust: "#dea584",
  go: "#00ADD8",
  "c++": "#f34b7d",
  c: "#555555",
  java: "#b07219",
  ruby: "#701516",
  swift: "#F05138",
  shell: "#89e051",
  jupyter: "#DA5B0B",
  html: "#e34c26",
  css: "#563d7c",
};

function getLanguageColor(lang) {
  if (!lang) return "#8b949e";
  const key = String(lang).toLowerCase().trim();
  return LANG_COLORS[key] || "#8b949e";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date) {
  const d = new Date(date || Date.now());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatChineseDate(date) {
  const d = new Date(date || Date.now());
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${year}年${month}月${day}日 ${weekDays[d.getDay()]}`;
}

function formatChineseMonth(date) {
  const d = new Date(date || Date.now());
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function getWeekNumber(date) {
  const d = new Date(date || Date.now());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ==================== 2. 数据抓取通道 (Trending 与 关键词搜索) ====================

// 统一数据抓取入口
async function fetchRepositories(options = {}) {
  const { range = "daily", categoryId = "all", searchQuery = "" } = options;

  // 1. 如果有明确的关键词搜索或者是预设的 search 分类
  const catObj = PRESET_CATEGORIES.find((c) => c.id === categoryId);
  const isSearchMode = Boolean(searchQuery.trim()) || (catObj && catObj.type === "search");

  if (isSearchMode) {
    const q = searchQuery.trim() || (catObj ? catObj.query : "");
    return await searchRepositoriesOnGitHub(q);
  }

  // 2. 否则请求 GitHub Trending（支持 daily / weekly / monthly）
  const langPath = catObj && catObj.path ? encodeURIComponent(catObj.path) : "";
  return await fetchTrendingFromGitHub(range, langPath);
}

// 通道 A：GitHub Trending (日榜 / 周榜 / 月榜)
async function fetchTrendingFromGitHub(range = "daily", langPath = "") {
  const sinceParam = range === "monthly" ? "monthly" : range === "weekly" ? "weekly" : "daily";
  const url = `https://github.com/trending${langPath ? "/" + langPath : ""}?since=${sinceParam}`;

  let html = "";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (res.ok) {
      html = await res.text();
    }
  } catch (err) {
    console.warn("[GitHub Hot] Trending fetch failed, will try search fallback:", err);
  }

  if (html && html.includes("Box-row")) {
    const items = parseTrendingHtml(html, range);
    if (items.length > 0) return items;
  }

  // Fallback 策略
  return await fetchTrendingFallback(range, langPath);
}

function parseTrendingHtml(html, range) {
  const items = [];
  const periodLabel = range === "monthly" ? "本月热搜" : range === "weekly" ? "本周热搜" : "今日热搜";

  if (typeof DOMParser !== "undefined") {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const rows = doc.querySelectorAll("article.Box-row");

      rows.forEach((row, idx) => {
        const repoLink = row.querySelector("h2 a");
        if (!repoLink) return;

        const href = (repoLink.getAttribute("href") || "").trim();
        const fullName = href.replace(/^\//, "");
        if (!fullName || !fullName.includes("/")) return;

        const [owner, repo] = fullName.split("/");
        const descEl = row.querySelector("p");
        const desc = descEl ? descEl.textContent.trim() : "暂无项目描述";

        const langEl = row.querySelector('[itemprop="programmingLanguage"]');
        const language = langEl ? langEl.textContent.trim() : "Other";

        const starLinks = row.querySelectorAll("a.Link--muted");
        let totalStars = "";
        let forks = "";
        if (starLinks.length >= 1) totalStars = starLinks[0].textContent.trim();
        if (starLinks.length >= 2) forks = starLinks[1].textContent.trim();

        const periodEl = row.querySelector("span.d-inline-block.float-sm-right");
        const periodText = periodEl ? periodEl.textContent.trim() : `${periodLabel}推荐`;

        const starMatch = periodText.match(/([\d,]+)\s+stars/i);
        const periodStars = starMatch ? starMatch[1] : totalStars;

        items.push({
          rank: idx + 1,
          owner,
          repo,
          fullName,
          url: `https://github.com/${fullName}`,
          description: desc,
          language,
          languageColor: getLanguageColor(language),
          totalStars,
          forks,
          periodStars,
          periodText,
        });
      });

      if (items.length > 0) return items;
    } catch (e) {
      console.warn("[GitHub Hot] DOMParser parse error:", e);
    }
  }

  // 正则解析 fallback
  const parts = html.split('<article class="Box-row"').slice(1);
  parts.forEach((part, idx) => {
    const repoMatch = part.match(/href="\/([^"\/\s]+\/[^"\/\s]+)"/);
    if (!repoMatch) return;
    const fullName = repoMatch[1].trim();
    const [owner, repo] = fullName.split("/");

    const descMatch = part.match(/<p class="col-9[^>]*>([\s\S]*?)<\/p>/);
    const desc = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
      : "暂无项目描述";

    const langMatch = part.match(/itemprop="programmingLanguage">([^<]+)<\/span>/);
    const language = langMatch ? langMatch[1].trim() : "Other";

    const periodMatch = part.match(/(\d[\d,]*)\s+stars\s+(?:today|this week|this month)/i);
    const periodStars = periodMatch ? periodMatch[1] : "";
    const periodText = periodMatch ? `+${periodMatch[1]} stars` : `${periodLabel}推荐`;

    items.push({
      rank: idx + 1,
      owner,
      repo,
      fullName,
      url: `https://github.com/${fullName}`,
      description: desc,
      language,
      languageColor: getLanguageColor(language),
      totalStars: periodStars,
      forks: "",
      periodStars,
      periodText,
    });
  });

  return items;
}

// 通道 B：GitHub 关键词搜索 (用于特定领域对标，如 edgeever 知识库、agent 等)
async function searchRepositoriesOnGitHub(query) {
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  // 策略 1：拉取 GitHub 现代 Web Search 页面中的 embedded JSON（无频控、字段全）
  try {
    const webUrl = `https://github.com/search?q=${encodeURIComponent(cleanQ)}&type=repositories&s=stars&o=desc`;
    const res = await fetch(webUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (res.ok) {
      const html = await res.text();
      const match = html.match(/data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/);
      if (match) {
        const json = JSON.parse(match[1]);
        const results = json.payload?.blackbirdSearchRoute?.results || json.payload?.results || [];
        if (results.length > 0) {
          return results.map((item, idx) => {
            const fullName = item.hl_name ? item.hl_name.replace(/<\/?em>/g, "") : `${item.repo?.repository?.owner_login}/${item.repo?.repository?.name}`;
            const [owner, repo] = fullName.split("/");
            const desc = (item.hl_trunc_description || item.repo?.repository?.description || "").replace(/<\/?em>/g, "");
            const stars = item.followers || item.repo?.repository?.stargazers_count || 0;
            const lang = item.language || "Other";

            return {
              rank: idx + 1,
              owner: owner || "",
              repo: repo || fullName,
              fullName,
              url: `https://github.com/${fullName}`,
              description: desc || "暂无项目描述",
              language: lang,
              languageColor: item.color || getLanguageColor(lang),
              totalStars: Number(stars).toLocaleString(),
              forks: "",
              periodStars: Number(stars).toLocaleString(),
              periodText: `⭐ ${Number(stars).toLocaleString()} stars`,
              topics: item.topics || [],
            };
          });
        }
      }
    }
  } catch (err) {
    console.warn("[GitHub Hot] Web search failed, trying Search API:", err);
  }

  // 策略 2：GitHub 官方 REST API 兜底
  try {
    const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(cleanQ)}&sort=stars&order=desc&per_page=15`;
    const apiRes = await fetch(apiUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "EdgeEver-GitHub-Hot",
      },
    });

    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.items && data.items.length > 0) {
        return data.items.map((it, idx) => ({
          rank: idx + 1,
          owner: it.owner?.login || "",
          repo: it.name || "",
          fullName: it.full_name || "",
          url: it.html_url || `https://github.com/${it.full_name}`,
          description: it.description || "暂无项目描述",
          language: it.language || "Other",
          languageColor: getLanguageColor(it.language),
          totalStars: it.stargazers_count ? it.stargazers_count.toLocaleString() : "0",
          forks: it.forks_count ? it.forks_count.toLocaleString() : "0",
          periodStars: it.stargazers_count ? it.stargazers_count.toLocaleString() : "0",
          periodText: `⭐ ${it.stargazers_count?.toLocaleString()} stars`,
          topics: it.topics || [],
        }));
      }
    }
  } catch (err) {
    console.error("[GitHub Hot] GitHub Search API error:", err);
  }

  return [];
}

// Trending 备用兜底
async function fetchTrendingFallback(range, langPath) {
  try {
    const days = range === "monthly" ? 30 : range === "weekly" ? 7 : 2;
    const pastDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().split("T")[0];
    const langQuery = langPath ? `+language:${langPath}` : "";
    const searchUrl = `https://api.github.com/search/repositories?q=created:>${pastDate}${langQuery}&sort=stars&order=desc&per_page=15`;

    const res = await fetch(searchUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "EdgeEver-GitHub-Hot",
      },
    });

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.items) return [];

    return data.items.map((repo, idx) => ({
      rank: idx + 1,
      owner: repo.owner?.login || "",
      repo: repo.name || "",
      fullName: repo.full_name || "",
      url: repo.html_url || `https://github.com/${repo.full_name}`,
      description: repo.description || "暂无项目描述",
      language: repo.language || "Other",
      languageColor: getLanguageColor(repo.language),
      totalStars: repo.stargazers_count ? repo.stargazers_count.toLocaleString() : "0",
      forks: repo.forks_count ? repo.forks_count.toLocaleString() : "0",
      periodStars: repo.stargazers_count ? repo.stargazers_count.toLocaleString() : "0",
      periodText: range === "monthly" ? "本月新增关注" : range === "weekly" ? "本周新增关注" : "今日新增关注",
    }));
  } catch (err) {
    console.error("[GitHub Hot] Fallback API error:", err);
    return [];
  }
}

// ==================== 3. AI 提示词工程 (速报 vs 竞品对标调研) ====================
function buildAiPrompt(items, options = {}) {
  const { range = "daily", reportStyle = "digest", categoryName = "全语言总榜", searchTerm = "" } = options;

  const dateStr = formatChineseDate();
  const monthStr = formatChineseMonth();
  const weekNum = getWeekNumber();

  // 判断是否为竞品对标调研报告模式
  const isBenchmark = reportStyle === "benchmark" || Boolean(searchTerm);

  let titleProposal = "";
  if (isBenchmark) {
    const topicLabel = searchTerm || categoryName.replace(/^[^\s]+\s*/, "");
    titleProposal = `《${topicLabel}》开源生态全景调研与竞品横向对比报告 · ${dateStr}`;
  } else if (range === "monthly") {
    titleProposal = `GitHub 开源黑马与技术演进月刊 · ${monthStr}`;
  } else if (range === "weekly") {
    titleProposal = `GitHub 本周开源技术趋势周刊 · 第 ${weekNum} 周 (${dateStr})`;
  } else {
    titleProposal = `GitHub 开源热搜日报 · ${dateStr}`;
  }

  // 竞品对标调研模式专用的 System Prompt
  const benchmarkSystemPrompt = `你是全球开源软件与知识管理技术专家、系统级架构师，擅长针对特定技术赛道（如知识库系统、Markdown 笔记、AI Agent、Local-First 架构等）进行严谨深度、客观专业的竞品横向对比与技术选型调研。

你的任务是为开发者与技术架构师撰写一份高质量的《开源生态全景调研与竞品横向对比报告》。
输入数据为该赛道全网最知名或近期飙升的代表性 GitHub 开源项目列表。

【报告排版与深度架构要求】：
1. 必须直接输出纯粹标准的 Markdown 正文，绝对禁止使用代码块包裹整篇文章。
2. 篇首输出大标题：
   # 🔍 ${titleProposal}
3. 【一、赛道生态现状与演进脉络】：
   深入提炼该领域的发展现状、技术流派分歧（例如以 EdgeEver 为代表的本地优先 Local-First 与云端协作的区别、纯 Markdown 与块级富文本的架构选型、可扩展插件体系等），文字需有很强的专业洞察力。
4. 【二、核心竞品横向对比全景矩阵】（必须输出一张完整的 Markdown 表格）：
   包含列：【项目名称】、【核心技术栈与架构】、【数据存储与离线模式】、【插件/二次开发生态】、【核心杀手级亮点】、【主要局限/不足】、【最适合人群/场景】。
5. 【三、重点标杆项目深度拆解与评测】：
   对入选项目逐一进行深度剖析，二级标题格式：
   ## 01 | 仓库名 · 产品定位与核心哲学
   > 🏷️ **技术栈**：...  ·  ⭐ **Star规模**：...  ·  🔗 **仓库直达**：[完整仓库名](URL)
   - 💡 **为什么开发者选择它（核心击中痛点）**：
   - ⚡ **架构与技术实现亮点（如存储机制、渲染性能、同步方案）**：
   - ⚖️ **与同类标杆（如 EdgeEver / Obsidian / Notion）的核心差异**：
   - 🎯 **典型落地场景与建议**：
   每个项目解读结束后输出一条分割线“---”。
6. 【四、多维度技术选型决策指南】：
   根据不同诉求给出直接明确的选型指引（如：如果你重视 100% 数据隐私与离线优先...；如果你重视全自动化与 AI 插件集成...；如果你需要轻量自托管...）。
7. 【五、总结与前瞻思考】。`;

  // 常规热点速报模式专用的 System Prompt
  const digestSystemPrompt = `你是全球开源软件与系统架构资深技术主编，擅长从 GitHub 代码库中洞察技术演进趋势，提炼高含金量、地道专业的中文技术速评。

你正在撰写一份高质量的《${range === "monthly" ? "开源演进月刊" : range === "weekly" ? "开源技术趋势周刊" : "开源热搜日报"}》。
输入数据为 GitHub 实时热搜项目列表。

【排版与结构要求】：
1. 直接输出标准 Markdown 正文，不要包裹在外部代码块中。
2. 篇首标题：
   # ${range === "monthly" ? "🌕 " : range === "weekly" ? "🚀 " : "🌅 "}${titleProposal}
3. 【🌟 本期生态洞察与技术风向标】：
   提炼 3 条宏观技术趋势观察，粗体开头并附带深度洞察。
4. 【🔥 精选开源黑马深度拆解】：
   按“## 01 | 仓库名 · 一句话精准中文定位”顺序逐一拆解，包含引用信息行（语言、热度增量、仓库链接），以及：
   - 💡 **解决的核心痛点**
   - ⚡ **技术选型与架构亮点**
   - 🎯 **适用场景与探索建议**
   每个项目后使用“---”分割。
5. 【📊 本期热榜全景速览】：Markdown 表格汇总。
6. 【🧭 结语与探索指引】。`;

  const system = isBenchmark ? benchmarkSystemPrompt : digestSystemPrompt;

  const promptData = {
    reportType: isBenchmark ? "Competitive Benchmark Report" : "Trending Digest",
    topic: searchTerm || categoryName,
    range,
    date: dateStr,
    totalItems: items.length,
    repositories: items.map((it, idx) => ({
      rank: idx + 1,
      fullName: it.fullName,
      url: it.url,
      language: it.language,
      stars: it.periodText || it.totalStars,
      totalStars: it.totalStars,
      description: it.description,
      topics: it.topics || [],
    })),
  };

  return { system, prompt: JSON.stringify(promptData, null, 2), titleProposal, isBenchmark };
}

// 调用 AI 模型生成完整 Markdown 报告
async function callAiEngine(context, items, options = {}, progressCallback = () => {}) {
  const { provider = "edgeever", customSettings = {} } = options;
  const { system, prompt, titleProposal, isBenchmark } = buildAiPrompt(items, options);

  progressCallback(
    isBenchmark
      ? "正在汇总多维度竞品指标，启动 AI 进行全景架构与技术选型对比..."
      : "正在构建深度分析数据并连接 AI 引擎..."
  );

  // 1. EdgeEver 客户端原生 AI 模型
  if (provider === "edgeever") {
    if (!context.ai || typeof context.ai.generate !== "function") {
      throw new Error("当前 EdgeEver 版本未检测到 context.ai 模块，请检查客户端或切换为自定义 API 模式。");
    }

    try {
      const status = await context.ai.status();
      if (!status || !status.configured) {
        throw new Error(
          "EdgeEver 尚未配置默认 AI 模型！请在 EdgeEver 工作区左下角「设置 -> AI」中配置模型，或切换为「自定义 OpenAI 兼容代理」。"
        );
      }
    } catch (e) {
      if (e.message && e.message.includes("尚未配置")) throw e;
    }

    progressCallback("EdgeEver AI 模型正在深度推理与构建横向对比矩阵...");
    const res = await context.ai.generate({
      system,
      prompt,
      maxOutputTokens: 7000,
    });

    if (!res || !res.text) {
      throw new Error("EdgeEver AI 生成返回为空，请稍后重试。");
    }

    return { text: res.text, title: titleProposal, isBenchmark };
  }

  // 2. 自定义 OpenAI 兼容代理
  progressCallback("正在向自定义 AI 代理发送深度分析请求...");
  const baseUrl = (customSettings.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = (customSettings.apiKey || "").trim();
  const model = (customSettings.model || "gpt-4o-mini").trim();

  if (!apiKey && !baseUrl.includes("localhost") && !baseUrl.includes("127.0.0.1")) {
    throw new Error("自定义 AI 模式下未提供 API Key，请在设置中配置有效密钥！");
  }

  const endpoint = `${baseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      max_tokens: 5000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`自定义 AI 接口返回异常 (${response.status}): ${errText.slice(0, 150)}`);
  }

  const result = await response.json();
  const text = result?.choices?.[0]?.message?.content || "";
  if (!text) {
    throw new Error("自定义 AI 代理未返回任何有效文本内容。");
  }

  return { text, title: titleProposal, isBenchmark };
}

// ==================== 4. 笔记保存与归档 ====================
async function saveReportToNote(context, reportTitle, reportMarkdown, options = {}) {
  const { range = "daily", isBenchmark = false } = options;
  const todayStr = formatDate();
  const monthStr = formatChineseMonth();
  const weekNum = getWeekNumber();

  // 1. 匹配目标笔记本
  let targetNotebookId = "";
  try {
    const savedId = await context.settings.get("target_notebook_id");
    if (savedId) targetNotebookId = String(savedId);
  } catch (e) {}

  if (!targetNotebookId) {
    try {
      const notebooks = (await context.notebooks.list()) || [];
      const matched = notebooks.find((nb) => /(热榜|开源|日报|weekly|monthly|调研|竞品)/i.test(nb.name));
      if (matched) {
        targetNotebookId = matched.id;
      } else if (notebooks.length > 0) {
        targetNotebookId = notebooks[0].id;
      }
    } catch (e) {
      console.warn("[GitHub Hot] list notebooks failed:", e);
    }
  }

  // 2. 标签分类
  let tags = [];
  if (isBenchmark) {
    tags = ["GitHub热榜", "竞品调研", "技术选型", todayStr];
  } else if (range === "monthly") {
    tags = ["GitHub热榜", "开源月刊", monthStr];
  } else if (range === "weekly") {
    tags = ["GitHub热榜", "开源周报", `W${weekNum}`, todayStr.slice(0, 7)];
  } else {
    tags = ["GitHub热榜", "开源日报", todayStr];
  }

  // 3. 检查当天是否存在同类笔记（智能防重复更新）
  let existingNote = null;
  try {
    const queryTags = isBenchmark ? ["竞品调研", todayStr] : tags.slice(1, 3);
    const queryRes = await context.notes.query({
      notebookId: targetNotebookId || undefined,
      tags: queryTags,
      limit: 5,
    });
    if (queryRes && queryRes.notes && queryRes.notes.length > 0) {
      existingNote = queryRes.notes[0];
    }
  } catch (e) {}

  let finalNoteId = "";
  if (existingNote) {
    await context.notes.update(existingNote.id, {
      title: reportTitle,
      contentMarkdown: reportMarkdown,
      tags,
    });
    finalNoteId = existingNote.id;
  } else {
    const created = await context.notes.create({
      notebookId: targetNotebookId || undefined,
      title: reportTitle,
      contentMarkdown: reportMarkdown,
      tags,
    });
    finalNoteId = created?.id || "";
  }

  return { noteId: finalNoteId, isUpdated: Boolean(existingNote) };
}

// ==================== 4.1 单项目稍后阅读 / 快速收藏 ====================
async function bookmarkRepository(context, item, buttonEl = null) {
  const fullName = item.fullName;
  const now = new Date();
  const dateStr = formatDate(now);
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nowFormat = `${dateStr} ${timeStr}`;

  // 1. 获取收藏设置项
  let bookmarkMode = "inbox";
  let bookmarkNoteTitle = "📌 GitHub 开源项目收藏夹 (稍后阅读)";
  let targetNotebookId = "";

  try {
    const mode = await context.settings.get("bookmark_mode");
    if (mode) bookmarkMode = String(mode);

    const title = await context.settings.get("bookmark_note_title");
    if (title) bookmarkNoteTitle = String(title);

    const nbId = await context.settings.get("target_notebook_id");
    if (nbId) targetNotebookId = String(nbId);
  } catch (e) {}

  if (!targetNotebookId) {
    try {
      const notebooks = (await context.notebooks.list()) || [];
      const matched = notebooks.find((nb) => /(收藏|稍后阅读|热榜|开源|inbox)/i.test(nb.name));
      if (matched) targetNotebookId = matched.id;
      else if (notebooks.length > 0) targetNotebookId = notebooks[0].id;
    } catch (e) {}
  }

  // 2. 模式 A：集中汇总到单个清单笔记 (精美卡片 Blockquote 语法)
  if (bookmarkMode === "inbox") {
    const topicsLine =
      item.topics && item.topics.length > 0
        ? `> 🏷️ **核心标签**：${item.topics.map((t) => "`#" + t + "`").join(" ")}\n`
        : "";

    const cardMarkdown = [
      `> ### 📦 [${item.fullName}](${item.url})`,
      `>`,
      `> - [ ] **阅读评估**：待研读  ·  🏷️ **技术栈**：\`${item.language || "Other"}\`  ·  ⭐ **Star**：${item.periodText || item.totalStars}  ·  📅 **收藏时间**：${nowFormat}`,
      `>`,
      `> 💡 **核心描述**：${item.description || "暂无项目描述"}`,
      topicsLine ? topicsLine.trimEnd() : null,
      `> 📝 **我的随手记 / 调研心得**：（点击此处随时补充想法与评估结论...）`,
      ``,
      `---`,
    ]
      .filter((line) => line !== null && line !== undefined)
      .join("\n");

    // 双重判定当前状态：从按钮类名和全局 Set 即时判定
    const isCurrentlyBookmarked =
      (buttonEl && buttonEl.classList.contains("is-bookmarked")) ||
      bookmarkedReposSet.has(fullName);

    // 全局查找稍后阅读笔记（不限制笔记本文件夹，确保 100% 找到）
    let bookmarkNote = null;
    try {
      const queryRes = await context.notes.query({
        tags: ["GitHub稍后阅读"],
        limit: 10,
      });
      if (queryRes && queryRes.notes && queryRes.notes.length > 0) {
        bookmarkNote = queryRes.notes[0];
      }
    } catch (e) {}

    if (!bookmarkNote) {
      try {
        const queryRes = await context.notes.query({ limit: 50 });
        if (queryRes && queryRes.notes) {
          bookmarkNote = queryRes.notes.find(
            (n) => n.title.includes("GitHub 开源项目收藏夹") || n.title === bookmarkNoteTitle
          );
        }
      } catch (e) {}
    }

    if (isCurrentlyBookmarked) {
      // ===== 执行取消收藏 (Unbookmark) =====
      // 1. 立即响应 UI：变更按钮样式与文本
      if (buttonEl) {
        buttonEl.classList.remove("is-bookmarked");
        buttonEl.innerHTML = "<span>🔖 稍后阅读</span>";
      }
      // 2. 立即清除缓存集合
      bookmarkedReposSet.delete(fullName);
      await context.storage?.set?.("bookmarked_repos", Array.from(bookmarkedReposSet)).catch(() => {});

      // 3. 从笔记中精准移除条目
      if (bookmarkNote) {
        let fullNote = null;
        try {
          fullNote = await context.notes.get(bookmarkNote.id);
        } catch (e) {
          console.warn("[GitHub Hot] context.notes.get error:", e);
        }

        const oldContent =
          fullNote && typeof fullNote.contentMarkdown === "string"
            ? fullNote.contentMarkdown
            : bookmarkNote.contentMarkdown || "";

        const chunks = oldContent.split(/\n+---\n*/).map((c) => c.trim()).filter(Boolean);
        const remainingChunks = chunks.filter(
          (c) =>
            !c.includes(`[${fullName}]`) &&
            !c.includes(`github.com/${fullName}`) &&
            !c.includes(fullName)
        );

        let newContent = "";
        if (remainingChunks.length === 0) {
          newContent = "> 💡 您的稍后阅读清单目前为空。在控制台浏览热榜项目时点击「🔖 稍后阅读」即可快速加入！";
        } else {
          newContent = remainingChunks.map((c) => c + "\n\n---").join("\n\n");
        }

        await context.notes.update(bookmarkNote.id, {
          contentMarkdown: newContent,
        });
      }

      context.ui?.showNotice?.(`已将【${fullName}】从稍后阅读清单中移除！`);
      return null;
    }

    // ===== 执行加入收藏 (Bookmark) =====
    // 1. 立即响应 UI
    if (buttonEl) {
      buttonEl.classList.add("is-bookmarked");
      buttonEl.innerHTML = "<span>★ 已收藏</span>";
    }
    // 2. 立即加入缓存集合
    bookmarkedReposSet.add(fullName);
    await context.storage?.set?.("bookmarked_repos", Array.from(bookmarkedReposSet)).catch(() => {});

    // 3. 保存或创建笔记
    if (bookmarkNote) {
      let fullNote = null;
      try {
        fullNote = await context.notes.get(bookmarkNote.id);
      } catch (e) {
        console.warn("[GitHub Hot] context.notes.get error:", e);
      }

      const oldContent =
        fullNote && typeof fullNote.contentMarkdown === "string"
          ? fullNote.contentMarkdown
          : bookmarkNote.contentMarkdown || "";

      let newContent = "";
      const trimmedOld = oldContent
        .replace(/^> 💡 您的稍后阅读清单目前为空[^\n]*\n*/, "")
        .trim();
      if (!trimmedOld) {
        newContent = cardMarkdown;
      } else {
        newContent = cardMarkdown + "\n\n" + trimmedOld;
      }

      await context.notes.update(bookmarkNote.id, {
        contentMarkdown: newContent,
        tags: Array.from(new Set([...(bookmarkNote.tags || []), "GitHub收藏", "GitHub稍后阅读", "开源灵感"])),
      });
      context.ui?.showNotice?.(`已将【${fullName}】加入稍后阅读清单！`);
    } else {
      const created = await context.notes.create({
        notebookId: targetNotebookId || undefined,
        title: bookmarkNoteTitle,
        contentMarkdown: cardMarkdown,
        tags: ["GitHub收藏", "GitHub稍后阅读", "开源灵感"],
      });
      bookmarkNote = created;
      context.ui?.showNotice?.(`已创建《${bookmarkNoteTitle}》并将【${fullName}】加入清单！`);
    }

    return bookmarkNote?.id;
  }

  // 模式 B：单篇独立笔记模式
  const singleTitle = `[开源收藏] ${fullName} · 稍后阅读`;

  let existingSingle = null;
  try {
    const qRes = await context.notes.query({
      notebookId: targetNotebookId || undefined,
      limit: 30,
    });
    if (qRes && qRes.notes) {
      existingSingle = qRes.notes.find((n) => n.title.includes(fullName) || n.title === singleTitle);
    }
  } catch (e) {}

  if (existingSingle) {
    try {
      if (context.notes.trash) {
        await context.notes.trash(existingSingle.id);
      } else if (context.notes.delete) {
        await context.notes.delete(existingSingle.id);
      }
    } catch (e) {}
    bookmarkedReposSet.delete(fullName);
    await context.storage?.set?.("bookmarked_repos", Array.from(bookmarkedReposSet)).catch(() => {});
    if (buttonEl) {
      buttonEl.classList.remove("is-bookmarked");
      buttonEl.innerHTML = "<span>🔖 稍后阅读</span>";
    }
    context.ui?.showNotice?.(`已取消收藏：【${fullName}】`);
    return null;
  }

  const singleContent = [
    `# 📦 [${item.fullName}](${item.url})`,
    `> 🏷️ **技术栈**：${item.language || "Other"}  ·  ⭐ **Star规模**：${item.totalStars || item.periodStars}  ·  📅 **收藏时间**：${nowFormat}`,
    `> 🔗 **代码仓库**：[${item.url}](${item.url})`,
    ``,
    `## 💡 项目简介`,
    item.description || "暂无项目描述",
    ``,
    item.topics && item.topics.length ? `## 🏷️ 领域标签\n${item.topics.map((t) => "`#" + t + "`").join(" ")}\n` : "",
    `## 📝 深度阅读与测试笔记`,
    `- [ ] 体验与本地部署尝试`,
    `- [ ] 架构设计与核心模块阅读`,
    `- [ ] 技术选型对比与借鉴点总结`,
    ``,
    `---`,
  ].join("\n");

  const created = await context.notes.create({
    notebookId: targetNotebookId || undefined,
    title: singleTitle,
    contentMarkdown: singleContent,
    tags: ["GitHub收藏", "GitHub稍后阅读", "开源项目"],
  });

  bookmarkedReposSet.add(fullName);
  await context.storage?.set?.("bookmarked_repos", Array.from(bookmarkedReposSet)).catch(() => {});

  if (buttonEl) {
    buttonEl.classList.add("is-bookmarked");
    buttonEl.innerHTML = "<span>★ 已收藏</span>";
  }

  context.ui?.showNotice?.(`已为【${fullName}】创建独立稍后阅读笔记！`);
  return created?.id;
}

// 简易 Markdown 转排版 HTML 预览 (支持表格)
function renderMarkdownBasic(md) {
  if (!md) return "";
  let html = escapeHtml(md);

  // 表格处理
  html = html.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (tableMatch) => {
    const lines = tableMatch.trim().split("\n");
    if (lines.length < 2) return tableMatch;

    let tableHtml = "<table>";
    let isHeader = true;

    lines.forEach((line) => {
      if (/^\|[-:\s|]+\|$/.test(line.trim())) {
        isHeader = false;
        return;
      }
      const cells = line.split("|").slice(1, -1);
      const tag = isHeader ? "th" : "td";
      tableHtml += "<tr>" + cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("") + "</tr>";
    });
    tableHtml += "</table>";
    return tableHtml;
  });

  // 标题
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // 粗体
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // 引用
  html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");

  // 列表
  html = html.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/gim, "<ul>$1</ul>");

  // 链接
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 分割线
  html = html.replace(/^---$/gim, "<hr/>");

  // 段落换行
  html = html.replace(/\n\n/g, "</p><p>");
  html = html.replace(/\n/g, "<br/>");

  return `<p>${html}</p>`;
}

// ==================== 5. 交互控制台弹窗 ====================
function openConsoleModal(context) {
  document.querySelectorAll(".edgeever-gh-modal-backdrop").forEach((el) => el.remove());

  let currentRange = "daily"; // "daily" | "weekly" | "monthly"
  let currentCategoryId = "all";
  let currentSearchQuery = "";
  let currentReportStyle = "digest"; // "digest" | "benchmark"
  let currentMaxItems = 10;
  let currentProvider = "edgeever";
  let trendingItems = [];
  let generatedReport = null;
  let activeTab = "cards"; // "cards" | "report"
  let isGenerating = false;
  let userCustomKeywords = ["markdown note", "knowledge base", "pkm", "ai agent", "mcp"];
  let bookmarkedReposSet = new Set();

  const backdrop = document.createElement("div");
  backdrop.className = "edgeever-gh-modal-backdrop";

  backdrop.innerHTML = `
    <div class="edgeever-gh-modal">
      <!-- 弹窗顶栏 -->
      <div class="edgeever-gh-modal-header">
        <div class="edgeever-gh-header-left">
          <div class="edgeever-gh-logo-box">
            <svg viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
            </svg>
          </div>
          <div class="edgeever-gh-title-group">
            <h2>
              开源热搜与竞品调研
              <span class="edgeever-gh-version-badge">v1.2.3</span>
            </h2>
            <div class="edgeever-gh-subtitle">GitHub 开源热榜 (日/周/月) & 竞品对标调研，一键稍后阅读</div>
          </div>
        </div>

        <!-- 周期 Tab 切换 (增加月度特刊) -->
        <div class="edgeever-gh-range-tabs">
          <button type="button" class="edgeever-gh-tab-btn is-active" data-range="daily">
            <span>🌅 昨日日报</span>
          </button>
          <button type="button" class="edgeever-gh-tab-btn" data-range="weekly">
            <span>🚀 本周周报</span>
          </button>
          <button type="button" class="edgeever-gh-tab-btn" data-range="monthly">
            <span>🌕 最近一月</span>
          </button>
        </div>

        <button type="button" class="edgeever-gh-close-btn" title="关闭 (Esc)">✕</button>
      </div>

      <!-- 双栏主体 -->
      <div class="edgeever-gh-modal-body">
        <!-- 左侧：筛选与参数控制 -->
        <div class="edgeever-gh-sidebar">
          <div class="edgeever-gh-sidebar-scroll">
            <!-- 搜索与自定义关键词 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">
                🔍 自定义关键词搜索 / 对标
                <span class="edgeever-gh-form-hint">搜项目或竞品</span>
              </label>
              <div class="edgeever-gh-search-box">
                <input
                  type="text"
                  class="edgeever-gh-search-input"
                  id="ee-keyword-input"
                  placeholder="如：edgeever, markdown note, pkm"
                />
                <button type="button" class="edgeever-gh-search-clear" id="ee-search-clear" style="display:none;" title="清空">✕</button>
                <button type="button" class="edgeever-gh-search-btn" id="ee-btn-search">搜索</button>
              </div>

              <!-- 常用对标关键词标签云 -->
              <div class="edgeever-gh-custom-tags-wrap" id="ee-custom-tags-container"></div>
            </div>

            <!-- 技术分类胶囊 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">
                预设分类 / 热门技术栈
                <span class="edgeever-gh-form-hint" id="ee-selected-lang-name">🔥 全语言</span>
              </label>
              <div class="edgeever-gh-capsule-grid" id="ee-capsule-grid"></div>
            </div>

            <!-- AI 报告模式选择 (速报 vs 竞品横向对比选型) -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">AI 报告生成模式</label>
              <div class="edgeever-gh-style-selector">
                <label class="edgeever-gh-style-option is-active" id="ee-opt-digest">
                  <input type="radio" name="reportStyle" value="digest" checked />
                  <div>
                    <div class="edgeever-gh-style-title">📊 综合技术热点速报</div>
                    <div class="edgeever-gh-style-desc">适合常规每日/每周/每月热榜，提炼风向与项目精析</div>
                  </div>
                </label>
                <label class="edgeever-gh-style-option" id="ee-opt-benchmark">
                  <input type="radio" name="reportStyle" value="benchmark" />
                  <div>
                    <div class="edgeever-gh-style-title">⚔️ 竞品横向对比与选型调研</div>
                    <div class="edgeever-gh-style-desc">深度生成对比矩阵表、架构差异与选型决策指南</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- 入选项目数量 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">
                精选入选项目上限
                <span class="edgeever-gh-form-hint" id="ee-items-count-hint">Top 10</span>
              </label>
              <div class="edgeever-gh-segment-bar" id="ee-items-segment">
                <button type="button" data-limit="5">Top 5</button>
                <button type="button" class="is-active" data-limit="10">Top 10</button>
                <button type="button" data-limit="15">Top 15</button>
                <button type="button" data-limit="20">Top 20</button>
              </div>
            </div>

            <!-- AI 解读引擎 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">AI 总结引擎</label>
              <select class="edgeever-gh-select" id="ee-ai-provider-select">
                <option value="edgeever" selected>✨ EdgeEver 原生 AI (推荐·免配置)</option>
                <option value="custom">🌐 自定义 OpenAI 兼容代理</option>
              </select>
            </div>

            <!-- 自定义代理参数面板 -->
            <div id="ee-custom-ai-panel" style="display: none; flex-direction: column; gap: 8px;">
              <div class="edgeever-gh-form-item">
                <label class="edgeever-gh-form-label">代理 API 端点 Base URL</label>
                <input type="text" class="edgeever-gh-input" id="ee-custom-base-url" placeholder="https://api.openai.com/v1" />
              </div>
              <div class="edgeever-gh-form-item">
                <label class="edgeever-gh-form-label">API Key</label>
                <input type="password" class="edgeever-gh-input" id="ee-custom-api-key" placeholder="sk-..." />
              </div>
              <div class="edgeever-gh-form-item">
                <label class="edgeever-gh-form-label">模型名称 (Model)</label>
                <input type="text" class="edgeever-gh-input" id="ee-custom-model" value="gpt-4o-mini" />
              </div>
            </div>

            <!-- 目标保存笔记本 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">目标保存笔记本</label>
              <select class="edgeever-gh-select" id="ee-target-notebook-select">
                <option value="">自动推荐 (GitHub 热榜 / 默认)</option>
              </select>
            </div>
          </div>

          <!-- 左侧底部操作栏 -->
          <div class="edgeever-gh-sidebar-footer">
            <button type="button" class="edgeever-gh-btn-primary" id="ee-btn-generate-ai">
              <span>🚀 立即由 AI 深度生成文章</span>
            </button>
            <button type="button" class="edgeever-gh-btn-secondary" id="ee-btn-refresh-data">
              <span>🔄 重新抓取数据</span>
            </button>
          </div>
        </div>

        <!-- 右侧：展示主面板 -->
        <div class="edgeever-gh-main-pane">
          <div class="edgeever-gh-pane-header">
            <div class="edgeever-gh-view-toggle">
              <div class="edgeever-gh-view-tab is-active" id="ee-tab-cards">
                🔥 实时开源项目流 (<span id="ee-card-count-badge">0</span>)
              </div>
              <div class="edgeever-gh-view-tab" id="ee-tab-report">
                📄 AI 报告与对比预览
              </div>
            </div>

            <div class="edgeever-gh-pane-actions">
              <button type="button" class="edgeever-gh-pill-action" id="ee-btn-open-bookmarks" title="查看集中收藏夹笔记">
                📌 稍后阅读清单
              </button>
              <button type="button" class="edgeever-gh-pill-action" id="ee-btn-copy-md" style="display: none;">
                📋 复制 Markdown
              </button>
              <button type="button" class="edgeever-gh-pill-action" id="ee-btn-save-note" style="display: none;">
                💾 保存到 EdgeEver 笔记
              </button>
            </div>
          </div>

          <!-- 滚动视图 -->
          <div class="edgeever-gh-scroll-area">
            <!-- 视图 1：卡片流 -->
            <div class="edgeever-gh-cards-stream" id="ee-cards-container">
              <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
                正在连接 GitHub 拉取开源数据...
              </div>
            </div>

            <!-- 视图 2：AI 生成报告 -->
            <div class="edgeever-gh-report-paper" id="ee-report-container" style="display: none;"></div>

            <!-- 视图 3：加载中动效 -->
            <div class="edgeever-gh-ai-loading-box" id="ee-loading-box" style="display: none;">
              <div class="edgeever-gh-ai-spinner"></div>
              <div class="edgeever-gh-loading-title" id="ee-loading-title">正在由 AI 提炼技术风向标...</div>
              <div class="edgeever-gh-progress-pill" id="ee-loading-pill">EdgeEver AI Reasoning Engine</div>
              <div class="edgeever-gh-loading-desc" id="ee-loading-desc">
                正在深度剖析痛点、技术架构与竞品差异，稍候即可生成完整 Markdown 报告...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // 节点引用
  const rangeTabs = backdrop.querySelectorAll(".edgeever-gh-tab-btn");
  const keywordInput = backdrop.querySelector("#ee-keyword-input");
  const searchClearBtn = backdrop.querySelector("#ee-search-clear");
  const btnSearch = backdrop.querySelector("#ee-btn-search");
  const customTagsContainer = backdrop.querySelector("#ee-custom-tags-container");
  const capsuleGrid = backdrop.querySelector("#ee-capsule-grid");
  const selectedLangName = backdrop.querySelector("#ee-selected-lang-name");
  const optDigest = backdrop.querySelector("#ee-opt-digest");
  const optBenchmark = backdrop.querySelector("#ee-opt-benchmark");
  const itemsSegment = backdrop.querySelector("#ee-items-segment");
  const itemsCountHint = backdrop.querySelector("#ee-items-count-hint");
  const aiProviderSelect = backdrop.querySelector("#ee-ai-provider-select");
  const customAiPanel = backdrop.querySelector("#ee-custom-ai-panel");
  const customBaseUrl = backdrop.querySelector("#ee-custom-base-url");
  const customApiKey = backdrop.querySelector("#ee-custom-api-key");
  const customModel = backdrop.querySelector("#ee-custom-model");
  const targetNotebookSelect = backdrop.querySelector("#ee-target-notebook-select");
  const btnGenerateAi = backdrop.querySelector("#ee-btn-generate-ai");
  const btnRefreshData = backdrop.querySelector("#ee-btn-refresh-data");
  const tabCards = backdrop.querySelector("#ee-tab-cards");
  const tabReport = backdrop.querySelector("#ee-tab-report");
  const cardCountBadge = backdrop.querySelector("#ee-card-count-badge");
  const btnCopyMd = backdrop.querySelector("#ee-btn-copy-md");
  const btnSaveNote = backdrop.querySelector("#ee-btn-save-note");
  const cardsContainer = backdrop.querySelector("#ee-cards-container");
  const reportContainer = backdrop.querySelector("#ee-report-container");
  const loadingBox = backdrop.querySelector("#ee-loading-box");
  const loadingTitle = backdrop.querySelector("#ee-loading-title");
  const btnClose = backdrop.querySelector(".edgeever-gh-close-btn");

  // 加载设置与笔记本
  async function initSettingsAndNotebooks() {
    try {
      const defRange = await context.settings.get("default_range");
      if (defRange) currentRange = String(defRange);

      const defLang = await context.settings.get("default_language");
      if (defLang) currentCategoryId = String(defLang);

      const defStyle = await context.settings.get("default_report_style");
      if (defStyle) currentReportStyle = String(defStyle);

      const maxIt = await context.settings.get("max_items");
      if (maxIt) currentMaxItems = parseInt(maxIt, 10) || 10;

      const prov = await context.settings.get("ai_provider");
      if (prov) currentProvider = String(prov);

      const bUrl = await context.settings.get("custom_ai_base_url");
      if (bUrl) customBaseUrl.value = String(bUrl);

      const key = await context.settings.get("custom_ai_api_key");
      if (key) customApiKey.value = String(key);

      const mod = await context.settings.get("custom_ai_model");
      if (mod) customModel.value = String(mod);

      const kwStr = await context.settings.get("custom_keywords");
      if (kwStr) {
        userCustomKeywords = String(kwStr)
          .split(/[,，\n]+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }

      try {
        const savedBm = await context.storage?.get?.("bookmarked_repos");
        if (Array.isArray(savedBm)) {
          bookmarkedReposSet = new Set(savedBm);
        }
        // 尝试从现有稍后阅读笔记中全量读取并补充已收藏项目
        const qRes = await context.notes.query({ tags: ["GitHub稍后阅读"], limit: 5 });
        if (qRes && qRes.notes && qRes.notes.length > 0) {
          const fn = await context.notes.get(qRes.notes[0].id);
          if (fn && typeof fn.contentMarkdown === "string") {
            const matches = fn.contentMarkdown.matchAll(/github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/g);
            for (const m of matches) {
              bookmarkedReposSet.add(m[1]);
            }
          }
        }
      } catch (e) {}
    } catch (e) {}

    // 笔记本下拉
    try {
      const notebooks = (await context.notebooks.list()) || [];
      notebooks.forEach((nb) => {
        const opt = document.createElement("option");
        opt.value = nb.id;
        opt.textContent = `📁 ${nb.name}`;
        targetNotebookSelect.appendChild(opt);
      });
    } catch (e) {}

    // 同步 UI 状态
    rangeTabs.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.range === currentRange);
    });

    setReportStyle(currentReportStyle);

    itemsSegment.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", parseInt(btn.dataset.limit, 10) === currentMaxItems);
    });
    itemsCountHint.textContent = `Top ${currentMaxItems}`;

    aiProviderSelect.value = currentProvider;
    customAiPanel.style.display = currentProvider === "custom" ? "flex" : "none";
  }

  function setReportStyle(style) {
    currentReportStyle = style;
    optDigest.classList.toggle("is-active", style === "digest");
    optBenchmark.classList.toggle("is-active", style === "benchmark");
    optDigest.querySelector("input").checked = style === "digest";
    optBenchmark.querySelector("input").checked = style === "benchmark";
  }

  optDigest.onclick = () => setReportStyle("digest");
  optBenchmark.onclick = () => setReportStyle("benchmark");

  // 渲染常用关键词标签云
  function renderCustomTags() {
    customTagsContainer.innerHTML = "";
    userCustomKeywords.forEach((kw) => {
      const chip = document.createElement("span");
      chip.className = `edgeever-gh-tag-chip ${currentSearchQuery === kw ? "is-active" : ""}`;
      chip.innerHTML = `
        <span>${escapeHtml(kw)}</span>
      `;
      chip.onclick = () => {
        keywordInput.value = kw;
        searchClearBtn.style.display = "flex";
        currentSearchQuery = kw;
        // 自动推荐开启“竞品横向对比与选型调研模式”
        setReportStyle("benchmark");
        renderCustomTags();
        loadData();
      };
      customTagsContainer.appendChild(chip);
    });
  }

  // 渲染预设分类胶囊
  function renderCapsules() {
    capsuleGrid.innerHTML = "";
    PRESET_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `edgeever-gh-capsule-btn ${cat.id === currentCategoryId && !currentSearchQuery ? "is-active" : ""}`;
      btn.innerHTML = `<span>${cat.name}</span>`;
      btn.onclick = () => {
        currentCategoryId = cat.id;
        currentSearchQuery = "";
        keywordInput.value = "";
        searchClearBtn.style.display = "none";

        if (cat.type === "search") {
          setReportStyle("benchmark");
        }

        capsuleGrid.querySelectorAll(".edgeever-gh-capsule-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        renderCustomTags();
        selectedLangName.textContent = cat.name.split(" ")[0];
        loadData();
      };
      capsuleGrid.appendChild(btn);
    });

    const curObj = PRESET_CATEGORIES.find((c) => c.id === currentCategoryId) || PRESET_CATEGORIES[0];
    selectedLangName.textContent = curObj.name.split(" ")[0];
  }

  // 渲染项目卡片
  function renderCards(items) {
    if (!items || items.length === 0) {
      cardsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
          未检索到符合条件的开源项目，请尝试更换关键词或刷新重试。
        </div>
      `;
      cardCountBadge.textContent = "0";
      return;
    }

    cardCountBadge.textContent = String(items.length);
    cardsContainer.innerHTML = "";

    items.forEach((it) => {
      const card = document.createElement("div");
      card.className = "edgeever-gh-card";
      const isBookmarked = bookmarkedReposSet.has(it.fullName);

      // 提取前几个 topic
      const topicsHtml = (it.topics || []).slice(0, 4).map((t) => `<span class="edgeever-gh-tag-chip" style="font-size:10px; padding:1px 6px;">#${escapeHtml(t)}</span>`).join(" ");

      card.innerHTML = `
        <div class="edgeever-gh-card-top">
          <div class="edgeever-gh-repo-info">
            <span class="edgeever-gh-rank-badge">${it.rank}</span>
            <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" class="edgeever-gh-repo-link">
              <span>${escapeHtml(it.fullName)}</span>
            </a>
          </div>
          <div class="edgeever-gh-card-top-actions">
            <span class="edgeever-gh-card-stars-today">
              ${escapeHtml(it.periodText || it.totalStars)}
            </span>
            <button type="button" class="edgeever-gh-btn-bookmark ${isBookmarked ? "is-bookmarked" : ""}" data-repo="${escapeHtml(it.fullName)}" title="快速加入稍后阅读清单">
              <span>${isBookmarked ? "★ 已收藏" : "🔖 稍后阅读"}</span>
            </button>
          </div>
        </div>

        <div class="edgeever-gh-card-desc">
          ${escapeHtml(it.description)}
        </div>

        ${topicsHtml ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">${topicsHtml}</div>` : ""}

        <div class="edgeever-gh-card-bottom">
          <span class="edgeever-gh-meta-item">
            <span class="edgeever-gh-lang-dot" style="background-color: ${escapeHtml(it.languageColor)};"></span>
            <strong>${escapeHtml(it.language)}</strong>
          </span>
          ${it.totalStars ? `<span class="edgeever-gh-meta-item">⭐ 总星数 ${escapeHtml(it.totalStars)}</span>` : ""}
          ${it.forks ? `<span class="edgeever-gh-meta-item">🍴 复刻 ${escapeHtml(it.forks)}</span>` : ""}
          <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" style="margin-left: auto; color: var(--ee-gh-primary); font-size: 11.5px; text-decoration: none;">
            查看 GitHub 源码 ↗
          </a>
        </div>
      `;

      // 绑定稍后阅读收藏点击事件
      const bmBtn = card.querySelector(".edgeever-gh-btn-bookmark");
      if (bmBtn) {
        bmBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          bmBtn.disabled = true;
          try {
            await bookmarkRepository(context, it, bmBtn);
          } finally {
            bmBtn.disabled = false;
          }
        };
      }

      cardsContainer.appendChild(card);
    });
  }

  // 加载数据
  async function loadData() {
    const isSearch = Boolean(currentSearchQuery.trim());
    cardsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
        正在抓取 GitHub ${isSearch ? `「${escapeHtml(currentSearchQuery)}」相关开源项目` : `${currentRange === "monthly" ? "最近一月" : currentRange === "weekly" ? "本周" : "昨日"}热榜`}...
      </div>
    `;
    btnRefreshData.disabled = true;

    try {
      const items = await fetchRepositories({
        range: currentRange,
        categoryId: currentCategoryId,
        searchQuery: currentSearchQuery,
      });
      trendingItems = items;
      renderCards(items);
    } catch (err) {
      cardsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: #cf222e;">
          抓取失败: ${escapeHtml(err.message || err)}
        </div>
      `;
    } finally {
      btnRefreshData.disabled = false;
    }
  }

  // 搜索事件
  function handleSearchTrigger() {
    const val = keywordInput.value.trim();
    if (!val) return;
    currentSearchQuery = val;
    searchClearBtn.style.display = "flex";

    // 如果还没有在自定义标签中，自动添加到前面
    if (!userCustomKeywords.includes(val)) {
      userCustomKeywords.unshift(val);
      if (userCustomKeywords.length > 8) userCustomKeywords.pop();
      context.settings?.set?.("custom_keywords", userCustomKeywords.join(", "));
    }

    setReportStyle("benchmark");
    renderCustomTags();
    capsuleGrid.querySelectorAll(".edgeever-gh-capsule-btn").forEach((b) => b.classList.remove("is-active"));
    selectedLangName.textContent = `🔍 ${val}`;
    loadData();
  }

  btnSearch.onclick = handleSearchTrigger;
  keywordInput.onkeydown = (e) => {
    if (e.key === "Enter") handleSearchTrigger();
  };
  keywordInput.oninput = () => {
    searchClearBtn.style.display = keywordInput.value ? "flex" : "none";
  };
  searchClearBtn.onclick = () => {
    keywordInput.value = "";
    searchClearBtn.style.display = "none";
    currentSearchQuery = "";
    renderCustomTags();
    renderCapsules();
    loadData();
  };

  // 切换视图模式 (卡片 vs 报告)
  function switchView(tab) {
    activeTab = tab;
    tabCards.classList.toggle("is-active", tab === "cards");
    tabReport.classList.toggle("is-active", tab === "report");

    if (tab === "cards") {
      cardsContainer.style.display = "flex";
      reportContainer.style.display = "none";
      loadingBox.style.display = "none";
      btnCopyMd.style.display = "none";
      btnSaveNote.style.display = "none";
    } else {
      cardsContainer.style.display = "none";
      if (isGenerating) {
        reportContainer.style.display = "none";
        loadingBox.style.display = "flex";
        btnCopyMd.style.display = "none";
        btnSaveNote.style.display = "none";
      } else {
        reportContainer.style.display = "block";
        loadingBox.style.display = "none";
        btnCopyMd.style.display = generatedReport ? "flex" : "none";
        btnSaveNote.style.display = generatedReport ? "flex" : "none";
      }
    }
  }

  // 周期 Tab 切换
  rangeTabs.forEach((btn) => {
    btn.onclick = () => {
      currentRange = btn.dataset.range;
      rangeTabs.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      currentSearchQuery = "";
      keywordInput.value = "";
      searchClearBtn.style.display = "none";
      renderCapsules();
      loadData();
    };
  });

  // 数量上限切换
  itemsSegment.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      currentMaxItems = parseInt(btn.dataset.limit, 10);
      itemsSegment.querySelectorAll("button").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      itemsCountHint.textContent = `Top ${currentMaxItems}`;
    };
  });

  // AI 引擎切换
  aiProviderSelect.onchange = () => {
    currentProvider = aiProviderSelect.value;
    customAiPanel.style.display = currentProvider === "custom" ? "flex" : "none";
  };

  tabCards.onclick = () => switchView("cards");
  tabReport.onclick = () => switchView("report");
  btnRefreshData.onclick = () => loadData();

  // AI 深度生成文章
  btnGenerateAi.onclick = async () => {
    if (trendingItems.length === 0) {
      context.ui?.showNotice?.("当前没有项目数据，请先抓取或搜索！");
      return;
    }

    const selectedItems = trendingItems.slice(0, currentMaxItems);
    isGenerating = true;
    switchView("report");
    btnGenerateAi.disabled = true;

    try {
      const curCat = PRESET_CATEGORIES.find((c) => c.id === currentCategoryId);
      const options = {
        range: currentRange,
        reportStyle: currentReportStyle,
        categoryName: curCat ? curCat.name : "开源热搜",
        searchTerm: currentSearchQuery || (curCat && curCat.type === "search" ? curCat.targetTerm : ""),
        provider: currentProvider,
        customSettings: {
          baseUrl: customBaseUrl.value,
          apiKey: customApiKey.value,
          model: customModel.value,
        },
      };

      const result = await callAiEngine(context, selectedItems, options, (stepText) => {
        loadingTitle.textContent = stepText;
      });

      generatedReport = result;
      reportContainer.innerHTML = renderMarkdownBasic(result.text);

      context.ui?.showNotice?.("🎉 AI 深度分析报告生成完成！");
    } catch (err) {
      console.error("[GitHub Hot] generate error:", err);
      reportContainer.innerHTML = `
        <div style="padding: 30px; border-left: 4px solid #cf222e; background: rgba(207,34,46,0.06); border-radius: 6px;">
          <h3 style="margin-top:0; color:#cf222e;">生成失败</h3>
          <p>${escapeHtml(err.message || err)}</p>
        </div>
      `;
      context.ui?.showNotice?.(`生成失败: ${err.message || err}`);
    } finally {
      isGenerating = false;
      btnGenerateAi.disabled = false;
      switchView("report");
    }
  };

  // 保存到笔记
  btnSaveNote.onclick = async () => {
    if (!generatedReport) return;
    btnSaveNote.disabled = true;
    try {
      const { isUpdated } = await saveReportToNote(context, generatedReport.title, generatedReport.text, {
        range: currentRange,
        isBenchmark: generatedReport.isBenchmark,
      });
      context.ui?.showNotice?.(
        isUpdated
          ? `已成功更新现有笔记「${generatedReport.title}」！`
          : `已成功创建新笔记「${generatedReport.title}」！`
      );
    } catch (err) {
      context.ui?.showNotice?.(`保存失败: ${err.message || err}`);
    } finally {
      btnSaveNote.disabled = false;
    }
  };

  // 复制 Markdown
  btnCopyMd.onclick = async () => {
    if (!generatedReport) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(generatedReport.text);
      }
      context.ui?.showNotice?.("已复制整篇 Markdown 日报到剪贴板！");
    } catch (e) {
      context.ui?.showNotice?.("复制失败，请手动在预览区复制。");
    }
  };

  // 查看稍后阅读清单笔记
  const btnOpenBookmarks = backdrop.querySelector("#ee-btn-open-bookmarks");
  if (btnOpenBookmarks) {
    btnOpenBookmarks.onclick = async () => {
      let bookmarkNoteTitle = "📌 GitHub 开源项目收藏夹 (稍后阅读)";
      try {
        const title = await context.settings.get("bookmark_note_title");
        if (title) bookmarkNoteTitle = String(title);
      } catch (e) {}

      let targetNote = null;
      try {
        const queryRes = await context.notes.query({ tags: ["GitHub稍后阅读"], limit: 5 });
        if (queryRes && queryRes.notes && queryRes.notes.length > 0) {
          targetNote = queryRes.notes[0];
        }
      } catch (e) {}

      if (!targetNote) {
        try {
          const queryRes = await context.notes.query({ limit: 20 });
          if (queryRes && queryRes.notes) {
            targetNote = queryRes.notes.find(
              (n) => n.title.includes("GitHub 开源项目收藏夹") || n.title === bookmarkNoteTitle
            );
          }
        } catch (e) {}
      }

      if (targetNote) {
        context.ui?.showNotice?.(`已为您找到稍后阅读清单《${targetNote.title}》！`);
        try {
          await context.editor?.openDocument?.({ noteId: targetNote.id });
        } catch (e) {}
      } else {
        context.ui?.showNotice?.("您尚未收藏任何项目。浏览时点击卡片右上角「🔖 稍后阅读」即可一键加入！");
      }
    };
  }

  const closeModal = () => backdrop.remove();
  btnClose.onclick = closeModal;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeModal();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      closeModal();
      window.removeEventListener("keydown", handleKeyDown);
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  // 初始化
  initSettingsAndNotebooks().then(() => {
    renderCustomTags();
    renderCapsules();
    loadData();
  });
}

// ==================== 6. 定时后台自动生成任务 ====================
async function runDailyDigestJob(context, range = "daily") {
  try {
    const items = await fetchRepositories({ range, categoryId: "all" });
    if (!items || items.length === 0) return;

    const maxItems = (await context.settings.get("max_items")) || 10;
    const provider = (await context.settings.get("ai_provider")) || "edgeever";

    const customSettings = {
      baseUrl: (await context.settings.get("custom_ai_base_url")) || "https://api.openai.com/v1",
      apiKey: (await context.settings.get("custom_ai_api_key")) || "",
      model: (await context.settings.get("custom_ai_model")) || "gpt-4o-mini",
    };

    const selectedItems = items.slice(0, parseInt(maxItems, 10));
    const result = await callAiEngine(context, selectedItems, {
      range,
      reportStyle: "digest",
      categoryName: "全语言总榜",
      provider,
      customSettings,
    });

    await saveReportToNote(context, result.title, result.text, { range, isBenchmark: false });
    context.ui?.showNotice?.(`🌅 今日《${result.title}》已自动为您生成并归档！`);
  } catch (err) {
    console.warn("[GitHub Hot] Daily schedule job error:", err);
  }
}

function timeToCron(timeStr) {
  const parts = String(timeStr || "08:30").split(":");
  const hour = parts[0] || "8";
  const minute = parts[1] || "30";
  return `${minute} ${hour} * * *`;
}

async function syncSchedule(context) {
  if (!context.schedules) return;
  const scheduleKey = "org.edgeever.plugins.github-hot.daily-digest";

  try {
    const autoEnabled = await context.settings.get("auto_digest_enabled");
    const autoTime = await context.settings.get("auto_digest_time");

    if (autoEnabled) {
      await context.schedules.upsert({
        key: scheduleKey,
        name: `GitHub 开源热搜日报自动生成 (${autoTime || "08:30"})`,
        commandId: "github-hot-generate-daily",
        cronExpression: timeToCron(autoTime),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        missedRunPolicy: "run-once",
        isEnabled: true,
      });
    } else {
      await context.schedules.remove(scheduleKey).catch(() => {});
    }
  } catch (err) {
    console.warn("[GitHub Hot] syncSchedule error:", err);
  }
}

// ==================== 7. 插件生命周期与入口挂载 ====================
export default {
  activate(context) {
    let settings = {
      buttonPosition: "toolbar",
    };

    async function loadSettings() {
      try {
        const pos = await context.settings.get("button_position");
        if (pos) settings.buttonPosition = String(pos);
      } catch (e) {}
    }

    loadSettings();

    // 注册命令
    context.commands.register({
      id: "github-hot-open-console",
      title: "GitHub 开源热搜与竞品调研 (控制台)...",
      listed: true,
      run() {
        openConsoleModal(context);
      },
    });

    context.commands.register({
      id: "github-hot-generate-daily",
      title: "立即生成昨日 GitHub 开源热搜日报",
      listed: true,
      async run() {
        context.ui?.showNotice?.("正在抓取 GitHub 热榜并通过 AI 深度解读，请稍候...");
        await runDailyDigestJob(context, "daily");
      },
    });

    context.commands.register({
      id: "github-hot-generate-weekly",
      title: "立即生成本周 GitHub 开源技术周刊",
      listed: true,
      async run() {
        context.ui?.showNotice?.("正在汇总本周 GitHub 热搜趋势，请稍候...");
        await runDailyDigestJob(context, "weekly");
      },
    });

    context.commands.register({
      id: "github-hot-generate-monthly",
      title: "立即生成最近一月 GitHub 开源特刊",
      listed: true,
      async run() {
        context.ui?.showNotice?.("正在汇总最近一月 GitHub 开源黑马，请稍候...");
        await runDailyDigestJob(context, "monthly");
      },
    });

    context.commands.register({
      id: "github-hot-open-bookmarks",
      title: "打开 GitHub 稍后阅读收藏夹清单",
      listed: true,
      async run() {
        let targetNote = null;
        try {
          const queryRes = await context.notes.query({ tags: ["GitHub稍后阅读"], limit: 5 });
          if (queryRes && queryRes.notes && queryRes.notes.length > 0) {
            targetNote = queryRes.notes[0];
          }
        } catch (e) {}

        if (targetNote) {
          context.ui?.showNotice?.(`已为您找到稍后阅读清单《${targetNote.title}》！`);
          try {
            await context.editor?.openDocument?.({ noteId: targetNote.id });
          } catch (e) {}
        } else {
          context.ui?.showNotice?.("尚未创建稍后阅读收藏夹。请在控制台浏览热榜时点击「🔖 稍后阅读」！");
        }
      },
    });

    context.commands.register({
      id: "github-hot-format-bookmarks",
      title: "一键升级稍后阅读大纲索引 (规范为卡片目录)",
      listed: true,
      async run() {
        let targetNote = null;
        try {
          const queryRes = await context.notes.query({ tags: ["GitHub稍后阅读"], limit: 5 });
          if (queryRes && queryRes.notes && queryRes.notes.length > 0) {
            targetNote = await context.notes.get(queryRes.notes[0].id);
          }
        } catch (e) {}

        if (!targetNote || typeof targetNote.contentMarkdown !== "string") {
          context.ui?.showNotice?.("未找到稍后阅读笔记或笔记正文为空。");
          return;
        }

        // 将已有内容按 --- 分割，并将每个条目规整包裹为高颜值 Blockquote 卡片
        let md = targetNote.contentMarkdown;
        const chunks = md.split(/\n+---\n*/).map((c) => c.trim()).filter(Boolean);
        const formattedChunks = chunks.map((chunk) => {
          // 清除已有引用前缀，避免多层嵌套
          const cleanLines = chunk.split("\n").map((l) => l.replace(/^>\s?/, ""));
          // 确保第一行是 ### 📦 [name](url)
          let titleLine = cleanLines[0];
          if (/^(?:###\s+)?- \[[ xX]\]\s*📦/.test(titleLine)) {
            titleLine = titleLine.replace(/^(?:###\s+)?- \[[ xX]\]\s*📦\s*(\[[^\n]+\]\([^\n]+\))/, "### 📦 $1");
            cleanLines[0] = titleLine;
          }
          // 规整包裹为引用块卡片
          return cleanLines.map((l) => (l ? "> " + l : ">")).join("\n") + "\n\n---";
        });

        const newMd = formattedChunks.join("\n\n");
        await context.notes.update(targetNote.id, { contentMarkdown: newMd });
        context.ui?.showNotice?.("稍后阅读笔记已升级为高颜值卡片风并建立大纲索引！");

        try {
          await context.editor?.openDocument?.({ noteId: targetNote.id });
        } catch (e) {}
      },
    });

    // 计划任务同步
    syncSchedule(context);

    // 入口按钮安全挂载（单例模式，防闪烁）
    let currentBtn = null;

    function cleanupButton() {
      if (currentBtn) {
        try {
          currentBtn.remove();
        } catch (e) {}
        currentBtn = null;
      }
      document
        .querySelectorAll("#edgeever-github-hot-btn, .edgeever-gh-hot-btn")
        .forEach((b) => b.remove());
    }

    function findToolbar() {
      const selectors = [
        ".edgeever-editor-toolbar",
        ".ProseMirror-menubar",
        ".tiptap-toolbar",
        '[role="toolbar"]',
        ".editor-toolbar",
        ".note-editor-toolbar",
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }

    function ensureButtonMounted() {
      if (settings.buttonPosition === "hidden") {
        cleanupButton();
        return;
      }

      if (currentBtn && currentBtn.isConnected) {
        return;
      }

      const existing = document.getElementById("edgeever-github-hot-btn");
      if (existing && existing.isConnected) {
        currentBtn = existing;
        return;
      }

      cleanupButton();

      const btn = document.createElement("button");
      btn.type = "button";
      btn.id = "edgeever-github-hot-btn";
      btn.title = "GitHub 开源热搜与竞品调研 (日报/周刊/月刊/对标)";

      const svgIcon = `
        <svg viewBox="0 0 24 24">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
        </svg>
      `;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConsoleModal(context);
      });

      if (settings.buttonPosition === "toolbar") {
        const tb = findToolbar();
        if (tb) {
          btn.className = "edgeever-gh-hot-btn is-toolbar-btn";
          btn.innerHTML = svgIcon;
          tb.appendChild(btn);
          currentBtn = btn;
          return;
        }
      }

      // 悬浮模式 (安全位于原生 AI 唤出按钮上方)
      btn.className = "edgeever-gh-hot-btn is-fab";
      btn.innerHTML = svgIcon;
      document.body.appendChild(btn);
      currentBtn = btn;
    }

    let timer = null;
    const observer = new MutationObserver(() => {
      if (currentBtn && currentBtn.isConnected) return;
      clearTimeout(timer);
      timer = setTimeout(ensureButtonMounted, 350);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(ensureButtonMounted, 300);

    const onSettingsChanged = context.events.on("settings.changed", async () => {
      await loadSettings();
      cleanupButton();
      ensureButtonMounted();
      syncSchedule(context);
    });

    return () => {
      observer.disconnect();
      cleanupButton();
      onSettingsChanged?.();
      document.querySelectorAll(".edgeever-gh-modal-backdrop").forEach((b) => b.remove());
    };
  },
};
