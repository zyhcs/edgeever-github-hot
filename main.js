/**
 * EdgeEver GitHub Hot Digest Plugin
 * 开源热搜日报 / GitHub Trending 深度技术周刊
 * 聚合 GitHub 实时开源热榜，通过 EdgeEver 原生 AI 或自定义代理智能提炼核心痛点、技术亮点与生态洞察，生成并保存高质量笔记。
 */

// ==================== 1. 语言分类与配色配置 ====================
const TECH_CATEGORIES = [
  { id: "all", name: "🔥 全语言总榜", path: "", icon: "🔥" },
  { id: "python", name: "🐍 Python (AI/深度学习)", path: "python", icon: "🐍" },
  { id: "typescript", name: "🔷 TypeScript (全栈/前端)", path: "typescript", icon: "🔷" },
  { id: "rust", name: "🦀 Rust (高性能/基础设施)", path: "rust", icon: "🦀" },
  { id: "go", name: "🐹 Go (云原生/后端微服务)", path: "go", icon: "🐹" },
  { id: "javascript", name: "🟨 JavaScript (现代Web)", path: "javascript", icon: "🟨" },
  { id: "cpp", name: "⚡ C/C++ (底层引擎/计算)", path: "c++", icon: "⚡" },
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

function getWeekNumber(date) {
  const d = new Date(date || Date.now());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ==================== 2. GitHub Trending 数据抓取与解析 ====================
async function fetchTrendingFromGitHub(range = "daily", language = "all") {
  const langObj = TECH_CATEGORIES.find((c) => c.id === language) || TECH_CATEGORIES[0];
  const langPath = langObj.path ? encodeURIComponent(langObj.path) : "";
  const sinceParam = range === "weekly" ? "weekly" : "daily";
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
    console.warn("[GitHub Hot] Direct fetch failed, will try fallback:", err);
  }

  // 如果直连拉取成功，使用 DOMParser / 正则提取
  if (html && html.includes("Box-row")) {
    const items = parseTrendingHtml(html, range);
    if (items.length > 0) {
      return items;
    }
  }

  // 备用兜底策略：调用 GitHub 官方 Search API 按照 Star 增量降序补齐
  return await fetchTrendingFallback(range, language);
}

function parseTrendingHtml(html, range) {
  const items = [];

  // 浏览器 / EdgeEver 客户端环境优先使用 DOMParser
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
        const periodText = periodEl
          ? periodEl.textContent.trim()
          : range === "weekly"
          ? "本周热搜推荐"
          : "今日热搜推荐";

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
      console.warn("[GitHub Hot] DOMParser failed, using regex fallback:", e);
    }
  }

  // 纯正则解析 fallback（确保 Node / 极端环境下均 100% 可用）
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

    const periodMatch = part.match(/(\d[\d,]*)\s+stars\s+(?:today|this week)/i);
    const periodStars = periodMatch ? periodMatch[1] : "";
    const periodText = periodMatch
      ? `+${periodMatch[1]} stars ${range === "weekly" ? "this week" : "today"}`
      : "热搜项目";

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

// 降级兜底：GitHub Search API
async function fetchTrendingFallback(range, language) {
  try {
    const days = range === "weekly" ? 7 : 2;
    const pastDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().split("T")[0];
    const langQuery = language && language !== "all" ? `+language:${language}` : "";
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
      periodText: range === "weekly" ? "本周新增关注" : "今日新增关注",
    }));
  } catch (err) {
    console.error("[GitHub Hot] Fallback API error:", err);
    return [];
  }
}

// ==================== 3. AI 提示词工程与报告生成 ====================
function buildAiPrompt(items, range = "daily", language = "all") {
  const isWeekly = range === "weekly";
  const dateStr = formatChineseDate();
  const weekNum = getWeekNumber();
  const langObj = TECH_CATEGORIES.find((c) => c.id === language) || TECH_CATEGORIES[0];

  const titleProposal = isWeekly
    ? `GitHub 本周开源技术趋势周刊 · 第 ${weekNum} 周 (${dateStr})`
    : `GitHub 开源热搜日报 · ${dateStr}`;

  const system = `你是全球开源软件与系统架构资深技术主编，擅长从海量 GitHub 代码库中洞察技术演进趋势，提炼高含金量、地道专业的中文技术速评。

你正在为技术团队与开发者撰写一份高质量的《${isWeekly ? "开源技术趋势周刊" : "开源热搜日报"}》。
输入数据是当前 GitHub 热搜排行的原始项目列表。文章必须逻辑严密、排版精致、层次清晰、中文纯正专业。

【排版与结构要求】：
1. 报告必须直接以标准 Markdown 输出，不要使用外部代码块反引号包裹整个输出。
2. 篇首输出标题：
   # ${isWeekly ? "🚀 " : "🌅 "}${titleProposal}
3. 接着输出【🌟 本期生态洞察与技术风向标】：
   提炼 3 条高度凝练的宏观技术趋势观察（例如 AI Agent 端侧演进、Rust 重构基础工具生态、现代 Web 开发范式等），每条使用粗体开头并附带 2 句话深度洞察。
4. 核心部分【🔥 精选开源黑马深度拆解】：
   严格对选入的每个项目按重要性逐一解读，二级标题格式必须为：
   ## 01 | 仓库名 · 一句话精准中文定位与杀手级功能
   紧随其后输出信息徽标引用行：
   > 🏷️ **语言**：项目主要语言  ·  ⭐ **热度**：今日或本周Star增量  ·  🔗 **仓库**：[完整仓库名](URL)
   针对该项目提炼 3 个专业维度要点：
   - 💡 **解决的核心痛点**：为什么该项目在短时间内引爆全网？击中了开发者的什么痛点？
   - ⚡ **技术选型与架构亮点**：有哪些精妙的架构、性能优化或设计模式？
   - 🎯 **适用场景与探索建议**：哪些开发者适合在哪些项目场景中尝试？
   每个项目解读结束后，使用一条纯分割线“---”进行视觉隔断。
5. 篇末输出【📊 本期热榜全景速览】：
   使用清晰的 Markdown 表格汇总所有项目：包含列（排名、仓库名、语言、周期Star增量、一句话定位）。
6. 篇末结语【🧭 探索指引】：
   一句话简明有力的开源寄语。
7. 忠于事实，严禁凭空捏造不存在的功能与作者信息，遇到英文专业术语保留原词或标准中英对照。`;

  const promptData = {
    reportType: isWeekly ? "Weekly Digest" : "Daily Digest",
    date: dateStr,
    category: langObj.name,
    totalItems: items.length,
    repositories: items.map((it, idx) => ({
      rank: idx + 1,
      fullName: it.fullName,
      url: it.url,
      language: it.language,
      starsGain: it.periodText,
      totalStars: it.totalStars,
      rawDescription: it.description,
    })),
  };

  return { system, prompt: JSON.stringify(promptData, null, 2), titleProposal };
}

// 调用 AI 模型生成完整 Markdown 报告
async function callAiEngine(context, items, options = {}, progressCallback = () => {}) {
  const { range = "daily", language = "all", provider = "edgeever", customSettings = {} } = options;
  const { system, prompt, titleProposal } = buildAiPrompt(items, range, language);

  progressCallback("正在构建深度分析数据并连接 AI 引擎...");

  // 1. EdgeEver 客户端原生 AI 模型
  if (provider === "edgeever") {
    if (!context.ai || typeof context.ai.generate !== "function") {
      throw new Error("当前 EdgeEver 版本未检测到 context.ai 模块，请检查 EdgeEver 客户端或切换为自定义 API 模式。");
    }

    try {
      const status = await context.ai.status();
      if (!status || !status.configured) {
        throw new Error(
          "EdgeEver 尚未配置默认 AI 模型！请在 EdgeEver 工作区左下角「设置 -> AI」中配置模型，或在插件中切换为「自定义 OpenAI 兼容代理」。"
        );
      }
    } catch (e) {
      if (e.message && e.message.includes("尚未配置")) throw e;
    }

    progressCallback("EdgeEver AI 模型正在深度解读开源架构与生态趋势...");
    const res = await context.ai.generate({
      system,
      prompt,
      maxOutputTokens: 6000,
    });

    if (!res || !res.text) {
      throw new Error("EdgeEver AI 生成返回为空，请稍后重试。");
    }

    return { text: res.text, title: titleProposal };
  }

  // 2. 自定义 OpenAI 兼容代理 / 外部 API
  progressCallback("正在向自定义 AI 代理发送热榜分析请求...");
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
      temperature: 0.6,
      max_tokens: 4096,
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

  return { text, title: titleProposal };
}

// ==================== 4. 笔记保存与归档 ====================
async function saveReportToNote(context, reportTitle, reportMarkdown, range = "daily") {
  const isWeekly = range === "weekly";
  const todayStr = formatDate();
  const weekNum = getWeekNumber();

  // 1. 获取目标笔记本
  let targetNotebookId = "";
  try {
    const savedId = await context.settings.get("target_notebook_id");
    if (savedId) targetNotebookId = String(savedId);
  } catch (e) {}

  if (!targetNotebookId) {
    try {
      const notebooks = (await context.notebooks.list()) || [];
      // 优先匹配名称包含“热榜”、“开源”或“日报”的笔记本
      const matched = notebooks.find((nb) => /(热榜|开源|日报|weekly|trending)/i.test(nb.name));
      if (matched) {
        targetNotebookId = matched.id;
      } else if (notebooks.length > 0) {
        targetNotebookId = notebooks[0].id;
      }
    } catch (e) {
      console.warn("[GitHub Hot] list notebooks failed:", e);
    }
  }

  // 2. 标签系统
  const tags = isWeekly
    ? ["GitHub热榜", "开源周报", `W${weekNum}`, todayStr.slice(0, 7)]
    : ["GitHub热榜", "开源日报", todayStr];

  // 3. 检查当天是否存在同类笔记，智能更新（防重复创建）
  let existingNote = null;
  try {
    const queryRes = await context.notes.query({
      notebookId: targetNotebookId || undefined,
      tags: [isWeekly ? "开源周报" : "开源日报", isWeekly ? `W${weekNum}` : todayStr],
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

// 简易 Markdown 转排版 HTML 预览
function renderMarkdownBasic(md) {
  if (!md) return "";
  let html = escapeHtml(md);

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

  let currentRange = "daily";
  let currentLanguage = "all";
  let currentMaxItems = 10;
  let currentProvider = "edgeever";
  let trendingItems = [];
  let generatedReport = null;
  let activeTab = "cards"; // "cards" | "report"
  let isGenerating = false;

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
              开源热搜日报
              <span class="edgeever-gh-version-badge">GitHub Hot</span>
            </h2>
            <div class="edgeever-gh-subtitle">聚合 GitHub 最新开源热榜，通过 AI 深度提炼架构亮点与技术趋势</div>
          </div>
        </div>

        <!-- 周期 Tab 切换 -->
        <div class="edgeever-gh-range-tabs">
          <button type="button" class="edgeever-gh-tab-btn is-active" data-range="daily">
            <span>🌅 昨日热搜日报</span>
          </button>
          <button type="button" class="edgeever-gh-tab-btn" data-range="weekly">
            <span>🚀 本周技术周刊</span>
          </button>
        </div>

        <button type="button" class="edgeever-gh-close-btn" title="关闭 (Esc)">✕</button>
      </div>

      <!-- 双栏主体 -->
      <div class="edgeever-gh-modal-body">
        <!-- 左侧：筛选与参数控制 -->
        <div class="edgeever-gh-sidebar">
          <div class="edgeever-gh-sidebar-scroll">
            <!-- 技术分类胶囊 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">
                技术分类 / 编程语言
                <span class="edgeever-gh-form-hint" id="ee-selected-lang-name">🔥 全语言</span>
              </label>
              <div class="edgeever-gh-capsule-grid" id="ee-capsule-grid"></div>
            </div>

            <!-- 入选项目数量 -->
            <div class="edgeever-gh-form-item">
              <label class="edgeever-gh-form-label">
                精选入选项目数量
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

            <!-- 自定义代理参数面板 (按需显示) -->
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
              <span>🚀 立即由 AI 深度生成日报</span>
            </button>
            <button type="button" class="edgeever-gh-btn-secondary" id="ee-btn-refresh-data">
              <span>🔄 重新抓取 GitHub 热榜</span>
            </button>
          </div>
        </div>

        <!-- 右侧：展示主面板 -->
        <div class="edgeever-gh-main-pane">
          <div class="edgeever-gh-pane-header">
            <div class="edgeever-gh-view-toggle">
              <div class="edgeever-gh-view-tab is-active" id="ee-tab-cards">
                🔥 实时热榜卡片流 (<span id="ee-card-count-badge">0</span>)
              </div>
              <div class="edgeever-gh-view-tab" id="ee-tab-report">
                📄 AI 深度日报预览
              </div>
            </div>

            <div class="edgeever-gh-pane-actions">
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
            <!-- 视图 1：实时热榜卡片列表 -->
            <div class="edgeever-gh-cards-stream" id="ee-cards-container">
              <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
                正在连接 GitHub 拉取最新开源热榜...
              </div>
            </div>

            <!-- 视图 2：AI 生成报告 -->
            <div class="edgeever-gh-report-paper" id="ee-report-container" style="display: none;"></div>

            <!-- 视图 3：生成中流光加载提示 -->
            <div class="edgeever-gh-ai-loading-box" id="ee-loading-box" style="display: none;">
              <div class="edgeever-gh-ai-spinner"></div>
              <div class="edgeever-gh-loading-title" id="ee-loading-title">正在由 AI 提炼技术风向标...</div>
              <div class="edgeever-gh-progress-pill" id="ee-loading-pill">EdgeEver AI Reasoning Engine</div>
              <div class="edgeever-gh-loading-desc" id="ee-loading-desc">
                正在深度剖析仓库痛点、架构选型、Star 激增动因与应用场景，稍候即可生成完整日报...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // DOM 节点引用
  const rangeTabs = backdrop.querySelectorAll(".edgeever-gh-tab-btn");
  const capsuleGrid = backdrop.querySelector("#ee-capsule-grid");
  const selectedLangName = backdrop.querySelector("#ee-selected-lang-name");
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
  const loadingDesc = backdrop.querySelector("#ee-loading-desc");
  const btnClose = backdrop.querySelector(".edgeever-gh-close-btn");

  // 加载已保存设置
  async function initSettingsAndNotebooks() {
    try {
      const defRange = await context.settings.get("default_range");
      if (defRange) currentRange = String(defRange);

      const defLang = await context.settings.get("default_language");
      if (defLang) currentLanguage = String(defLang);

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

    itemsSegment.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("is-active", parseInt(btn.dataset.limit, 10) === currentMaxItems);
    });
    itemsCountHint.textContent = `Top ${currentMaxItems}`;

    aiProviderSelect.value = currentProvider;
    customAiPanel.style.display = currentProvider === "custom" ? "flex" : "none";
  }

  // 渲染分类胶囊
  function renderCapsules() {
    capsuleGrid.innerHTML = "";
    TECH_CATEGORIES.forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `edgeever-gh-capsule-btn ${cat.id === currentLanguage ? "is-active" : ""}`;
      btn.innerHTML = `<span>${cat.name}</span>`;
      btn.onclick = () => {
        currentLanguage = cat.id;
        capsuleGrid.querySelectorAll(".edgeever-gh-capsule-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        selectedLangName.textContent = cat.name.split(" ")[0];
        loadTrendingData();
      };
      capsuleGrid.appendChild(btn);
    });
    const curObj = TECH_CATEGORIES.find((c) => c.id === currentLanguage) || TECH_CATEGORIES[0];
    selectedLangName.textContent = curObj.name.split(" ")[0];
  }

  // 渲染热榜卡片列表
  function renderCards(items) {
    if (!items || items.length === 0) {
      cardsContainer.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
          未检索到符合条件的开源项目，请切换技术分类或刷新重试。
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
      card.innerHTML = `
        <div class="edgeever-gh-card-top">
          <div class="edgeever-gh-repo-info">
            <span class="edgeever-gh-rank-badge">${it.rank}</span>
            <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer" class="edgeever-gh-repo-link">
              <span>${escapeHtml(it.fullName)}</span>
            </a>
          </div>
          <span class="edgeever-gh-card-stars-today">
            ⭐ ${escapeHtml(it.periodText || it.totalStars)}
          </span>
        </div>

        <div class="edgeever-gh-card-desc">
          ${escapeHtml(it.description)}
        </div>

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
      cardsContainer.appendChild(card);
    });
  }

  // 加载数据
  async function loadTrendingData() {
    cardsContainer.innerHTML = `
      <div style="padding: 40px; text-align: center; color: var(--ee-gh-text-muted);">
        正在抓取 GitHub ${currentRange === "weekly" ? "本周" : "昨日"} 开源热榜...
      </div>
    `;
    btnRefreshData.disabled = true;
    try {
      const items = await fetchTrendingFromGitHub(currentRange, currentLanguage);
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

  // 事件绑定：Tab 周期切换
  rangeTabs.forEach((btn) => {
    btn.onclick = () => {
      currentRange = btn.dataset.range;
      rangeTabs.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      loadTrendingData();
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

  btnRefreshData.onclick = () => loadTrendingData();

  // 核心：AI 深度生成日报
  btnGenerateAi.onclick = async () => {
    if (trendingItems.length === 0) {
      context.ui?.showNotice?.("当前没有热榜数据，请先抓取！");
      return;
    }

    const selectedItems = trendingItems.slice(0, currentMaxItems);
    isGenerating = true;
    switchView("report");
    btnGenerateAi.disabled = true;

    try {
      const options = {
        range: currentRange,
        language: currentLanguage,
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

      context.ui?.showNotice?.("🎉 AI 深度热搜报告生成完成！");
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
      const { isUpdated } = await saveReportToNote(
        context,
        generatedReport.title,
        generatedReport.text,
        currentRange
      );
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
    renderCapsules();
    loadTrendingData();
  });
}

// ==================== 6. 定时后台自动生成任务 ====================
async function runDailyDigestJob(context, range = "daily") {
  try {
    const items = await fetchTrendingFromGitHub(range, "all");
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
      language: "all",
      provider,
      customSettings,
    });

    await saveReportToNote(context, result.title, result.text, range);
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
      title: "GitHub 开源热搜日报 (控制台)...",
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
      btn.title = "GitHub 开源热搜日报 (昨日热榜 / 本周周刊)";

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
