/**
 * Antigravity IDE 对话标题自动翻译微服务 (Title Translator Microservice)
 *
 * 采用四级级联策略：
 * L0: 本地持久化缓存 (title_cache.json) 与静态历史字典 (title_dicts.json)
 * L1: 微软必应翻译 (cn.bing.com/ttranslatev3)
 * L2: 彩云小译免费通道 (api.interpreter.caiyunai.com)
 * L3: 腾讯交互翻译 TranSmart (transmart.qq.com)
 * L4: 增强本地离线词根兜底 (支持词形还原，仅临时视觉展示，绝不持久化覆盖)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

function resolveBaseSrcDir() {
  const envDir = (process.env.AGY_ZH_SRC_DIR || '').trim();
  if (envDir && fs.existsSync(envDir)) return envDir;

  const metaPath = path.join(__dirname, '.agy_zh_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta && meta.patchSrcDir && fs.existsSync(meta.patchSrcDir)) {
        return meta.patchSrcDir;
      }
    } catch (_e) {}
  }

  if (
    fs.existsSync(path.join(__dirname, 'title_dicts.json')) ||
    fs.existsSync(path.join(__dirname, 'title_cache.json')) ||
    fs.existsSync(path.join(__dirname, 'patcher.js'))
  ) {
    return __dirname;
  }

  const fallbackDir = path.join(os.homedir(), '.antigravity-zh-cn');
  if (!fs.existsSync(fallbackDir)) {
    try {
      fs.mkdirSync(fallbackDir, { recursive: true });
    } catch (_e) {}
  }
  return fallbackDir;
}

const BASE_SRC_DIR = resolveBaseSrcDir();
const CACHE_FILE = path.join(BASE_SRC_DIR, 'title_cache.json');
const DICT_FILE = path.join(BASE_SRC_DIR, 'title_dicts.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const PLACEHOLDER_REGEX =
  /^(Untitled Conversation|New Conversation|New Chat|Coordinator|Parent Conversation|Conversation\s+[0-9a-f-]{6,})$/i;

// 内存状态：合并字典 + 运行时缓存 + 并发去重表 + Bing 令牌缓存
let cacheStore = {
  idToZh: {},
  enToZh: {},
  lowerEnToZh: {}
};

const inFlight = new Map();
let bingTokenCache = {
  ig: '',
  key: '',
  token: '',
  cookies: '',
  expiresAt: 0
};

/**
 * 判断标题是否为内置占位符（严禁持久化写入）
 */
function isPlaceholderTitle(text) {
  const raw = String(text || '').trim();
  if (!raw) return true;
  return PLACEHOLDER_REGEX.test(raw);
}

/**
 * 判断标题是否需要翻译
 */
function shouldTranslateTitle(text) {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 2) return false;
  if (/[\u4e00-\u9fa5]/.test(raw)) return false;
  if (!/[A-Za-z]{2,}/.test(raw)) return false;
  if (isPlaceholderTitle(raw)) return false;
  return true;
}

/**
 * 清洗并校验翻译结果，防止 HTML/错误页面/超长脏数据污染
 */
function cleanTitle(raw, candidate) {
  if (!candidate || typeof candidate !== 'string') return null;
  let cleaned = candidate
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/[。.!！]+$/g, '')
    .trim();

  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (
    lower.includes('<html') ||
    lower.includes('<!doctype') ||
    lower.includes('mymemory') ||
    /\berror\b/i.test(cleaned)
  ) {
    return null;
  }
  if (!/[\u4e00-\u9fa5]/.test(cleaned)) return null;

  const rawLen = String(raw || '').trim().length || 16;
  if (cleaned.length > Math.max(48, rawLen * 3)) return null;

  if (cleaned.length > 32) {
    cleaned = cleaned.slice(0, 32).replace(/[，、：；\-—\s.。]+$/g, '').trim();
  }
  return cleaned || null;
}

/**
 * 加载静态字典与持久化缓存到内存
 */
function loadCache() {
  const nextIdToZh = {};
  const nextEnToZh = {};
  const nextLowerEnToZh = {};

  if (fs.existsSync(DICT_FILE)) {
    try {
      const dictData = JSON.parse(fs.readFileSync(DICT_FILE, 'utf8'));
      if (dictData && typeof dictData === 'object') {
        if (dictData.id_to_zh && typeof dictData.id_to_zh === 'object') {
          Object.assign(nextIdToZh, dictData.id_to_zh);
        }
        if (dictData.en_title_to_zh && typeof dictData.en_title_to_zh === 'object') {
          Object.assign(nextEnToZh, dictData.en_title_to_zh);
        }
      }
    } catch (_e) {}
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const diskCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (diskCache && typeof diskCache === 'object') {
        if (diskCache.idToZh && typeof diskCache.idToZh === 'object') {
          Object.assign(nextIdToZh, diskCache.idToZh);
        }
        if (diskCache.enToZh && typeof diskCache.enToZh === 'object') {
          Object.assign(nextEnToZh, diskCache.enToZh);
        }
      }
    } catch (_e) {}
  }

  for (const [k, v] of Object.entries(nextEnToZh)) {
    if (typeof k === 'string' && typeof v === 'string') {
      nextLowerEnToZh[k.toLowerCase().trim()] = v;
    }
  }

  cacheStore = {
    idToZh: nextIdToZh,
    enToZh: nextEnToZh,
    lowerEnToZh: nextLowerEnToZh
  };
  return cacheStore;
}

/**
 * 原子写入持久化缓存到磁盘（tmp + rename，避免中断损坏 JSON）
 */
function saveCacheEntry(raw, translated, cascadeId) {
  cacheStore.enToZh[raw] = translated;
  cacheStore.lowerEnToZh[raw.toLowerCase().trim()] = translated;
  if (cascadeId && !isPlaceholderTitle(raw)) {
    cacheStore.idToZh[cascadeId] = translated;
  }

  let diskPayload = { idToZh: {}, enToZh: {} };
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (existing && typeof existing === 'object') {
        diskPayload.idToZh = existing.idToZh && typeof existing.idToZh === 'object' ? existing.idToZh : {};
        diskPayload.enToZh = existing.enToZh && typeof existing.enToZh === 'object' ? existing.enToZh : {};
      }
    } catch (_e) {}
  }

  diskPayload.enToZh[raw] = translated;
  if (cascadeId && !isPlaceholderTitle(raw)) {
    diskPayload.idToZh[cascadeId] = translated;
  }
  diskPayload.updatedAt = new Date().toISOString();

  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const tmpFile = CACHE_FILE + '.' + process.pid + '.' + Date.now() + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(diskPayload, null, 2), 'utf8');
    fs.renameSync(tmpFile, CACHE_FILE);
  } catch (_e) {}
}

/**
 * 轻量 HTTPS 请求封装（带严格超时，避免挂死代理线程）
 */
function httpsRequest(url, opts = {}) {
  return new Promise(resolve => {
    let settled = false;
    const finish = val => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    try {
      const req = https.request(
        url,
        {
          method: opts.method || 'GET',
          timeout: opts.timeout || 5000,
          headers: {
            'User-Agent': USER_AGENT,
            ...(opts.headers || {})
          }
        },
        res => {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            finish({
              status: res.statusCode || 0,
              headers: res.headers || {},
              body: Buffer.concat(chunks).toString('utf8')
            });
          });
        }
      );

      req.on('error', err => finish({ status: 0, error: err.message, body: '' }));
      req.on('timeout', () => {
        req.destroy();
        finish({ status: 0, error: 'timeout', body: '' });
      });

      if (opts.body) req.write(opts.body);
      req.end();
    } catch (err) {
      finish({ status: 0, error: err.message, body: '' });
    }
  });
}

/**
 * L1: 微软必应翻译 (带令牌缓存与自动刷新重试机制)
 */
async function fetchBingTokens() {
  const now = Date.now();
  if (bingTokenCache.token && bingTokenCache.expiresAt > now) {
    return bingTokenCache;
  }

  const page = await httpsRequest('https://cn.bing.com/translator', { timeout: 5000 });
  if (page.status !== 200 || !page.body) return null;

  const igMatch = page.body.match(/IG:"([A-Z0-9]+)"/);
  const tkMatch = page.body.match(/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)"/);
  if (!igMatch || !tkMatch) return null;

  const rawCookies = page.headers['set-cookie'];
  const cookieList = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : [];
  const cookies = cookieList.map(c => c.split(';')[0]).join('; ');

  bingTokenCache = {
    ig: igMatch[1],
    key: tkMatch[1],
    token: tkMatch[2],
    cookies,
    expiresAt: now + 15 * 60 * 1000
  };
  return bingTokenCache;
}

async function translateViaBing(raw) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const tk = await fetchBingTokens();
    if (!tk) return null;

    const formBody =
      `fromLang=en&text=${encodeURIComponent(raw)}&to=zh-Hans` +
      `&token=${encodeURIComponent(tk.token)}&key=${tk.key}`;

    const res = await httpsRequest(
      `https://cn.bing.com/ttranslatev3?isVertical=1&IG=${tk.ig}&IID=translator.5028.1`,
      {
        method: 'POST',
        timeout: 5000,
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
        const candidate = json?.[0]?.translations?.[0]?.text;
        const cleaned = cleanTitle(raw, candidate);
        if (cleaned) return cleaned;
      } catch (_e) {}
    }

    // 失效时立即清空 token 缓存并重试一次
    bingTokenCache.expiresAt = 0;
    bingTokenCache.token = '';
  }
  return null;
}

/**
 * L2: 彩云小译公共通道
 */
async function translateViaCaiyun(raw) {
  const payload = JSON.stringify({
    source: [raw],
    trans_type: 'en2zh',
    request_id: 'agy_' + Date.now(),
    detect: true
  });

  const res = await httpsRequest('https://api.interpreter.caiyunai.com/v1/translator', {
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
    return cleanTitle(raw, json?.target?.[0]);
  } catch (_e) {
    return null;
  }
}

/**
 * L3: 腾讯交互翻译 TranSmart
 */
async function translateViaTransmart(raw) {
  const payload = JSON.stringify({
    header: {
      fn: 'auto_translation',
      client_key: 'browser-chrome-130.0.0-Windows-10-antigravity'
    },
    type: 'plain',
    model_category: 'normal',
    source: { lang: 'en', text_list: [raw] },
    target: { lang: 'zh' }
  });

  const res = await httpsRequest('https://transmart.qq.com/api/imt', {
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
    return cleanTitle(raw, json?.auto_translation?.[0]);
  } catch (_e) {
    return null;
  }
}

// =========================================================================
// L4: 增强离线词典兜底（180+ 高频研发词根 + 词形还原 + 相邻英文安全保留空格）
// =========================================================================
const OFFLINE_WORD_MAP = {
  // 常见动作/状态动词
  add: '添加',
  adjust: '调整',
  analyze: '分析',
  analysis: '分析',
  apply: '应用',
  audit: '审计',
  automate: '自动化',
  automation: '自动化',
  backup: '备份',
  block: '拦截',
  blocker: '拦截器',
  blocking: '拦截',
  boost: '增强',
  browse: '浏览',
  build: '构建',
  bypass: '绕过',
  capture: '捕获',
  change: '修改',
  check: '检查',
  clean: '清理',
  cleanup: '清理',
  clone: '克隆',
  compare: '对比',
  compile: '编译',
  connect: '连接',
  convert: '转换',
  copy: '复制',
  create: '创建',
  customize: '自定义',
  custom: '自定义',
  debug: '调试',
  decode: '解码',
  decrypt: '解密',
  delete: '删除',
  deploy: '部署',
  deployment: '部署',
  design: '设计',
  detect: '检测',
  detection: '检测',
  develop: '开发',
  development: '开发',
  diagnose: '诊断',
  disable: '禁用',
  display: '显示',
  download: '下载',
  edit: '编辑',
  enable: '启用',
  enhance: '增强',
  execute: '执行',
  export: '导出',
  extract: '提取',
  fail: '失败',
  failed: '失败',
  fetch: '拉取',
  filter: '过滤',
  find: '查找',
  fix: '修复',
  format: '格式化',
  generate: '生成',
  generation: '生成',
  handle: '处理',
  hide: '隐藏',
  implement: '实现',
  import: '导入',
  improve: '改进',
  init: '初始化',
  inject: '注入',
  inspect: '排查',
  install: '安装',
  integrate: '集成',
  integration: '集成',
  intercept: '拦截',
  investigate: '排查',
  launch: '启动',
  list: '列表',
  load: '加载',
  localize: '中文化',
  localization: '本地化',
  locate: '定位',
  lock: '锁定',
  login: '登录',
  manage: '管理',
  merge: '合并',
  migrate: '迁移',
  missing: '缺失',
  modify: '修改',
  monitor: '监控',
  move: '移动',
  optimize: '优化',
  optimization: '优化',
  override: '覆盖',
  parse: '解析',
  patch: '修补',
  plan: '规划',
  preview: '预览',
  protect: '防护',
  publish: '发布',
  pull: '拉取',
  push: '推送',
  query: '查询',
  read: '读取',
  rebuild: '重建',
  recover: '恢复',
  redirect: '重定向',
  refactor: '重构',
  refresh: '刷新',
  register: '注册',
  remove: '移除',
  rename: '重命名',
  render: '渲染',
  repair: '修复',
  replace: '替换',
  reset: '重置',
  resolve: '解决',
  restore: '还原',
  retrieve: '检索',
  review: '审查',
  run: '运行',
  save: '保存',
  scan: '扫描',
  search: '检索',
  select: '选择',
  send: '发送',
  setup: '配置',
  show: '展示',
  solve: '解决',
  sort: '排序',
  start: '启动',
  stop: '停止',
  summarize: '总结',
  summary: '汇总',
  support: '支持',
  switch: '切换',
  sync: '同步',
  test: '测试',
  testing: '测试',
  track: '跟踪',
  tracking: '跟踪',
  translate: '翻译',
  translation: '翻译',
  troubleshoot: '排错',
  unlock: '解锁',
  update: '更新',
  upgrade: '升级',
  upload: '上传',
  verify: '验证',
  watch: '监听',
  write: '写入',

  // 高频技术名词与领域实体
  account: '账户',
  action: '操作',
  agent: '智能体',
  algorithm: '算法',
  android: '安卓',
  api: 'API',
  app: '应用',
  application: '应用程序',
  architecture: '架构',
  archive: '归档',
  artifact: '文档',
  audio: '音频',
  auth: '认证',
  backend: '后端',
  bar: '栏',
  browser: '浏览器',
  bug: 'Bug',
  build_noun: '构建',
  button: '按钮',
  cache: '缓存',
  card: '卡片',
  chat: '对话',
  chrome: 'Chrome',
  client: '客户端',
  cloud: '云端',
  code: '代码',
  command: '命令',
  component: '组件',
  config: '配置',
  configuration: '配置',
  console: '控制台',
  container: '容器',
  context: '上下文',
  control: '控制',
  conversation: '对话',
  cookie: 'Cookie',
  crash: '崩溃',
  crawler: '爬虫',
  data: '数据',
  database: '数据库',
  dependency: '依赖',
  desktop: '桌面',
  device: '设备',
  dialog: '弹窗',
  directory: '目录',
  docker: 'Docker',
  doc: '文档',
  document: '文档',
  dom: 'DOM',
  domain: '域名',
  driver: '驱动',
  editor: '编辑器',
  encoding: '编码',
  engine: '引擎',
  environment: '环境',
  env: '环境',
  error: '错误',
  event: '事件',
  exception: '异常',
  expense: '记账支出',
  extension: '扩展',
  feature: '特性',
  file: '文件',
  folder: '文件夹',
  font: '字体',
  form: '表单',
  framework: '框架',
  frontend: '前端',
  function: '函数',
  game: '游戏',
  gesture: '手势',
  git: 'Git',
  guide: '指南',
  header: '请求头',
  history: '历史记录',
  hook: '钩子',
  host: '宿主',
  html: 'HTML',
  icon: '图标',
  id: 'ID',
  ide: 'IDE',
  image: '图片',
  index: '索引',
  input: '输入',
  instance: '实例',
  interface: '界面',
  issue: '问题',
  item: '项目',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  key: '密钥',
  keyboard: '键盘',
  language: '语言',
  launcher: '启动器',
  layout: '布局',
  library: '库',
  link: '链接',
  linux: 'Linux',
  log: '日志',
  logic: '逻辑',
  manga: '漫画',
  markdown: 'Markdown',
  memory: '内存',
  menu: '菜单',
  message: '消息',
  metadata: '元数据',
  method: '方法',
  mod: '模组',
  mode: '模式',
  model: '模型',
  module: '模块',
  network: '网络',
  node: 'Node',
  notification: '通知',
  novel: '小说',
  object: '对象',
  option: '选项',
  output: '输出',
  package: '包',
  page: '页面',
  panel: '面板',
  parameter: '参数',
  path: '路径',
  performance: '性能',
  permission: '权限',
  platform: '平台',
  plugin: '插件',
  policy: '策略',
  port: '端口',
  process: '进程',
  profile: '配置',
  project: '项目',
  prompt: '提示词',
  proxy: '代理',
  python: 'Python',
  query_noun: '查询',
  queue: '队列',
  quota: '配额',
  react: 'React',
  record: '记录',
  request: '请求',
  resource: '资源',
  response: '响应',
  role: '角色',
  route: '路由',
  rule: '规则',
  runtime: '运行时',
  russian: '俄语',
  sandbox: '沙盒',
  schema: '结构',
  screen: '页面',
  script: '脚本',
  sdk: 'SDK',
  security: '安全',
  selector: '选择器',
  sensitivity: '灵敏度',
  server: '服务器',
  service: '服务',
  session: '会话',
  setting: '设置',
  shell: 'Shell',
  shortcut: '快捷键',
  sidebar: '侧边栏',
  skill: '技能',
  slide: '滑动',
  software: '软件',
  source: '源码',
  sqlite: 'SQLite',
  state: '状态',
  status: '状态',
  storage: '存储',
  store: '仓库',
  stream: '流',
  string: '字符串',
  style: '样式',
  subagent: '子智能体',
  summary_noun: '摘要',
  system: '系统',
  tab: '标签页',
  table: '表格',
  target: '目标',
  task: '任务',
  template: '模板',
  terminal: '终端',
  text: '文本',
  theme: '主题',
  thread: '线程',
  timeout: '超时',
  timer: '定时器',
  title: '标题',
  token: 'Token',
  tool: '工具',
  touch: '触控',
  ui: '界面',
  url: 'URL',
  user: '用户',
  value: '值',
  variable: '变量',
  version: '版本',
  video: '视频',
  view: '视图',
  warning: '警告',
  web: 'Web',
  webpage: '网页',
  website: '网站',
  webview: 'Webview',
  wechat: '微信',
  window: '窗口',
  windows: 'Windows',
  workflow: '工作流',
  workspace: '工作区',

  // 常用虚词与连接词
  and: '与',
  for: '针对',
  from: '来自',
  in: '中',
  into: '到',
  of: '的',
  on: '上',
  to: '为',
  via: '通过',
  with: '与'
};

function lookupWordWithStemming(lowerWord) {
  if (OFFLINE_WORD_MAP[lowerWord]) return OFFLINE_WORD_MAP[lowerWord];

  // 常见词形还原
  if (lowerWord.endsWith('ies') && lowerWord.length > 4) {
    const base = lowerWord.slice(0, -3) + 'y';
    if (OFFLINE_WORD_MAP[base]) return OFFLINE_WORD_MAP[base];
  }
  if (lowerWord.endsWith('ing') && lowerWord.length > 5) {
    const base = lowerWord.slice(0, -3);
    if (OFFLINE_WORD_MAP[base]) return OFFLINE_WORD_MAP[base];
    if (OFFLINE_WORD_MAP[base + 'e']) return OFFLINE_WORD_MAP[base + 'e'];
  }
  if (lowerWord.endsWith('ed') && lowerWord.length > 4) {
    const base = lowerWord.slice(0, -2);
    if (OFFLINE_WORD_MAP[base]) return OFFLINE_WORD_MAP[base];
    if (OFFLINE_WORD_MAP[base + 'e']) return OFFLINE_WORD_MAP[base + 'e'];
  }
  if (lowerWord.endsWith('es') && lowerWord.length > 4) {
    const base = lowerWord.slice(0, -2);
    if (OFFLINE_WORD_MAP[base]) return OFFLINE_WORD_MAP[base];
  }
  if (lowerWord.endsWith('s') && lowerWord.length > 3) {
    const base = lowerWord.slice(0, -1);
    if (OFFLINE_WORD_MAP[base]) return OFFLINE_WORD_MAP[base];
  }
  return null;
}

/**
 * 拼接分词结果，确保相邻英文/数字之间保留空格，不产生粘连乱码
 */
function joinTokensSafely(tokens) {
  let out = '';
  for (const tok of tokens) {
    if (!tok) continue;
    if (!out) {
      out = tok;
      continue;
    }
    const prevLast = out[out.length - 1];
    const nextFirst = tok[0];
    const prevAscii = /[A-Za-z0-9]/.test(prevLast);
    const nextAscii = /[A-Za-z0-9]/.test(nextFirst);
    const prevZh = /[\u4e00-\u9fa5]/.test(prevLast);
    const nextZh = /[\u4e00-\u9fa5]/.test(nextFirst);

    if ((prevAscii && nextAscii) || (prevAscii && nextZh) || (prevZh && nextAscii)) {
      out += ' ' + tok;
    } else {
      out += tok;
    }
  }
  return out.trim();
}

/**
 * L4: 离线词根兜底翻译（注意：persistable 永远为 false，绝不固化覆盖真实标题）
 */
function offlineFallbackTranslate(raw) {
  const words = String(raw || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) {
    return { ok: false, translated: raw, source: 'none', persistable: false };
  }

  const resultTokens = [];
  let hitCount = 0;

  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mapped = clean ? lookupWordWithStemming(clean) : null;
    if (mapped) {
      resultTokens.push(mapped);
      if (/[\u4e00-\u9fa5]/.test(mapped)) hitCount++;
    } else {
      resultTokens.push(w);
    }
  }

  if (hitCount > 0) {
    let joined = joinTokensSafely(resultTokens);
    if (joined.length > 36) joined = joined.slice(0, 36).trim();
    if (/[\u4e00-\u9fa5]/.test(joined)) {
      return { ok: true, translated: joined, source: 'offline', persistable: false };
    }
  }

  return { ok: false, translated: raw, source: 'none', persistable: false };
}

/**
 * 执行标题自动翻译（L0 -> L1 -> L2 -> L3 -> L4，含并发 Single-Flight 去重）
 */
async function translateTitle(text, options = {}) {
  const raw = String(text || '').trim();
  const cascadeId = options.cascadeId ? String(options.cascadeId).trim() : '';

  if (!shouldTranslateTitle(raw)) {
    return { ok: true, translated: raw, source: 'skip', persistable: false };
  }

  // L0: 先查历史 ID 字典与本地缓存
  if (!options.bypassCache && !options.offlineOnly) {
    if (cascadeId && cacheStore.idToZh[cascadeId]) {
      return {
        ok: true,
        translated: cacheStore.idToZh[cascadeId],
        source: 'cache',
        persistable: true
      };
    }
    const exactHit = cacheStore.enToZh[raw];
    if (exactHit) {
      return { ok: true, translated: exactHit, source: 'cache', persistable: true };
    }
    const lowerHit = cacheStore.lowerEnToZh[raw.toLowerCase()];
    if (lowerHit) {
      return { ok: true, translated: lowerHit, source: 'cache', persistable: true };
    }
  }

  // 强制离线模式（便于离线单元测试）
  if (options.offlineOnly) {
    return offlineFallbackTranslate(raw);
  }

  // Single-Flight 并发去重
  const flightKey = raw.toLowerCase();
  if (!options.bypassCache && inFlight.has(flightKey)) {
    return inFlight.get(flightKey);
  }

  const job = (async () => {
    // L1: 微软必应翻译
    const bingRes = await translateViaBing(raw);
    if (bingRes) {
      saveCacheEntry(raw, bingRes, cascadeId);
      return { ok: true, translated: bingRes, source: 'bing', persistable: true };
    }

    // L2: 彩云小译
    const caiyunRes = await translateViaCaiyun(raw);
    if (caiyunRes) {
      saveCacheEntry(raw, caiyunRes, cascadeId);
      return { ok: true, translated: caiyunRes, source: 'caiyun', persistable: true };
    }

    // L3: 腾讯交互翻译 TranSmart
    const transmartRes = await translateViaTransmart(raw);
    if (transmartRes) {
      saveCacheEntry(raw, transmartRes, cascadeId);
      return { ok: true, translated: transmartRes, source: 'transmart', persistable: true };
    }

    // L4: 本地离线兜底（不持久化，待网络恢复后再通过在线引擎固化）
    return offlineFallbackTranslate(raw);
  })();

  if (!options.bypassCache) {
    inFlight.set(flightKey, job);
  }

  try {
    return await job;
  } finally {
    if (!options.bypassCache) {
      inFlight.delete(flightKey);
    }
  }
}

// 模块加载时预载入历史字典与持久化缓存
loadCache();

module.exports = {
  translateTitle,
  loadCache,
  cleanTitle,
  offlineFallbackTranslate,
  isPlaceholderTitle,
  shouldTranslateTitle
};
