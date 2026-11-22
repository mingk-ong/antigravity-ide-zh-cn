const fs = require('fs');
const path = require('path');
const { getTargetPaths } = require('./src/config');

const { agyExtDir } = getTargetPaths();
const file = path.join(agyExtDir, 'hub_main_zh.js');
const content = fs.readFileSync(file, 'utf8');

const testCases = [
  // 1. 侧边栏与导航
  { group: '侧边栏导航', name: '通用设置', text: '通用设置' },
  { group: '侧边栏导航', name: '外观偏好', text: '外观偏好' },
  { group: '侧边栏导航', name: '系统通知', text: '系统通知' },
  { group: '侧边栏导航', name: '模型配置', text: '模型配置' },
  { group: '侧边栏导航', name: '内置浏览器', text: '内置浏览器' },
  { group: '侧边栏导航', name: '对话历史', text: '对话历史' },
  { group: '侧边栏导航', name: '自定义扩展与技能', text: '自定义扩展与技能' },
  { group: '侧边栏导航', name: '未归属项目', text: '未归属项目' },
  { group: '侧边栏导航', name: '意见与反馈', text: '意见与反馈' },

  // 2. 页面大标题与长篇说明 (uT)
  { group: '页面大标题与长篇说明', name: '浏览器副标题', text: '配置内置浏览器运行环境、链接打开方式及浏览器子智能体偏好。' },
  { group: '页面大标题与长篇说明', name: '对话历史副标题', text: '未归属具体项目的独立对话会话及全局自定义扩展配置。' },
  { group: '页面大标题与长篇说明', name: '模型用量副标题', text: '管理您的模型使用配额、AI 积分消耗及订阅状态。' },
  { group: '页面大标题与长篇说明', name: '账户设置副标题', text: '管理您的订阅计划、身份凭据及账户全局偏好设置。' },
  { group: '页面大标题与长篇说明', name: '开发者选项副标题', text: '仅供开发者使用的专业调试工具。这些设置不会影响其他正常功能。' },
  { group: '页面大标题与长篇说明', name: '键盘快捷键副标题', text: '用于高效导航与控制的常用键盘快捷键列表。' },
  { group: '页面大标题与长篇说明', name: '自定义扩展副标题', text: '配置智能体默认行为、技能库及 MCP 外部工具服务器。' },

  // 3. 分区小标题 (yT)
  { group: '分区小标题', name: '浏览器子智能体', text: '浏览器子智能体' },
  { group: '分区小标题', name: 'Token 预算消耗', text: 'Token 预算消耗' },
  { group: '分区小标题', name: '技能库', text: '技能库' },
  { group: '分区小标题', name: '指令规则', text: '指令规则' },
  { group: '分区小标题', name: '自定义智能体', text: '自定义智能体' },
  { group: '分区小标题', name: '扩展插件', text: '扩展插件' },
  { group: '分区小标题', name: '系统默认扩展', text: '系统默认扩展' },
  { group: '分区小标题', name: '全局权限', text: '全局权限' },
  { group: '分区小标题', name: '执行机制', text: '执行机制' },

  // 4. 卡片行与下拉值 (xT & sT)
  { group: '卡片行与下拉值', name: '浏览器脚本策略 Label', text: '浏览器 JS 脚本执行策略' },
  { group: '卡片行与下拉值', name: '浏览器脚本策略 Desc', text: '控制智能体是否可以在内置浏览器中运行自定义 JavaScript 脚本以实现复杂交互自动化。' },
  { group: '卡片行与下拉值', name: '浏览器自动化规则 Label', text: '浏览器自动化操作规则' },
  { group: '卡片行与下拉值', name: '默认下载位置 Label', text: '默认下载位置' },
  { group: '卡片行与下拉值', name: '默认下载位置 Desc', text: '设置在内置浏览器中下载文件时保存到的本地文件夹路径。' },
  { group: '卡片行与下拉值', name: '浏览历史记录 Label', text: '浏览历史记录' },
  { group: '卡片行与下拉值', name: '浏览历史记录 Desc', text: '清除内置浏览器的访问历史记录、Cookie 与搜索建议缓存。' },
  { group: '卡片行与下拉值', name: '权限预设模板', text: '权限预设模板' },
  { group: '卡片行与下拉值', name: '工具与终端权限', text: '工具与终端权限' },
  { group: '卡片行与下拉值', name: '网络访问规则', text: '网络访问规则' },
  { group: '卡片行与下拉值', name: '追问排队递交', text: '追问排队递交' },
  { group: '卡片行与下拉值', name: '下拉选项-已禁用', text: '已禁用' },
  { group: '卡片行与下拉值', name: '下拉选项-审查确认', text: '审查确认' },
  { group: '卡片行与下拉值', name: '下拉选项-Turbo 极速全自动', text: 'Turbo 极速全自动' },
  { group: '卡片行与下拉值', name: '下拉选项-内置独立浏览器', text: '内置独立浏览器' },

  // 5. 手写组件核心文本
  { group: '手写组件核心文本', name: 'Token 预算长篇说明', text: '下方图表展示了规则（Rules）、技能（Skills）及 MCP 扩展工具对上下文 Token 预算的占用情况。' },
  { group: '手写组件核心文本', name: '展开明细按钮', text: '展开查看 ${A.length} 项明细' },
  { group: '手写组件核心文本', name: '收起用量明细', text: '收起用量明细' },
  { group: '手写组件核心文本', name: '隐藏工具列表', text: '隐藏工具列表' },
  { group: '手写组件核心文本', name: '降级为路径指针', text: '降级为路径指针' },
  { group: '手写组件核心文本', name: '超出预算已排除', text: '超出预算已排除' },
  { group: '手写组件核心文本', name: '指令规则 (Rules)', text: '指令规则 (Rules)' },
  { group: '手写组件核心文本', name: '返回按钮', text: '返回' },
  { group: '手写组件核心文本', name: '编辑规则按钮', text: '编辑规则' },
  { group: '手写组件核心文本', name: '重置按钮', text: '重置' },
  { group: '手写组件核心文本', name: '立即清除按钮', text: '立即清除' },

  // 6. 全局自适应 DOM 清洗引擎
  { group: '运行时自适应清洗引擎', name: 'DOM 清洗引擎声明', text: 'Antigravity 全局自适应运行时 DOM 清洗引擎' },
  { group: '运行时自适应清洗引擎', name: 'MutationObserver 挂载', text: 'observer.observe(document.body' }
];

console.log('====================================================');
console.log('           Antigravity IDE 全量汉化综合自检           ');
console.log('====================================================\n');

let passed = 0;
let currentGroup = '';

for (const t of testCases) {
  if (t.group !== currentGroup) {
    currentGroup = t.group;
    console.log(`\n【${currentGroup}】`);
  }
  const ok = content.includes(t.text);
  if (ok) {
    passed++;
    console.log(`  ✔ [通过] ${t.name}`);
  } else {
    console.log(`  ❌ [失败] ${t.name} (未找到文本: "${t.text.slice(0, 30)}...")`);
  }
}

console.log('\n====================================================');
console.log(`自检完成: 命中 ${passed} / ${testCases.length} 项 (通过率: ${(passed / testCases.length * 100).toFixed(1)}%)`);
console.log('====================================================');

if (passed !== testCases.length) {
  process.exit(1);
}
