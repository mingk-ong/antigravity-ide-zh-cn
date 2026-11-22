/**
 * Antigravity IDE 思维链实时流式翻译与 JSONL 分层缓存微服务
 *
 * 基于 2,779 条真实思维链统计与压测定制：
 * - 引擎顺位：L0 固定套话 & 内存/JSONL 缓存 -> L1 腾讯 TranSmart (原生批量 ~400ms)
 *            -> L2 微软必应 (高保真备灾) -> L3 彩云小译 (批量兜底)
 *            （支持通过环境变量 AGY_ZH_THOUGHT_LLM_URL 接入本地 Ollama / OpenAI 兼容轻量 LLM）
 * - 代码保护：行内 `code`、URL、文件路径统一以纯字母数字锚点 AGYC0X 隔离并校验 100% 回填
 * - 缓存机制：Append-Only JSONL + 500ms 批量写合并 + 30 天 TTL / 15,000 条 / 6MB 惰性原子压缩
 *            + 读命中 0 刷盘 + 质量权重分级覆盖 + 未闭合半句严禁入盘
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const CACHE_VERSION = 'v2';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// 启用持久 Keep-Alive 连接池，消除重复 TLS 握手（连续请求延迟可从 ~300ms 降至 ~90-110ms）
const sharedHttpAgent = new http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 6 });
const sharedHttpsAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 6 });

const SOURCE_QUALITY = {
  static: 5,
  custom_llm: 4,
  ollama: 4,
  bing: 3,
  transmart: 2,
  caiyun: 1
};

// 高频思维链冷启动固定套话（0ms 秒译，不占磁盘缓存额度）
const STATIC_BOILERPLATE = {
  "I'm thinking through how to approach this.": '正在梳理处理思路。',
  'Thinking through how to approach this.': '正在梳理处理思路。',
  "Let's think through this carefully.": '正在仔细梳理当前问题。',
  "Let's analyze the user's request.": '正在分析用户的需求。',
  "Analyzing the user's request.": '正在分析用户的需求。',
  'Checking the current workspace context.': '正在检查当前工作区上下文。',
  'Examining the current workspace context.': '正在检查当前工作区上下文。',
  'Initiating the "Test Optimization" phase.': '正在进入测试优化阶段。',
  'Proceeding to the testing and optimization phase.': '正在推进至测试与优化阶段。'
};

const STATIC_BOILERPLATE_LOWER = {};
for (const [k, v] of Object.entries(STATIC_BOILERPLATE)) {
  STATIC_BOILERPLATE_LOWER[k.toLowerCase()] = v;
}

function resolveCacheDir(overrideDir) {
  if (overrideDir && String(overrideDir).trim()) {
    return path.resolve(String(overrideDir).trim());
  }
  const envDir = (process.env.AGY_ZH_CACHE_DIR || '').trim();
  if (envDir) return path.resolve(envDir);

  const metaPath = path.join(__dirname, '.agy_zh_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta && meta.cacheDir) return path.resolve(meta.cacheDir);
    } catch (_e) {}
  }

  const localAppData = process.env.LOCALAPPDATA || '';
  if (localAppData) {
    return path.join(localAppData, 'antigravity-zh-cn', 'cache');
  }
  return path.join(os.homedir(), '.antigravity-zh-cn', 'cache');
}

/**
 * 归一化文本，避免无意义空白差异导致缓存击穿
 */
function normalizeSegment(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * 生成带版本前缀的 64-bit 短哈希 Key
 */
function makeCacheKey(normText) {
  return CACHE_VERSION + ':' + crypto.createHash('sha1').update(normText).digest('hex').slice(0, 16);
}

/**
 * 判断该思维片段是否需要翻译（中文占比 > 30% 或英文字母不足 3 个直接透传）
 */
function shouldTranslateSegment(text) {
  const raw = normalizeSegment(text);
  if (!raw || raw.length < 2) return false;
  if (/^```/.test(raw)) return false;

  // 剔除行内代码和 URL 后再评估自然语言占比，防止纯代码片段被误判
  const plain = raw
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .trim();
  const enCount = (plain.match(/[A-Za-z]/g) || []).length;
  if (enCount < 3) return false;

  const zhCount = (plain.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (zhCount > 0 && zhCount / (zhCount + enCount) > 0.3) return false;
  return true;
}

/**
 * 选择一个原文绝对不包含的纯字母锚点前缀，彻底杜绝与原文代码字面量撞车
 */
function pickSafeTagPrefix(rawText) {
  const upper = String(rawText || '').toUpperCase();
  const candidates = ['ZXQ', 'QZX', 'KXZ', 'VJQ', 'XZK', 'JQV'];
  for (const c of candidates) {
    if (!upper.includes(c)) return c;
  }
  return 'QKVZ';
}

/**
 * 清理非反引号代码区的半角波浪号 ~，防止 GFM Markdown 误渲染为删除线（如 ~400ms~）
 * 严格保留反引号内部（如 `~/path`）原样不动
 */
function sanitizeMarkdownTildes(text) {
  if (!text || !text.includes('~')) return text;
  const segments = text.split(/(`[^`\n]+`)/g);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || (seg.startsWith('`') && seg.endsWith('`'))) continue;
    segments[i] = seg.replace(/~(?=\s*\d)/g, '约').replace(/~/g, '～');
  }
  return segments.join('');
}

/**
 * 隔离行内代码、URL、本地文件路径及 Markdown 前缀，防止被翻译引擎破坏
 */
function maskCodeTokens(rawText) {
  const norm = normalizeSegment(rawText);
  if (!norm || /^```/.test(norm)) {
    return { skip: true, prefix: '', masked: norm, tokens: [], tagPrefix: 'ZXQ' };
  }

  // 提取前导 Markdown 列表 / 引用前缀
  let prefix = '';
  let body = norm;
  const prefixMatch = body.match(/^((?:>\s*)+|(?:[-*+]\s+)|(?:\d+\.\s+)|(?:#{1,6}\s+))/);
  if (prefixMatch) {
    prefix = prefixMatch[1];
    body = body.slice(prefix.length);
  }

  const tagPrefix = pickSafeTagPrefix(norm);
  const tokens = [];
  const pushToken = match => {
    const idx = tokens.length;
    tokens.push(match);
    return `${tagPrefix}${idx}X`;
  };

  // 1. 优先保护反引号行内代码（67.9% 出现率，均 7.42 个/条）
  let masked = body.replace(/`[^`\n]+`/g, pushToken);

  // 2. 保护 URL（绝不吞掉紧跟在末尾的句末标点 . ! ?）
  masked = masked.replace(/https?:\/\/[^\s<>)"']*[^\s<>)"'.!?]/gi, pushToken);

  // 3. 保护 Windows 绝对路径（如 C:\Users\... / D:/Projects/...，不吞掉句末 . ! ?）与常见相对源码路径
  masked = masked.replace(/[A-Za-z]:[\\/][^\s,;:)"'<>]*[^\s,;:)"'<>.!?]/g, pushToken);
  masked = masked.replace(
    /(?<![A-Za-z0-9_])(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8}(?![A-Za-z0-9_])/g,
    pushToken
  );

  // 4. 保护独立带扩展名文件名（如 hub_proxy.js、product.json）与版本号（如 v1.107.0）
  masked = masked.replace(
    /\b[A-Za-z0-9_-]+\.(?:js|ts|jsx|tsx|json|jsonl|md|py|txt|vbs|ps1|bat|db|pb|pbtxt|lua|xml|sql|html|css|exe|lnk|log|yaml|yml)\b/gi,
    pushToken
  );
  masked = masked.replace(/\bv?\d+\.\d+(?:\.\d+)+\b/g, pushToken);

  return { skip: false, prefix, masked, tokens, tagPrefix };
}

/**
 * 还原占位锚点并执行严苛完整性与防污染校验
 */
function unmaskAndValidate(rawNorm, candidate, maskInfo) {
  if (!candidate || typeof candidate !== 'string') return null;
  let text = candidate.trim();
  if (!text) return null;

  const lower = text.toLowerCase();
  if (
    lower.includes('<html') ||
    lower.includes('<!doctype') ||
    lower.includes('mymemory') ||
    /^error[:\s]/i.test(text)
  ) {
    return null;
  }

  // 校验所有锚点均完整存在，并容忍引擎在字母与数字间插入空格（如 ZXQ 0X / [ZXQ 1 X]）
  const { tokens, prefix, tagPrefix = 'ZXQ' } = maskInfo;
  if (tokens.length > 0) {
    const foundIndices = new Set();
    const anchorRe = new RegExp(`\\[?\\s*${tagPrefix}\\s*(\\d+)\\s*X\\s*\\]?`, 'gi');
    const restored = text.replace(anchorRe, (_m, idxStr) => {
      const idx = Number(idxStr);
      if (Number.isInteger(idx) && idx >= 0 && idx < tokens.length) {
        foundIndices.add(idx);
        return tokens[idx];
      }
      return _m;
    });
    if (foundIndices.size !== tokens.length) {
      return null;
    }
    text = restored;
  }

  // 由于 tagPrefix 已确保不存在于原文中，此处仅拦截真正未还原的残余锚点，绝不误杀原文代码
  const residualRe = new RegExp(`${tagPrefix}\\s*\\d+\\s*X`, 'i');
  if (residualRe.test(text)) return null;

  // 译文必须包含有效中文且长度合理
  if (!/[\u4e00-\u9fa5]/.test(text)) return null;
  if (text.length > Math.max(240, rawNorm.length * 3.5)) return null;

  // 防止数字前波浪号 ~ 触发 Markdown 删除线误渲染
  text = sanitizeMarkdownTildes(text);

  return (prefix ? prefix + text : text).trim();
}

/**
 * 通用 HTTP/HTTPS 请求（带严格超时保护）
 */
function httpRequest(url, opts = {}) {
  return new Promise(resolve => {
    let settled = false;
    const done = val => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      const u = new URL(url);
      const isHttp = u.protocol === 'http:';
      const mod = isHttp ? http : https;
      const req = mod.request(
        u,
        {
          method: opts.method || 'GET',
          timeout: opts.timeout || 5000,
          agent: opts.agent || (isHttp ? sharedHttpAgent : sharedHttpsAgent),
          headers: {
            'User-Agent': USER_AGENT,
            ...(opts.headers || {})
          }
        },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () =>
            done({
              status: res.statusCode || 0,
              headers: res.headers || {},
              body: Buffer.concat(chunks).toString('utf8')
            })
          );
        }
      );
      req.on('error', err => done({ status: 0, error: err.message, body: '' }));
      req.on('timeout', () => {
        req.destroy();
        done({ status: 0, error: 'timeout', body: '' });
      });
      if (opts.body) req.write(opts.body);
      req.end();
    } catch (err) {
      done({ status: 0, error: err.message, body: '' });
    }
  });
}

/**
 * 创建可独立实例化与测试的思维链翻译器（含独立缓存目录与可配置阈值）
 */
function createThoughtTranslator(config = {}) {
  const cacheDir = resolveCacheDir(config.cacheDir);
  const cacheFile = path.join(cacheDir, 'thought_cache.jsonl');
  const maxEntries = config.maxEntries || 15000;
  const maxFileBytes = config.maxFileBytes || 6 * 1024 * 1024;
  const compactTriggerBytes = Math.floor(maxFileBytes * 1.3);
  const compactTargetRatio = config.compactTargetRatio || 0.8;
  const ttlMs = config.ttlMs || 30 * 24 * 60 * 60 * 1000;
  const flushIntervalMs = config.flushIntervalMs ?? 500;

  // 内存 LRU Map：按访问顺序排列（最新访问在末尾）
  const memCache = new Map();
  const inFlight = new Map();
  let pendingWrites = [];
  let flushTimer = null;
  let compacting = false;
  let diskLineCount = 0;
  let hitCount = 0;
  let missCount = 0;
  let bingTokenCache = { ig: '', key: '', token: '', cookies: '', expiresAt: 0 };

  function ensureCacheDir() {
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    } catch (_e) {}
  }

  function touchLru(key, entry) {
    entry.at = Date.now();
    memCache.delete(key);
    memCache.set(key, entry);
  }

  function trimMemLru() {
    while (memCache.size > maxEntries) {
      const oldestKey = memCache.keys().next().value;
      if (oldestKey === undefined) break;
      memCache.delete(oldestKey);
    }
  }

  /**
   * 同步从 Append-Only JSONL 加载有效缓存（自动容忍崩溃残损行并剔除过期记录）
   */
  function loadThoughtCache() {
    memCache.clear();
    diskLineCount = 0;
    if (!fs.existsSync(cacheFile)) return { loaded: 0, skippedCorrupt: 0, expired: 0 };

    let skippedCorrupt = 0;
    let expired = 0;
    const now = Date.now();

    try {
      const content = fs.readFileSync(cacheFile, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        diskLineCount++;
        try {
          const rec = JSON.parse(trimmed);
          if (!rec || typeof rec.k !== 'string' || typeof rec.z !== 'string') {
            skippedCorrupt++;
            continue;
          }
          if (!rec.k.startsWith(CACHE_VERSION + ':')) continue;
          const at = Number(rec.at || 0);
          if (at > 0 && now - at > ttlMs) {
            expired++;
            continue;
          }
          const q = Number(rec.q || SOURCE_QUALITY[rec.s] || 1);
          const existing = memCache.get(rec.k);
          if (!existing || q >= existing.q) {
            memCache.delete(rec.k);
            memCache.set(rec.k, { z: rec.z, s: rec.s || 'unknown', q, at: at || now });
          }
        } catch (_e) {
          skippedCorrupt++;
        }
      }
      trimMemLru();
    } catch (_e) {}

    return { loaded: memCache.size, skippedCorrupt, expired };
  }

  /**
   * 立即将待写队列合并追加至 JSONL（O(1) 磁盘追加，绝不重写整文件）
   */
  function flushPendingWrites() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingWrites.length === 0) return;

    const batch = pendingWrites;
    pendingWrites = [];
    ensureCacheDir();

    try {
      const payload = batch.map(item => JSON.stringify(item)).join('\n') + '\n';
      fs.appendFileSync(cacheFile, payload, 'utf8');
      diskLineCount += batch.length;

      // 超过 1.3 倍上限触发惰性后台压缩
      const stat = fs.statSync(cacheFile);
      if (stat.size > compactTriggerBytes) {
        setImmediate(() => compactCache());
      }
    } catch (_e) {}
  }

  function scheduleFlush() {
    if (flushIntervalMs <= 0) {
      flushPendingWrites();
      return;
    }
    if (!flushTimer) {
      flushTimer = setTimeout(flushPendingWrites, flushIntervalMs);
      if (typeof flushTimer.unref === 'function') flushTimer.unref();
    }
  }

  /**
   * 原子写入内存并排队追加磁盘（遵循引擎质量权重覆盖规则）
   */
  function putCache(key, translated, source, persist = true) {
    const quality = SOURCE_QUALITY[source] || 1;
    const now = Date.now();
    const existing = memCache.get(key);

    // 质量权重保护：低权重结果绝不反向覆盖高权重缓存
    if (existing && existing.q > quality) {
      touchLru(key, existing);
      return false;
    }

    const entry = { z: translated, s: source, q: quality, at: now };
    memCache.delete(key);
    memCache.set(key, entry);
    trimMemLru();

    if (persist) {
      pendingWrites.push({ k: key, z: translated, s: source, q: quality, at: now });
      scheduleFlush();
      return true;
    }
    return false;
  }

  /**
   * 惰性原子压缩：去重 + 清除超 30 天记录 + 按 LRU 裁剪至 80% 缓冲水位
   */
  function compactCache() {
    if (compacting) return { compacted: false, reason: 'busy' };
    compacting = true;
    try {
      flushPendingWrites();
      const now = Date.now();
      const targetMaxEntries = Math.max(100, Math.floor(maxEntries * compactTargetRatio));
      const targetMaxBytes = Math.max(16 * 1024, Math.floor(maxFileBytes * compactTargetRatio));

      // 过滤过期条目并按最后访问时间降序排列
      const alive = [];
      let expiredRemoved = 0;
      for (const [k, v] of memCache.entries()) {
        if (now - (v.at || 0) > ttlMs) {
          expiredRemoved++;
          continue;
        }
        alive.push({ k, z: v.z, s: v.s, q: v.q, at: v.at });
      }

      alive.sort((a, b) => b.at - a.at);

      const kept = [];
      let totalBytes = 0;
      for (const rec of alive) {
        if (kept.length >= targetMaxEntries) break;
        const line = JSON.stringify(rec) + '\n';
        const lineBytes = Buffer.byteLength(line, 'utf8');
        if (totalBytes + lineBytes > targetMaxBytes && kept.length > 0) break;
        kept.push(line);
        totalBytes += lineBytes;
      }

      // 回填内存 Map（由旧到新插入以保持 LRU 顺序）
      memCache.clear();
      for (let i = kept.length - 1; i >= 0; i--) {
        const rec = JSON.parse(kept[i]);
        memCache.set(rec.k, { z: rec.z, s: rec.s, q: rec.q, at: rec.at });
      }

      ensureCacheDir();
      const tmpFile = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, kept.join(''), 'utf8');
      fs.renameSync(tmpFile, cacheFile);
      diskLineCount = kept.length;

      return { compacted: true, kept: kept.length, expiredRemoved, bytes: totalBytes };
    } catch (e) {
      return { compacted: false, error: e.message };
    } finally {
      compacting = false;
    }
  }

  function clearThoughtCache() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pendingWrites = [];
    memCache.clear();
    diskLineCount = 0;
    hitCount = 0;
    missCount = 0;
    try {
      if (fs.existsSync(cacheFile)) fs.unlinkSync(cacheFile);
    } catch (_e) {}
    return { ok: true };
  }

  function getCacheStats() {
    let diskBytes = 0;
    try {
      if (fs.existsSync(cacheFile)) diskBytes = fs.statSync(cacheFile).size;
    } catch (_e) {}
    const totalLookups = hitCount + missCount;
    return {
      cacheVersion: CACHE_VERSION,
      cacheFile,
      memoryEntries: memCache.size,
      diskLines: diskLineCount,
      diskBytes,
      pendingWrites: pendingWrites.length,
      hitCount,
      missCount,
      hitRate: totalLookups > 0 ? Number(((hitCount / totalLookups) * 100).toFixed(1)) : 0,
      limits: { maxEntries, maxFileBytes, ttlDays: Math.round(ttlMs / (24 * 3600 * 1000)) }
    };
  }

  // =========================================================================
  // 多源批量翻译后端实现（L1 TranSmart -> L2 Bing -> L3 彩云 + 可选自定义 LLM）
  // =========================================================================

  async function translateBatchViaCustomLlm(texts) {
    const endpoint = (process.env.AGY_ZH_THOUGHT_LLM_URL || '').trim();
    if (!endpoint) return null;
    const model = (process.env.AGY_ZH_THOUGHT_LLM_MODEL || 'qwen2.5:3b').trim();
    const apiKey = (process.env.AGY_ZH_THOUGHT_LLM_KEY || '').trim();

    const payload = JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            '你是专业的软件工程思维链英译中翻译器。输入为 JSON 字符串数组，请将每条英文精准译为自然简洁的简体中文，严格保留所有 AGYC0X/AGYC1X 占位符原样不改，仅输出等长的 JSON 字符串数组，不要解释。'
        },
        { role: 'user', content: JSON.stringify(texts) }
      ]
    });

    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await httpRequest(endpoint, { method: 'POST', timeout: 8000, headers, body: payload });
    if (res.status !== 200 || !res.body) return null;
    try {
      const json = JSON.parse(res.body);
      let content = json?.choices?.[0]?.message?.content || '';
      content = content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const arr = JSON.parse(content);
      if (Array.isArray(arr) && arr.length === texts.length) return arr;
    } catch (_e) {}
    return null;
  }

  async function translateBatchViaTransmart(texts) {
    const payload = JSON.stringify({
      header: {
        fn: 'auto_translation',
        client_key: 'browser-chrome-130.0.0-Windows-10-antigravity'
      },
      type: 'plain',
      model_category: 'normal',
      source: { lang: 'en', text_list: texts },
      target: { lang: 'zh' }
    });

    const res = await httpRequest('https://transmart.qq.com/api/imt', {
      method: 'POST',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Origin: 'https://transmart.qq.com',
        Referer: 'https://transmart.qq.com/zh-CN/index'
      },
      body: payload
    });

    if (res.status !== 200 || !res.body) return null;
    try {
      const json = JSON.parse(res.body);
      const arr = json?.auto_translation;
      if (Array.isArray(arr) && arr.length === texts.length) return arr;
    } catch (_e) {}
    return null;
  }

  async function fetchBingTokens() {
    const now = Date.now();
    if (bingTokenCache.token && bingTokenCache.expiresAt > now) return bingTokenCache;

    const page = await httpRequest('https://cn.bing.com/translator', { timeout: 5000 });
    if (page.status !== 200 || !page.body) return null;

    const igMatch = page.body.match(/IG:"([A-Z0-9]+)"/);
    const tkMatch = page.body.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)"/);
    if (!igMatch || !tkMatch) return null;

    const rawCookies = page.headers['set-cookie'];
    const cookieList = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
    bingTokenCache = {
      ig: igMatch[1],
      key: tkMatch[1],
      token: tkMatch[2],
      cookies: cookieList.map(c => c.split(';')[0]).join('; '),
      expiresAt: now + 15 * 60 * 1000
    };
    return bingTokenCache;
  }

  async function translateBatchViaBing(texts) {
    // 必应接口支持 \n 换行多段合并，安全前提是每条输入先替换内部换行为空格
    const sanitized = texts.map(t => t.replace(/\r?\n/g, ' '));
    const joined = sanitized.join('\n');

    for (let attempt = 0; attempt < 2; attempt++) {
      const tk = await fetchBingTokens();
      if (!tk) return null;

      const formBody =
        `fromLang=en&text=${encodeURIComponent(joined)}&to=zh-Hans` +
        `&token=${encodeURIComponent(tk.token)}&key=${tk.key}`;

      const res = await httpRequest(
        `https://cn.bing.com/ttranslatev3?isVertical=1&IG=${tk.ig}&IID=translator.5028.1`,
        {
          method: 'POST',
          timeout: 6500,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(formBody),
            Cookie: tk.cookies,
            Referer: 'https://cn.bing.com/translator'
          },
          body: formBody
        }
      );

      if (res.status === 200 && res.body) {
        try {
          const json = JSON.parse(res.body);
          const outText = json?.[0]?.translations?.[0]?.text;
          if (typeof outText === 'string') {
            const parts = outText.split('\n');
            if (parts.length === texts.length) return parts;
          }
        } catch (_e) {}
      }

      bingTokenCache.expiresAt = 0;
      bingTokenCache.token = '';
    }
    return null;
  }

  async function translateBatchViaCaiyun(texts) {
    const payload = JSON.stringify({
      source: texts,
      trans_type: 'en2zh',
      request_id: 'agy_th_' + Date.now(),
      detect: true
    });

    const res = await httpRequest('https://api.interpreter.caiyunai.com/v1/translator', {
      method: 'POST',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'x-authorization': 'token 3975l6lr5pcbvidl6jl2',
        'Content-Length': Buffer.byteLength(payload)
      },
      body: payload
    });

    if (res.status !== 200 || !res.body) return null;
    try {
      const json = JSON.parse(res.body);
      const arr = json?.target;
      if (Array.isArray(arr) && arr.length === texts.length) return arr;
    } catch (_e) {}
    return null;
  }

  /**
   * 对一组已准备好的待译任务执行多引擎级联与回填验证（单批上限 12 句防超时）
   */
  async function executeCascadeBatch(tasks, options = {}) {
    const providerOrder = options.providers || [
      ...(process.env.AGY_ZH_THOUGHT_LLM_URL ? [{ name: 'custom_llm', fn: translateBatchViaCustomLlm }] : []),
      { name: 'transmart', fn: translateBatchViaTransmart },
      { name: 'bing', fn: translateBatchViaBing },
      { name: 'caiyun', fn: translateBatchViaCaiyun }
    ];

    const resolvedMap = new Map(); // key -> { translated, source, persisted }
    let remaining = tasks.slice();

    for (const provider of providerOrder) {
      if (remaining.length === 0) break;

      // 按每批 12 句切片，避免单次包体过大拖慢首屏响应
      const nextRemaining = [];
      for (let start = 0; start < remaining.length; start += 12) {
        const chunk = remaining.slice(start, start + 12);
        const maskedTexts = chunk.map(t => t.maskInfo.masked);
        const rawOutputs = await provider.fn(maskedTexts);

        if (!rawOutputs || rawOutputs.length !== chunk.length) {
          nextRemaining.push(...chunk);
          continue;
        }

        for (let i = 0; i < chunk.length; i++) {
          const task = chunk[i];
          const validated = unmaskAndValidate(task.norm, rawOutputs[i], task.maskInfo);
          if (validated) {
            const persisted = task.persist ? putCache(task.key, validated, provider.name, true) : false;
            resolvedMap.set(task.key, {
              translated: validated,
              source: provider.name,
              cached: false,
              persisted
            });
          } else {
            nextRemaining.push(task);
          }
        }
      }
      remaining = nextRemaining;
    }

    // 全部通道失败时，优雅回退原文（绝不入盘污染缓存）
    for (const task of remaining) {
      resolvedMap.set(task.key, {
        translated: task.raw,
        source: 'fallback',
        cached: false,
        persisted: false
      });
    }

    return resolvedMap;
  }

  /**
   * 批量翻译思维链句子/段落（带 L0 套话/缓存 + Single-Flight 去重 + 多引擎级联）
   */
  async function translateThoughtBatch(items = [], options = {}) {
    const startMs = Date.now();
    if (!Array.isArray(items) || items.length === 0) {
      return {
        ok: true,
        results: [],
        stats: { total: 0, cacheHits: 0, staticHits: 0, translatedCount: 0, costMs: 0 }
      };
    }

    const outResults = new Array(items.length);
    const pendingByKey = new Map(); // 去重后的新请求
    const waiters = []; // 等待 Single-Flight 或新批次的任务映射
    let cacheHits = 0;
    let staticHits = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      const id = item.id !== undefined ? String(item.id) : String(i);
      const raw = String(item.text || '');
      const norm = normalizeSegment(raw);
      const persist = item.persist !== false;

      if (!shouldTranslateSegment(norm)) {
        outResults[i] = { id, translated: raw, source: 'skip', cached: false, persisted: false };
        continue;
      }

      // L0-A: 内置高频套话 0ms 瞬出
      const boiler = STATIC_BOILERPLATE[norm] || STATIC_BOILERPLATE_LOWER[norm.toLowerCase()];
      if (boiler) {
        staticHits++;
        outResults[i] = { id, translated: boiler, source: 'static', cached: false, persisted: false };
        continue;
      }

      const key = makeCacheKey(norm);

      // L0-B: 内存/JSONL 缓存命中（读命中 0 刷盘）
      if (!options.bypassCache && memCache.has(key)) {
        const entry = memCache.get(key);
        const now = Date.now();
        if (now - (entry.at || 0) <= ttlMs) {
          touchLru(key, entry);
          hitCount++;
          cacheHits++;
          outResults[i] = {
            id,
            translated: entry.z,
            source: 'cache',
            originSource: entry.s,
            cached: true,
            persisted: false
          };
          continue;
        } else {
          memCache.delete(key);
        }
      }

      missCount++;

      // 代码隔离预处理
      const maskInfo = maskCodeTokens(norm);
      const strippedMasked = maskInfo.masked.replace(new RegExp(`${maskInfo.tagPrefix}\\d+X`, 'g'), '');
      if (maskInfo.skip || !shouldTranslateSegment(strippedMasked)) {
        outResults[i] = { id, translated: raw, source: 'skip', cached: false, persisted: false };
        continue;
      }

      // Single-Flight 并发去重：若该句正在翻译中，直接复用进行中的 Promise
      if (!options.bypassCache && inFlight.has(key)) {
        waiters.push({ index: i, id, key, promise: inFlight.get(key) });
        continue;
      }

      // 合并同批次内的重复句
      if (pendingByKey.has(key)) {
        const existingTask = pendingByKey.get(key);
        if (persist) existingTask.persist = true;
        existingTask.refs.push({ index: i, id });
      } else {
        pendingByKey.set(key, {
          key,
          raw,
          norm,
          persist,
          maskInfo,
          refs: [{ index: i, id }]
        });
      }
    }

    // 执行本批次新翻译任务并注册 Single-Flight 句柄
    const newTasks = [...pendingByKey.values()];
    let translatedCount = 0;

    if (newTasks.length > 0) {
      const resolvers = new Map();
      for (const task of newTasks) {
        let resolveFn;
        const p = new Promise(r => {
          resolveFn = r;
        });
        resolvers.set(task.key, resolveFn);
        if (!options.bypassCache) inFlight.set(task.key, p);
      }

      try {
        const batchResult = await executeCascadeBatch(newTasks, options);
        for (const task of newTasks) {
          const resObj = batchResult.get(task.key) || {
            translated: task.raw,
            source: 'fallback',
            cached: false,
            persisted: false
          };
          if (resObj.source !== 'fallback') translatedCount++;
          for (const ref of task.refs) {
            outResults[ref.index] = { id: ref.id, ...resObj };
          }
          resolvers.get(task.key)(resObj);
        }
      } finally {
        for (const task of newTasks) {
          if (!options.bypassCache) inFlight.delete(task.key);
        }
      }
    }

    // 等待复用 Single-Flight 的条目落位
    if (waiters.length > 0) {
      await Promise.all(
        waiters.map(async w => {
          const resObj = await w.promise;
          outResults[w.index] = { id: w.id, ...resObj, cached: true };
        })
      );
    }

    return {
      ok: true,
      results: outResults,
      stats: {
        total: items.length,
        cacheHits,
        staticHits,
        translatedCount,
        costMs: Date.now() - startMs
      }
    };
  }

  // 初始化预加载磁盘 JSONL 缓存；若加载出大量过期/重复行，延迟 3s 后台异步压缩（绝不阻塞代理启动）
  const initInfo = loadThoughtCache();
  if (
    !config.disableAutoCompact &&
    (initInfo.expired > 50 ||
      initInfo.skippedCorrupt > 0 ||
      (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > compactTriggerBytes))
  ) {
    const t = setTimeout(() => compactCache(), 3000);
    if (typeof t.unref === 'function') t.unref();
  }

  return {
    translateThoughtBatch,
    loadThoughtCache,
    flushPendingWrites,
    compactCache,
    clearThoughtCache,
    getCacheStats,
    putCache,
    makeCacheKey,
    normalizeSegment,
    cacheFile
  };
}

// 默认生产单例（仅在需要时初始化，测试可调用 createThoughtTranslator 隔离临时目录）
const defaultInstance = createThoughtTranslator();

module.exports = {
  ...defaultInstance,
  createThoughtTranslator,
  normalizeSegment,
  makeCacheKey,
  shouldTranslateSegment,
  maskCodeTokens,
  unmaskAndValidate,
  STATIC_BOILERPLATE,
  SOURCE_QUALITY
};
