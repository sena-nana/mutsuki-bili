# koishi-plugin-mutsuki-bili

[![npm](https://img.shields.io/npm/v/koishi-plugin-mutsuki-bili?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-mutsuki-bili)

> B 站 UP 主推送插件 — 监控直播 / 动态 / 视频投稿，自动推送到多平台聊天频道。

## 功能特性

- **直播监控** — 开播 / 下播通知，包含封面、标题、分区和直播间链接
- **动态监控** — 图文动态、转发、视频动态等多种类型
- **视频监控** — 新视频投稿通知，包含封面、标题和视频链接
- **多平台推送** — 通过 Koishi 适配器支持 QQ、Discord、Telegram 等平台
- **扫码登录** — Web 控制台或聊天指令扫码登录 B 站账号
- **灵活管理** — 群级绑定、按类型订阅、暂停 / 恢复推送
- **自动重试** — 指数退避重试 + API 限速保护

## 快速开始

### 安装

```bash
npm install koishi-plugin-mutsuki-bili
```

或在 Koishi 控制台「插件市场」中搜索 `mutsuki-bili` 安装。

### 最小配置示例

```yaml
plugins:
  mutsuki-bili:
    admins:
      - guildId: "onebot:123456789"
        channel: "onebot:123456789"
        userId: "onebot:987654321"
        uid: "12345"
```

### 登录 B 站

**推荐方式：** 打开 Koishi 控制台 → 侧边栏「哔哩哔哩」→ 点击获取二维码 → B 站 App 扫码确认。

也可以在聊天中发送 `bili.login` 进行扫码登录（需主人权限）。

## 指令一览

| 指令 | 权限 | 说明 |
|------|------|------|
| `bili.admin.bind <userId> <uid>` | 主人 | 绑定 UP 主并创建推送订阅 |
| `bili.admin.unbind <userId>` | 主人 | 解绑 UP 主并取消推送 |
| `bili.admin.list` | 主人 | 查看当前群的绑定列表 |
| `bili.pause [uid]` | 主人 / 绑定者 | 暂停推送 |
| `bili.resume [uid]` | 主人 / 绑定者 | 恢复推送 |
| `bili.preview [uid]` | 主人 / 绑定者 | 预览最新动态 |
| `bili.login` | 主人 | 扫码登录 B 站 |

## 配置项

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `admins` | `AdminEntry[]` | `[]` | UP 主绑定 / 订阅预设 |
| `sessdata` | `string` | `""` | SESSDATA Cookie（高级） |
| `biliJct` | `string` | `""` | bili_jct Cookie |
| `dedeUserId` | `string` | `""` | DedeUserID Cookie |
| `buvid3` | `string` | `""` | buvid3 Cookie |
| `liveInterval` | `number` | `60000` | 直播检测间隔（ms） |
| `dynamicInterval` | `number` | `120000` | 动态检测间隔（ms） |
| `videoInterval` | `number` | `300000` | 视频检测间隔（ms） |
| `maxRetries` | `number` | `3` | 最大重试次数 |
| `backoffFactor` | `number` | `2` | 退避系数 |
| `rateLimitBackoff` | `number` | `300000` | 限速等待时间（ms） |

## 文档

详细文档请参阅 [docs/](./docs/index.md) 目录：

- [安装与依赖](./docs/installation.md)
- [配置项详解](./docs/configuration.md)
- [认证与登录](./docs/authentication.md)
- [指令系统](./docs/commands.md)
- [推送功能](./docs/notifications.md)
- [数据库结构](./docs/database.md)
- [Web 控制台](./docs/console.md)
- [故障排除](./docs/troubleshooting.md)
- [开发者参考](./docs/development.md)

## 许可证

MIT
