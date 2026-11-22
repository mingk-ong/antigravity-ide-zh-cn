/**
 * Antigravity IDE 统一核心注入、安全跨版本备份与特征指纹模块 (Core Injector & Shared Fingerprints)
 *
 * 设计目标：
 * - 让 patcher.js（手动部署）、auto_updater.js（更新自愈重注入）、verifier.js（生效审查）
 *   共享同一份真相源，彻底杜绝“新增功能漏接入自动更新/自检/审查”的漂移问题。
 * - 彻底解决官方版本升级后旧 .bak 覆盖新版官方文件导致内核错配的致命风险。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  computeChecksum,
  computeFileSha256,
  getTargetPaths,
  writeDeployMeta
} = require('./config');
const { agyCommandsMap } = require('./dictionary');
const { loadCache } = require('./title_translator');

// =========================================================================
// 1. 全项目共享特征指纹常量（供自检、探针、审查共用）
// =========================================================================

const PROXY_REQUIRED_ENDPOINTS = [
  '/translate-title',
  '/log-title-persisted',
  '/translate-thought',
  '/thought-cache-stats',
  '/thought-cache-clear'
];

const THOUGHT_TRANSLATOR_REQUIRED_MARKERS = [
  "CACHE_VERSION = 'v2'",
  'pickSafeTagPrefix',
  'sanitizeMarkdownTildes',
  'keepAlive: true'
];

const HUB_ZH_THOUGHT_FEATURE_MARKERS = [
  '__agyThoughtEngine',
  '/translate-thought',
  '思考了 ',
  '查看原文',
  '正在同步中文思考过程…',
  'hideUntranslated',
  'getStepUiState',
  'getLastPointer',
  'data-agy-thought-wrap',
  'thought-collapse-lock',
  'defaultExpanded:_effectiveActive',
  '_scheduleGraceCollapse(350,!0)'
];

const HUB_ZH_TITLE_FEATURE_MARKERS = [
  'XB',
  '软件界面中文化设置',
  '__agyTitleAutoLocalizer',
  'updateConversationAnnotations',
  '/translate-title'
];

const EXTENSION_HOOK_MARKER = 'redirectIframeUrl';
const EXTENSION_HOOK_TARGET = 'renderWebviewHtml(a,b,c,d){Jv(a);';
const EXTENSION_HOOK_REPLACEMENT =
  'renderWebviewHtml(a,b,c,d){try{c=require("../hub_proxy.js").redirectIframeUrl(c)}catch(_e){}Jv(a);';

const WORKBENCH_YHN_TARGET = 'function yhn(t){return t?.annotations?.title?.trim()||t?.summary?.trim()||void 0}';
const WORKBENCH_PATCHED_MARKER = '软件界面中文化设置';

const JETSKI_EST_TARGET = 'function est(e){return e?.annotations?.title?.trim()||e?.summary?.trim()||void 0}';
const JETSKI_UEN_TARGET = 'let h=u.summary||"Untitled Conversation";';
const JETSKI_UEN_REPLACEMENT = 'let h=est(u)||u.summary||"Untitled Conversation";';
const JETSKI_SMA_TARGET = 'item:{id:e.cascadeId,label:e.title,';
const JETSKI_SMA_REPLACEMENT = 'item:{id:e.cascadeId,label:(est(e)||e.title),';
const JETSKI_THOUGHT_PAIRS = [
  ['n>=0?`Thinking for ${Math.max(1,n)}s`:"Thinking"', 'n>=0?`已思考 ${Math.max(1,n)} 秒`:"正在思考"'],
  ['t?`Thought for ${Math.max(1,Number(t.seconds))}s`:"Thought Process"', 't?`思考了 ${Math.max(1,Number(t.seconds))} 秒`:"思考过程"'],
  ['_?`Thought for ${Math.max(1,Number(_.seconds))}s`:"Thought Process"', '_?`思考了 ${Math.max(1,Number(_.seconds))} 秒`:"思考过程"'],
  ['children:"Thinking..."', 'children:"正在思考..."']
];

const JETSKI_PATCHED_MARKERS = [
  '软件界面中文化设置',
  'est(u)||u.summary',
  'est(e)||e.title',
  '已思考 ${Math.max(1,n)} 秒',
  '思考了 ${Math.max(1,Number(t.seconds))} 秒',
  'children:"正在思考..."'
];

// =========================================================================
// 2. 跨版本安全备份与状态判定工具
// =========================================================================

function isAgyPackageLocalized(pkgContent) {
  try {
    const pkg = JSON.parse(pkgContent);
    if (!pkg.contributes || !Array.isArray(pkg.contributes.commands)) return true;
    let totalMapped = 0;
    let localizedCount = 0;
    for (const cmd of pkg.contributes.commands) {
      if (agyCommandsMap[cmd.command]) {
        totalMapped++;
        if (cmd.title === agyCommandsMap[cmd.command]) {
          localizedCount++;
        }
      }
    }
    return totalMapped === 0 || localizedCount === totalMapped;
  } catch (_e) {
    return false;
  }
}

function isAgyPackageHasAnyLocalized(pkgContent) {
  try {
    const pkg = JSON.parse(pkgContent);
    if (!pkg.contributes || !Array.isArray(pkg.contributes.commands)) return false;
    for (const cmd of pkg.contributes.commands) {
      if (agyCommandsMap[cmd.command] && cmd.title === agyCommandsMap[cmd.command]) {
        return true;
      }
    }
    return false;
  } catch (_e) {
    return false;
  }
}

function isWorkbenchPatched(content) {
  return typeof content === 'string' && content.includes(WORKBENCH_PATCHED_MARKER) && !content.includes(WORKBENCH_YHN_TARGET);
}

function isJetskiPatched(content) {
  if (typeof content !== 'string') return false;
  return JETSKI_PATCHED_MARKERS.every(m => content.includes(m));
}

function isJetskiHasAnyPatch(content) {
  if (typeof content !== 'string') return false;
  return content.includes(WORKBENCH_PATCHED_MARKER) || content.includes('est(u)||u.summary') || content.includes('已思考 ${Math.max(1,n)} 秒');
}

function filesAreIdentical(fileA, fileB) {
  if (!fs.existsSync(fileA) || !fs.existsSync(fileB)) return false;
  try {
    return Buffer.compare(fs.readFileSync(fileA), fs.readFileSync(fileB)) === 0;
  } catch (_e) {
    return false;
  }
}

/**
 * 解析当前可用的官方 Hub 静态源 hub_main.js（优先扩展目录最新提取源，否则回退项目根目录源）
 */
function resolveHubSourcePath(agyExtDir, patchDir) {
  const livePath = path.join(agyExtDir, 'hub_main.js');
  const localPath = path.join(patchDir, 'hub_main.js');
  if (fs.existsSync(livePath)) return livePath;
  return localPath;
}

/**
 * 读取当前已安装 Antigravity IDE 的版本号与构建 distro 标识
 */
function readInstalledAppIdentity(appDir) {
  const pkgPath = path.join(appDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { appVersion: '', distro: '' };
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return { appVersion: pkg.version || '', distro: pkg.distro || '' };
  } catch (_e) {
    return { appVersion: '', distro: '' };
  }
}

/**
 * 跨版本防污染安全备份：
 * - 若当前线上文件不含我们的补丁痕迹，说明它是官方原始文件（或官方刚升级的新版原件），
 *   则强制同步刷新 .bak，彻底杜绝“用旧版本 .bak 覆盖新版官方文件”的致命隐患。
 * - 若当前线上文件已含补丁痕迹且 .bak 已存在，保留原 .bak 以保证幂等反复重注入。
 */
function ensureFreshBackup(filePath, isPatchedPredicate, logger) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { existed: false, refreshed: false, backupPath: filePath ? filePath + '.bak' : '' };
  }
  const backupPath = filePath + '.bak';
  const content = fs.readFileSync(filePath, 'utf8');
  const alreadyPatched = typeof isPatchedPredicate === 'function' ? Boolean(isPatchedPredicate(content)) : false;

  if (!alreadyPatched) {
    const needRefresh = !fs.existsSync(backupPath) || !filesAreIdentical(filePath, backupPath);
    if (needRefresh) {
      fs.copyFileSync(filePath, backupPath);
      if (logger) {
        logger(`[备份] 已更新纯净官方原件备份: ${path.basename(filePath)}.bak`);
      }
      return { existed: true, refreshed: true, backupPath };
    }
  } else if (!fs.existsSync(backupPath)) {
    // 线上文件已打补丁但缺少 .bak 时不覆写，避免把已补丁文件错当官方原件
    return { existed: true, refreshed: false, backupPath, missingBackup: true };
  }

  return { existed: true, refreshed: false, backupPath };
}

/**
 * 构造注入 workbench yhn / jetskiAgent est 的会话标题中文化引擎代码
 */
function buildZhTitleEngine(funcName) {
  const merged = loadCache();
  const idToZh = {
    ...(merged.idToZh || {})
  };
  const phraseToZh = {
    ...(merged.enToZh || {}),
    'Change Software Language To Chinese': '软件界面中文化设置',
    'Search Interface Conversation Title Localization': '搜索界面会话标题中文化'
  };
  const lowerToZh = {};
  for (const [k, v] of Object.entries(phraseToZh)) {
    if (typeof k === 'string' && typeof v === 'string') {
      lowerToZh[k.toLowerCase().trim()] = v;
    }
  }

  return `function ${funcName}(t){
  var _raw = t?.annotations?.title?.trim() || t?.summary?.trim() || t?.title?.trim() || (typeof t==='string'?t.trim():void 0);
  if (!_raw) return void 0;
  if (/[\\u4e00-\\u9fa5]/.test(_raw)) return _raw;
  if (_raw === "Untitled Conversation") return "未命名对话";
  if (_raw === "New Conversation") return "新对话";
  if (_raw === "Coordinator") return "智能体助手";
  if (_raw === "Parent Conversation") return "父级对话";
  var _im = ${JSON.stringify(idToZh)};
  var _pm = ${JSON.stringify(phraseToZh)};
  var _pmLow = ${JSON.stringify(lowerToZh)};
  var _cid = t?.cascadeId || t?.id;
  if (_cid && _im[_cid]) return _im[_cid];
  if (_pm[_raw]) return _pm[_raw];
  var _low = _raw.toLowerCase().trim();
  if (_pmLow[_low]) return _pmLow[_low];
  var _am = {
    add:'添加',analyze:'分析',analysis:'分析',audit:'审计',automate:'自动化',backup:'备份',
    block:'拦截',blocker:'拦截器',build:'构建',bypass:'绕过',change:'修改',check:'检查',
    clean:'清理',cleanup:'清理',compile:'编译',configure:'配置',config:'配置',connect:'连接',
    control:'控制',convert:'转换',copy:'复制',create:'创建',custom:'自定义',debug:'调试',
    delete:'删除',deploy:'部署',deployment:'部署',design:'设计',detect:'检测',detection:'检测',
    develop:'开发',development:'开发',diagnose:'诊断',disable:'禁用',download:'下载',edit:'编辑',
    enable:'启用',enhance:'增强',execute:'执行',export:'导出',extract:'提取',fix:'修复',
    generate:'生成',handle:'处理',implement:'实现',import:'导入',improve:'改进',inject:'注入',
    inspect:'审查',install:'安装',integrate:'集成',intercept:'拦截',investigate:'排查',
    launch:'启动',localize:'中文化',localization:'本地化',locate:'定位',lock:'锁定',login:'登录',
    manage:'管理',merge:'合并',migrate:'迁移',missing:'缺失',modify:'修改',monitor:'监控',
    optimize:'优化',optimization:'优化',parse:'解析',patch:'修补',plan:'规划',preview:'预览',
    publish:'发布',query:'查询',read:'读取',rebuild:'重建',recover:'恢复',redirect:'重定向',
    refactor:'重构',refresh:'刷新',remove:'移除',rename:'重命名',render:'渲染',repair:'修复',
    replace:'替换',reset:'重置',resolve:'解决',restore:'还原',retrieve:'检索',review:'审查',
    run:'运行',save:'保存',scan:'扫描',search:'检索',setup:'配置',solve:'解决',start:'启动',
    stop:'停止',summarize:'总结',summary:'总结',switch:'切换',sync:'同步',test:'测试',
    testing:'测试',track:'跟踪',tracking:'跟踪',translate:'翻译',troubleshoot:'排错',
    unlock:'解锁',update:'更新',upgrade:'升级',verify:'验证',watch:'监听',write:'写入'
  };
  var _nm = {
    account:'账户',agent:'智能体',android:'安卓',api:'API',app:'应用',application:'应用程序',
    architecture:'架构',archive:'归档',artifact:'文档',auth:'认证',backend:'后端',
    browser:'浏览器',bug:'Bug',cache:'缓存',chat:'对话',chrome:'Chrome',client:'客户端',
    cloud:'云端',code:'代码',command:'命令',component:'组件',config:'配置',console:'控制台',
    container:'容器',context:'上下文',conversation:'对话',cookie:'Cookie',crash:'崩溃',
    data:'数据',database:'数据库',desktop:'桌面',device:'设备',docker:'Docker',doc:'文档',
    document:'文档',dom:'DOM',domain:'域名',editor:'编辑器',engine:'引擎',environment:'环境',
    error:'错误',exception:'异常',expense:'支出',extension:'扩展',feature:'特性',file:'文件',
    folder:'文件夹',form:'表单',framework:'框架',frontend:'前端',game:'游戏',gesture:'手势',
    git:'Git',guide:'指南',history:'历史',hook:'钩子',host:'宿主',icon:'图标',ide:'IDE',
    image:'图片',input:'输入',interface:'界面',issue:'问题',java:'Java',javascript:'JavaScript',
    json:'JSON',key:'密钥',keyboard:'键盘',language:'语言',launcher:'启动器',layout:'布局',
    link:'链接',log:'日志',logic:'逻辑',manga:'漫画',markdown:'Markdown',memory:'内存',
    menu:'菜单',message:'消息',metadata:'元数据',mod:'模组',mode:'模式',model:'模型',
    module:'模块',network:'网络',node:'Node',notification:'通知',novel:'小说',page:'页面',
    panel:'面板',path:'路径',performance:'性能',permission:'权限',permissions:'权限',
    platform:'平台',plugin:'插件',policy:'策略',port:'端口',process:'进程',project:'项目',
    prompt:'提示词',proxy:'代理',python:'Python',queue:'队列',quota:'配额',react:'React',
    request:'请求',resource:'资源',response:'响应',route:'路由',rule:'规则',rules:'规则',
    russian:'俄语',sandbox:'沙盒',screen:'页面',script:'脚本',security:'安全',
    sensitivity:'灵敏度',server:'服务器',service:'服务',session:'会话',setting:'设置',
    shortcut:'快捷键',sidebar:'侧边栏',skill:'技能',slide:'滑动',software:'软件',
    source:'源码',sqlite:'SQLite',state:'状态',status:'状态',storage:'存储',string:'字符串',
    subagent:'子智能体',system:'系统',tab:'标签页',table:'表格',task:'任务',template:'模板',
    terminal:'终端',text:'文本',theme:'主题',timeout:'超时',title:'标题',token:'Token',
    tool:'工具',tools:'工具',touch:'触控',ui:'界面',url:'URL',user:'用户',version:'版本',
    view:'视图',warning:'警告',web:'Web',webpage:'网页',website:'网站',webview:'Webview',
    wechat:'微信',window:'窗口',windows:'Windows',workflow:'工作流',workspace:'工作区'
  };
  var _ppm = {and:'与',to:'为',for:'针对',in:'中',with:'配合',of:'的',on:'上',from:'来自'};
  var _lookup = function(_lw) {
    if (_am[_lw]) return _am[_lw];
    if (_nm[_lw]) return _nm[_lw];
    if (_lw.endsWith('ies') && _lw.length > 4) { var _b1 = _lw.slice(0,-3)+'y'; if (_am[_b1]||_nm[_b1]) return _am[_b1]||_nm[_b1]; }
    if (_lw.endsWith('ing') && _lw.length > 5) { var _b2 = _lw.slice(0,-3); if (_am[_b2]||_nm[_b2]) return _am[_b2]||_nm[_b2]; if (_am[_b2+'e']||_nm[_b2+'e']) return _am[_b2+'e']||_nm[_b2+'e']; }
    if (_lw.endsWith('ed') && _lw.length > 4) { var _b3 = _lw.slice(0,-2); if (_am[_b3]||_nm[_b3]) return _am[_b3]||_nm[_b3]; if (_am[_b3+'e']||_nm[_b3+'e']) return _am[_b3+'e']||_nm[_b3+'e']; }
    if (_lw.endsWith('s') && _lw.length > 3) { var _b4 = _lw.slice(0,-1); if (_am[_b4]||_nm[_b4]) return _am[_b4]||_nm[_b4]; }
    return null;
  };
  var _w = _raw.split(/\\s+/);
  var _res = [];
  var _hit = 0;
  for (var _i = 0; _i < _w.length; _i++) {
    var _word = _w[_i];
    var _clean = _word.toLowerCase().replace(/[^a-z0-9]/g, '');
    var _hitWord = _lookup(_clean);
    if (_hitWord) { _res.push(_hitWord); _hit++; }
    else if (_ppm[_clean]) { _res.push(_ppm[_clean]); }
    else { _res.push(_word); }
  }
  if (_hit > 0 && _hit * 2 >= _w.length) {
    var _fin = '';
    for (var _j = 0; _j < _res.length; _j++) {
      var _tk = _res[_j];
      if (!_tk) continue;
      if (!_fin) { _fin = _tk; continue; }
      var _pCh = _fin[_fin.length - 1], _nCh = _tk[0];
      if ((/[A-Za-z0-9]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh)) ||
          (/[A-Za-z0-9]/.test(_pCh) && /[\\u4e00-\\u9fa5]/.test(_nCh)) ||
          (/[\\u4e00-\\u9fa5]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh))) {
        _fin += ' ' + _tk;
      } else {
        _fin += _tk;
      }
    }
    _fin = _fin.length > 36 ? _fin.slice(0, 36).trim() : _fin;
    return _fin;
  }
  return _raw;
}`;
}

/**
 * 安全清理 Electron V8 字节码缓存（忽略被运行中进程占用的文件，不强杀 IDE）
 */
function safelyClearV8Cache(cachedDataDir, logger) {
  if (!cachedDataDir || !fs.existsSync(cachedDataDir)) return { cleared: 0, skipped: 0 };
  let cleared = 0;
  let skipped = 0;
  try {
    const entries = fs.readdirSync(cachedDataDir);
    for (const entry of entries) {
      const fullPath = path.join(cachedDataDir, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        cleared++;
      } catch (_e) {
        skipped++;
      }
    }
  } catch (_e) {}
  if (logger && cleared > 0) {
    logger(`✔ [缓存清理] 已安全清理 V8 字节码缓存 ${cleared} 项${skipped > 0 ? `（跳过正在占用的 ${skipped} 项）` : ''}`);
  }
  return { cleared, skipped };
}

/**
 * 统一全量注入流水线（供 patcher.js 与 auto_updater.js 共用）
 */
function applyAllPatches(options = {}) {
  const patchDir = path.resolve(options.patchDir || path.join(__dirname, '..'));
  const logger = typeof options.logger === 'function' ? options.logger : (msg) => console.log(msg);
  const stdio = options.buildStdio || 'inherit';

  const {
    installDir,
    appDir,
    agyExtDir,
    cachedDataDir,
    productJsonPath,
    agyExtPackagePath
  } = getTargetPaths();

  if (!fs.existsSync(installDir)) {
    throw new Error(`未找到 Antigravity IDE 安装目录: ${installDir}`);
  }

  const outDir = path.join(appDir, 'out');
  const extJsPath = path.join(agyExtDir, 'vscode', 'extension.js');
  const liveHubMainPath = path.join(agyExtDir, 'hub_main.js');
  const localHubMainPath = path.join(patchDir, 'hub_main.js');
  const wbPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  const jkPath = path.join(outDir, 'jetskiAgent', 'main.js');
  const pkgJsonPath = path.join(appDir, 'package.json');

  // 1. 同步官方最新版静态资产 hub_main.js（避免旧工作区缓存遮蔽新版本官方原件）
  if (fs.existsSync(liveHubMainPath)) {
    if (!fs.existsSync(localHubMainPath) || !filesAreIdentical(liveHubMainPath, localHubMainPath)) {
      fs.copyFileSync(liveHubMainPath, localHubMainPath);
      logger(`✔ [资产同步] 已同步当前官方 hub_main.js 至本地构建源 (${(fs.statSync(localHubMainPath).size / 1024 / 1024).toFixed(2)} MB)`);
    }
  }

  // 2. 跨版本安全备份关键文件（若检测到官方新版覆盖，自动刷新 .bak）
  const extBackupInfo = ensureFreshBackup(extJsPath, c => c.includes(EXTENSION_HOOK_MARKER), logger);
  const pkgBackupInfo = ensureFreshBackup(agyExtPackagePath, isAgyPackageHasAnyLocalized, logger);
  const wbBackupInfo = ensureFreshBackup(wbPath, isWorkbenchPatched, logger);
  const jkBackupInfo = ensureFreshBackup(jkPath, isJetskiHasAnyPatch, logger);

  // 若核心内核文件刚刷新了官方原件备份，则同步刷新 product.json.bak
  const anyCoreRefreshed = extBackupInfo.refreshed || wbBackupInfo.refreshed || jkBackupInfo.refreshed;
  if (fs.existsSync(productJsonPath)) {
    const prodBak = productJsonPath + '.bak';
    if (!fs.existsSync(prodBak) || anyCoreRefreshed) {
      fs.copyFileSync(productJsonPath, prodBak);
      logger('[备份] 已更新纯净官方原件备份: product.json.bak');
    }
  }

  // 3. 汉化 agy package.json
  if (fs.existsSync(agyExtPackagePath)) {
    try {
      const sourcePkgPath = fs.existsSync(agyExtPackagePath + '.bak') ? agyExtPackagePath + '.bak' : agyExtPackagePath;
      const rawPkg = fs.readFileSync(sourcePkgPath, 'utf8');
      const pkg = JSON.parse(rawPkg);
      let pkgModified = false;

      if (pkg.contributes && Array.isArray(pkg.contributes.commands)) {
        for (const cmd of pkg.contributes.commands) {
          if (agyCommandsMap[cmd.command] && cmd.title !== agyCommandsMap[cmd.command]) {
            cmd.title = agyCommandsMap[cmd.command];
            pkgModified = true;
          }
        }
      }
      if (pkgModified) {
        const nextStr = JSON.stringify(pkg, null, 2);
        const curStr = fs.readFileSync(agyExtPackagePath, 'utf8');
        if (curStr !== nextStr) {
          fs.writeFileSync(agyExtPackagePath, nextStr, 'utf8');
          logger('✔ [扩展] agy 扩展命令配置汉化完成');
        }
      }
    } catch (e) {
      logger(`⚠ agy package.json 处理跳过: ${e.message}`);
    }
  }

  // 4. 调用唯一权威构建脚本编译并部署 hub_main_zh.js
  const ultimateBuildScript = path.join(patchDir, 'build_ultimate_chinese_engine.js');
  if (!fs.existsSync(ultimateBuildScript)) {
    throw new Error('未找到终极构建脚本: ' + ultimateBuildScript);
  }
  logger('\n[Hub] 调用终极权威引擎构建并部署 hub_main_zh.js...');
  execSync(`"${process.execPath}" "${ultimateBuildScript}"`, { cwd: patchDir, stdio });

  // 5. 同步代理与双翻译微服务
  const syncPairs = [
    { src: path.join(patchDir, 'src', 'hub_proxy.template.js'), dst: path.join(agyExtDir, 'hub_proxy.js'), label: '本地 Hub 透明代理模块' },
    { src: path.join(patchDir, 'src', 'title_translator.js'), dst: path.join(agyExtDir, 'title_translator.js'), label: '标题翻译微服务模块' },
    { src: path.join(patchDir, 'src', 'thought_translator.js'), dst: path.join(agyExtDir, 'thought_translator.js'), label: '思维链实时翻译微服务模块' }
  ];
  for (const item of syncPairs) {
    if (fs.existsSync(item.src)) {
      if (!fs.existsSync(item.dst) || !filesAreIdentical(item.src, item.dst)) {
        fs.copyFileSync(item.src, item.dst);
        logger(`✔ [同步] 已更新${item.label}: ${item.dst}`);
      } else {
        logger(`✔ [同步] ${item.label}已为最新版本: ${path.basename(item.dst)}`);
      }
    }
  }

  // 6. 注入 extension.js Webview 代理重定向钩子
  if (fs.existsSync(extJsPath)) {
    let extContent = fs.readFileSync(extJsPath, 'utf8');
    if (!extContent.includes(EXTENSION_HOOK_MARKER)) {
      if (extContent.includes(EXTENSION_HOOK_TARGET)) {
        extContent = extContent.replace(EXTENSION_HOOK_TARGET, EXTENSION_HOOK_REPLACEMENT);
        fs.writeFileSync(extJsPath, extContent, 'utf8');
        logger('✔ [扩展] 已成功注入 Webview 代理拦截重定向钩子');
      } else {
        logger('⚠ [扩展] 未定位到 renderWebviewHtml 注入锚点，跳过');
      }
    } else {
      logger('✔ [扩展] Webview 代理钩子已存在，无需重复注入');
    }
  }

  // 7. 会话标题双核注入：workbench.desktop.main.js
  if (fs.existsSync(wbPath)) {
    const wbSrcPath = fs.existsSync(wbPath + '.bak') ? wbPath + '.bak' : wbPath;
    let wbCode = fs.readFileSync(wbSrcPath, 'utf8');
    if (wbCode.includes(WORKBENCH_YHN_TARGET)) {
      wbCode = wbCode.replace(WORKBENCH_YHN_TARGET, buildZhTitleEngine('yhn'));
      fs.writeFileSync(wbPath, wbCode, 'utf8');
      logger('✔ [会话标题] 已成功注入 workbench 标题输出枢纽 yhn(t)');
    } else if (isWorkbenchPatched(wbCode)) {
      logger('✔ [会话标题] workbench 标题输出枢纽 yhn(t) 已就绪');
    } else {
      logger('⚠ [会话标题] 未定位到 workbench yhn(t) 锚点（外围增强跳过，不影响主窗口运行）');
    }
  }

  // 8. 会话标题与思考标签注入：jetskiAgent/main.js
  if (fs.existsSync(jkPath)) {
    const jkSrcPath = fs.existsSync(jkPath + '.bak') ? jkPath + '.bak' : jkPath;
    let jkCode = fs.readFileSync(jkSrcPath, 'utf8');
    let jkChanged = false;

    if (jkCode.includes(JETSKI_EST_TARGET)) {
      jkCode = jkCode.replace(JETSKI_EST_TARGET, buildZhTitleEngine('est'));
      jkChanged = true;
      logger('✔ [会话标题] 已成功注入 jetskiAgent 标题输出枢纽 est(e)');
    }
    if (jkCode.includes(JETSKI_UEN_TARGET)) {
      jkCode = jkCode.replace(JETSKI_UEN_TARGET, JETSKI_UEN_REPLACEMENT);
      jkChanged = true;
      logger('✔ [会话标题] 已拦截 uEn 列表渲染函数');
    }
    if (jkCode.includes(JETSKI_SMA_TARGET)) {
      jkCode = jkCode.replace(JETSKI_SMA_TARGET, JETSKI_SMA_REPLACEMENT);
      jkChanged = true;
      logger('✔ [会话标题] 已拦截 sMa 搜索项渲染函数');
    }

    let jkThoughtHits = 0;
    for (const [fromStr, toStr] of JETSKI_THOUGHT_PAIRS) {
      if (jkCode.includes(fromStr)) {
        jkCode = jkCode.split(fromStr).join(toStr);
        jkThoughtHits++;
        jkChanged = true;
      }
    }
    if (jkThoughtHits > 0) {
      logger(`✔ [思维链标签] 已汉化 jetskiAgent 思考标签 (${jkThoughtHits}/${JETSKI_THOUGHT_PAIRS.length} 处)`);
    }
    if (jkChanged) {
      fs.writeFileSync(jkPath, jkCode, 'utf8');
    } else if (isJetskiPatched(jkCode)) {
      logger('✔ [jetskiAgent] 标题与思考标签注入已就绪');
    } else {
      logger('⚠ [jetskiAgent] 未定位到外围注入锚点（跳过，不影响主窗口运行）');
    }
  }

  // 9. 更新 product.json 完整性校验和
  let syncedChecksums = 0;
  if (fs.existsSync(productJsonPath)) {
    try {
      const prodJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
      if (prodJson.checksums) {
        for (const relPath in prodJson.checksums) {
          const fullTarget = path.join(outDir, relPath);
          if (fs.existsSync(fullTarget)) {
            const curHash = computeChecksum(fs.readFileSync(fullTarget));
            if (prodJson.checksums[relPath] !== curHash) {
              prodJson.checksums[relPath] = curHash;
              syncedChecksums++;
            }
          }
        }
        if (syncedChecksums > 0) {
          fs.writeFileSync(productJsonPath, JSON.stringify(prodJson, null, '\t'), 'utf8');
        }
        logger(`✔ [校验和自愈] product.json 全量自愈同步完成 (共对齐 ${syncedChecksums} 项，彻底杜绝安装损坏弹窗)`);
      }
    } catch (e) {
      logger(`⚠ product.json 校验和更新跳过: ${e.message}`);
    }
  }

  // 10. 安全清理 V8 字节码缓存
  safelyClearV8Cache(cachedDataDir, logger);

  // 11. 写入包含版本与源哈希指纹的本机部署元数据
  const { appVersion, distro } = readInstalledAppIdentity(appDir);
  const hubSourcePath = resolveHubSourcePath(agyExtDir, patchDir);

  writeDeployMeta(agyExtDir, path.join(patchDir, 'src'), {
    appVersion,
    distro,
    hubSourceSha256: computeFileSha256(hubSourcePath),
    buildEngineSha256: computeFileSha256(ultimateBuildScript),
    syncedChecksums
  });

  return {
    appVersion,
    distro,
    syncedChecksums
  };
}

module.exports = {
  PROXY_REQUIRED_ENDPOINTS,
  THOUGHT_TRANSLATOR_REQUIRED_MARKERS,
  HUB_ZH_THOUGHT_FEATURE_MARKERS,
  HUB_ZH_TITLE_FEATURE_MARKERS,
  EXTENSION_HOOK_MARKER,
  EXTENSION_HOOK_TARGET,
  WORKBENCH_YHN_TARGET,
  WORKBENCH_PATCHED_MARKER,
  JETSKI_EST_TARGET,
  JETSKI_UEN_TARGET,
  JETSKI_SMA_TARGET,
  JETSKI_THOUGHT_PAIRS,
  JETSKI_PATCHED_MARKERS,
  isAgyPackageLocalized,
  isWorkbenchPatched,
  isJetskiPatched,
  filesAreIdentical,
  resolveHubSourcePath,
  readInstalledAppIdentity,
  ensureFreshBackup,
  buildZhTitleEngine,
  applyAllPatches
};
