# koishi-plugin-mutsuki-bili

Koishi 4.x 插件，用于推送 B 站 UP主 的直播、动态、视频等信息到聊天频道，同时支持 B 站链接自动解析。

## 功能特性

- **直播推送** — 检测 UP主 开播/下播状态变化，自动推送封面、标题、分区等信息
- **动态推送** — 检测 UP主 新发布的动态（文字、图片、视频动态），推送内容摘要
- **视频推送** — 检测 UP主 新发布的视频投稿，推送封面、标题、BV 号链接
- **链接解析** — 自动识别聊天中的 B 站链接（视频/动态/用户/直播/短链接），展示详情卡片
- **控制台扫码登录** — 在 Koishi 控制台通过 B 站 App 扫码登录，无需手动配置 Cookie
- **权限体系** — 主人管理 + 群内 UP主 管理员自助操作
- **用户绑定** — 普通用户可绑定自己的 B 站账号并通过签名验证
- **风控回退** — 当 API 触发 B 站风控（352）时，可选使用 Puppeteer 浏览器方式获取数据

## 安装与依赖

### 必需服务

- `database` — 任意 Koishi 数据库插件（如 `plugin-database-sqlite`、`plugin-database-mysql`）
- `http` — Koishi 内置 HTTP 服务

### 可选服务

- `console`（`@koishijs/plugin-console`） — 启用后可在 Koishi 控制台使用扫码登录面板
- `puppeteer`（`koishi-plugin-puppeteer`） — 启用后在 API 风控时使用浏览器回退获取动态

## 配置项

### admins — UP主 绑定/订阅预设

在 Koishi 控制台或 `koishi.yml` 中配置初始订阅列表，插件启动时自动同步到数据库。

```yaml
admins:
  - guildId: "qq:123456789"       # 群组标识 (platform:guildId)
    channel: "qq:123456789"       # 推送目标频道 (platform:channelId)
    userId: "qq:987654321"        # UP主 的平台账号 (platform:userId)
    uid: "12345"                  # B 站 UID
    types:                        # 推送类型（可选，默认全部）
      - live
      - dynamic
      - video
```

### auth — 认证配置（隐藏）

Cookie 认证字段默认在控制台 UI 中隐藏。推荐使用控制台扫码登录（见下文）。如需手动配置，可直接编辑 `koishi.yml`：

| 字段 | 说明 |
|------|------|
| `auth.sessdata` | SESSDATA cookie |
| `auth.biliJct` | bili_jct cookie |
| `auth.dedeUserId` | DedeUserID cookie |
| `auth.buvid3` | buvid3 cookie |

### polling — 轮询间隔

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `polling.liveInterval` | 1 分钟 | 直播状态检测间隔 |
| `polling.dynamicInterval` | 2 分钟 | 动态检测间隔 |
| `polling.videoInterval` | 5 分钟 | 视频检测间隔 |

### retry — 重试策略

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `retry.maxRetries` | 3 | 单次请求最大重试次数 |
| `retry.backoffFactor` | 2 | 指数退避系数 |
| `retry.rateLimitBackoff` | 5 分钟 | 触发 429 限速后的等待时间 |

### puppeteer — 浏览器回退

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `puppeteer.fallback` | `true` | API 触发风控(352)时是否使用浏览器回退获取动态 |
| `puppeteer.timeout` | 30 秒 | 浏览器回退的页面加载超时时间 |

### linkParser — 链接解析

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `linkParser.enabled` | `true` | 是否开启聊天消息中的 B 站链接自动解析 |
| `linkParser.cooldown` | 1 分钟 | 同一链接在同一频道的解析冷却时间 |

## 认证设置

插件需要 B 站账号认证才能正常获取动态、视频等数据。提供两种认证方式：

### 方式一：控制台扫码登录（推荐）

1. 确保已安装并启用 `@koishijs/plugin-console`
2. 打开 Koishi 控制台，在左侧导航栏找到「哔哩哔哩」页面
3. 点击「获取登录二维码」按钮
4. 使用 B 站 App 扫描二维码并确认登录
5. 登录成功后页面自动刷新，显示登录状态

登录信息保存在数据库中，插件重启后无需重新登录。

### 方式二：聊天指令登录

在群内发送 `bili.login`（需主人权限），机器人会发送二维码图片，使用 B 站 App 扫码即可。

### 方式三：手动配置 Cookie（高级）

直接编辑 `koishi.yml`，在插件配置的 `auth` 字段中填入 B 站 Cookie。手动配置的 Cookie 优先级高于扫码登录。

## 指令参考

### 管理指令（需主人权限，authority >= 4）

| 指令 | 说明 |
|------|------|
| `bili.admin.bind <userId> <uid>` | 绑定 UP主 账号并订阅推送 |
| `bili.admin.unbind <userId>` | 解绑 UP主 账号并取消订阅 |
| `bili.admin.list` | 查看当前群所有绑定/订阅 |
| `bili.login` | 扫码登录 B 站账号 |

**`bili.admin.bind` 选项**：
- `-t <types>` — 推送类型，逗号分隔，可选 `live`、`dynamic`、`video`，默认全部

**示例**：
```
bili.admin.bind qq:123456 12345              # 绑定并订阅所有类型
bili.admin.bind qq:123456 12345 -t live      # 仅订阅直播推送
bili.admin.bind qq:123456 12345 -t live,video # 订阅直播和视频
```

### 自助指令（需绑定关系或已验证的用户绑定）

| 指令 | 说明 |
|------|------|
| `bili.pause [uid]` | 暂停当前群的推送 |
| `bili.resume [uid]` | 恢复当前群的推送 |
| `bili.preview [uid]` | 发送该 UP主 最新动态的测试推送 |

`uid` 参数可省略，默认使用当前用户的绑定 UID。

### 用户绑定指令（所有用户可用）

| 指令 | 说明 |
|------|------|
| `bili.binduid <uid>` | 发起 B 站账号绑定 |
| `bili.verify` | 验证绑定（检查个性签名中的验证码） |
| `bili.unbinduid` | 解除 B 站账号绑定 |
| `bili.myuid` | 查看当前绑定状态 |

**绑定流程**：
1. 发送 `bili.binduid <你的B站UID>`
2. 机器人回复一个验证码（如 `mutsuki-a1b2c3`）
3. 将验证码添加到你的 B 站个性签名中
4. 发送 `bili.verify` 完成验证
5. 验证完成后可移除签名中的验证码

## 权限体系

```
主人 (authority >= 4)
  ├── 管理所有群的 UP主 绑定/订阅
  ├── 扫码登录 B 站账号
  └── 暂停/恢复/预览任意 UP主 的推送

群内 UP主 管理员（通过 bili.admin.bind 绑定的用户）
  └── 暂停/恢复/预览自己绑定的 UP主 的推送

已验证用户（通过 bili.binduid + bili.verify 绑定的用户）
  └── 暂停/恢复/预览自己绑定的 UP主 的推送

普通用户
  ├── 绑定/验证/解绑自己的 B 站账号
  └── 被动接收推送消息
```

## 推送机制

### 订阅模型

插件采用「绑定即订阅」模型：
- `bili.admin.bind` 同时创建管理员绑定和推送订阅
- `bili.admin.unbind` 同时移除管理员绑定和推送订阅
- 没有独立的「订阅」操作

### 轮询逻辑

插件启动后，分别以配置的间隔轮询三种内容：

1. **直播** — 获取 UP主 直播间状态，检测开播/下播状态变化
2. **动态** — 获取 UP主 最新动态 ID，通过 BigInt 比较检测新动态
3. **视频** — 获取 UP主 最新投稿，通过 BV 号比较检测新视频

首次轮询时仅初始化状态基线，不会触发推送（避免重启时重复推送）。

### 推送类型控制

每个订阅可独立控制推送类型（`live`、`dynamic`、`video`），通过 `-t` 选项在绑定时指定，或在控制台 `admins` 配置中设置。

### 暂停与恢复

通过 `bili.pause` / `bili.resume` 可临时暂停或恢复某个 UP主 在某个群的推送，不会删除订阅关系。

## 链接解析

当 `linkParser.enabled` 开启时（默认开启），插件会自动识别聊天消息中的 B 站链接并展示详情。

### 支持的链接类型

| 类型 | 格式示例 |
|------|----------|
| 视频 | `bilibili.com/video/BV1xx...` 或 `bilibili.com/video/av12345` |
| 动态 | `t.bilibili.com/123456` 或 `bilibili.com/opus/123456` |
| 用户空间 | `space.bilibili.com/12345` |
| 直播间 | `live.bilibili.com/12345` |
| 短链接 | `b23.tv/AbCdEf` |
| 裸 BV 号 | `BV1xx4y1H7xx`（消息中直接出现） |
| B 站分享卡片 | QQ 转发链接卡片、小程序分享卡片中嵌入的 B 站链接 |

同一链接在同一频道内有冷却时间（默认 1 分钟），避免重复解析。单条消息最多解析 3 个链接。

卡片解析会尝试展开 JSON/XML/CQ 码中的 `jumpUrl`、`qqdocurl`、`pagepath` 等字段，并支持从 B 站小程序路径中的 `bvid`、`avid`、动态 ID、直播间 ID 等参数派生出可解析链接。

## 风控处理

B 站可能对高频 API 请求触发风控（返回 code 352）。插件提供多层防护：

1. **请求间隔** — 同一轮询周期内，不同 UID 之间有 2 秒间隔
2. **指数退避** — 请求失败时自动指数退避重试
3. **限速等待** — 触发 HTTP 429 后等待配置的 `rateLimitBackoff` 时间
4. **Puppeteer 回退** — 动态 API 触发 352 时，可选使用无头浏览器直接访问 B 站页面获取数据

Puppeteer 回退方案包含反指纹措施（隐藏 webdriver 标记、模拟 Chrome 插件列表等），并通过两种方式获取数据：
- 优先：网络拦截（捕获页面自身发出的 API 请求响应）
- 备选：DOM 解析（从页面元素中提取动态信息）

## 数据库表

插件使用以下数据库表（自动创建）：

| 表名 | 说明 |
|------|------|
| `bili.admin` | UP主 绑定/订阅关系，包含推送频道、类型、暂停状态 |
| `bili.user` | UP主 信息缓存（昵称、头像、直播间 ID） |
| `bili.live_state` | 直播状态缓存（用于检测状态变化） |
| `bili.dynamic_state` | 最新动态 ID 缓存（用于检测新动态） |
| `bili.video_state` | 最新视频 BV 号缓存（用于检测新视频） |
| `bili.auth_data` | 认证数据存储（QR 登录 Cookie 等） |
| `bili.binding` | 用户 B 站账号绑定与验证记录 |

## 项目结构

```
src/
├── index.ts            # 插件入口、配置定义、启动编排
├── types.ts            # 共享类型定义、数据库表类型声明
├── db.ts               # 数据库表结构注册
├── auth.ts             # B 站认证：Cookie 组装、WBI 签名、QR 登录
├── api.ts              # B 站 API 客户端，含重试与错误处理
├── poller.ts           # 轮询调度：直播/动态/视频检测与推送分发
├── formatter.ts        # 消息格式化：通知对象 → Satori 消息元素
├── converters.ts       # API 响应 → 通知对象的转换函数
├── console.ts          # Koishi 控制台集成：登录状态查询与扫码事件
├── dynamic-scraper.ts  # Puppeteer 浏览器回退方案
├── link-parser.ts      # 聊天消息中的 B 站链接自动解析
└── commands/
    ├── index.ts        # 指令注册入口
    ├── admin.ts        # 管理指令（bind/unbind/list）
    ├── user.ts         # 用户指令（pause/resume/preview）
    ├── binding.ts      # 绑定指令（binduid/verify/unbinduid/myuid）
    ├── login.ts        # 登录指令（login）
    └── helpers.ts      # 鉴权辅助函数

client/
├── index.ts            # 控制台前端入口，注册 /bili 页面
└── views/
    └── login.vue       # 登录状态展示与扫码登录 Vue 组件
```
