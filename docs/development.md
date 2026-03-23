# 开发者参考

## 项目结构

```
src/
├── index.ts       # 插件入口：导出 name/inject/Config/apply，初始化各模块
├── types.ts       # 类型定义：DB 行类型、API 响应类型、通知载荷类型
├── api.ts         # B 站 API 客户端：封装 4 个 API 接口的请求逻辑
├── auth.ts        # 认证管理：Cookie 组装、WBI 签名、QR 登录流程
├── db.ts          # 数据库模型：注册 6 张表的字段定义
├── commands.ts    # 指令注册：8 个聊天命令的定义和处理逻辑
├── poller.ts      # 轮询引擎：直播/动态/视频三个独立轮询循环
├── formatter.ts   # 消息格式化：将通知载荷转换为 Koishi 消息元素
└── console.ts     # 控制台集成：注册 Web 页面和事件处理器

client/
├── index.ts              # 控制台页面入口：注册 /bili 路由
└── views/
    └── login.vue         # 登录管理 Vue 组件
```

## 架构概览

```
┌─────────────────────────────────────────────────┐
│                   apply()                        │
│                                                  │
│  registerModels ─→ 注册 6 张数据库表              │
│                                                  │
│  AuthManager     ─→ Cookie 管理 + WBI 签名       │
│  BiliApiClient   ─→ B 站 API 请求（依赖 Auth）    │
│  MessageFormatter─→ 通知 → 消息元素               │
│  PollerManager   ─→ 定时轮询（依赖 API + Formatter）│
│                                                  │
│  on('ready') ────→ 同步 admin 预设 + 启动轮询     │
│  registerCommands ─→ 注册聊天指令                  │
│  registerConsole ─→ 注册控制台页面和事件           │
└─────────────────────────────────────────────────┘
```

**数据流：**

1. `PollerManager` 按配置的间隔定时触发轮询
2. 通过 `BiliApiClient` 调用 B 站 API 获取数据
3. 与数据库中的状态缓存比较，检测变化
4. 将变化封装为通知载荷（`AnyNotification`）
5. 通过 `MessageFormatter` 转换为 Koishi 消息元素
6. 查询 `bili.admin` 表获取推送目标
7. 通过 Koishi Bot 发送消息到目标频道

## API 客户端

`BiliApiClient` 封装了 4 个 B 站 API 端点：

| 方法 | 端点 | 用途 | 签名 |
|------|------|------|------|
| `getUserInfo(uid)` | `x/space/acc/info` | 获取 UP 主信息和直播间 ID | 否 |
| `getLiveStatus(roomId)` | `room/v1/Room/get_info` | 获取直播间状态 | 否 |
| `getUserDynamics(uid)` | `x/polymer/web-dynamic/v1/feed/space` | 获取动态列表 | 否 |
| `getUserVideos(uid)` | `x/space/wbi/arc/search` | 获取视频列表 | WBI |

所有请求自动附加 Cookie 和通用请求头。视频列表 API 需要 WBI 签名。

## 扩展：添加新的推送类型

如果要添加新的通知类型（如收藏夹更新、专栏文章等），需要修改以下文件：

1. **`types.ts`** — 添加新的通知载荷接口，加入 `AnyNotification` 联合类型
2. **`api.ts`** — 添加新的 API 请求方法
3. **`poller.ts`** — 添加新的轮询方法和对应的状态表查询逻辑
4. **`formatter.ts`** — 在 `format()` 中添加新类型的消息格式化分支
5. **`db.ts`** — 如果需要状态跟踪，添加对应的数据库表
6. **`types.ts`** — 如果添加了新表，在 `Tables` 声明中注册
7. **`commands.ts`** — 更新 `types` 选项的可选值说明
