# 配置项详解

## 配置总览

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `admins` | `AdminEntry[]` | `[]` | UP 主绑定 / 订阅预设 |
| `sessdata` | `string` | `""` | SESSDATA Cookie（高级用法） |
| `biliJct` | `string` | `""` | bili_jct Cookie |
| `dedeUserId` | `string` | `""` | DedeUserID Cookie |
| `buvid3` | `string` | `""` | buvid3 Cookie |
| `liveInterval` | `number`（ms） | `60000` | 直播检测间隔（1 分钟） |
| `dynamicInterval` | `number`（ms） | `120000` | 动态检测间隔（2 分钟） |
| `videoInterval` | `number`（ms） | `300000` | 视频检测间隔（5 分钟） |
| `maxRetries` | `number` | `3` | 单次 API 请求最大重试次数 |
| `backoffFactor` | `number` | `2` | 重试退避系数 |
| `rateLimitBackoff` | `number`（ms） | `300000` | 触发限速后的等待时间（5 分钟） |

---

## UP 主绑定预设 (admins)

`admins` 字段用于在配置文件中静态预设 UP 主的绑定和订阅关系。插件启动时会自动将这些记录同步（upsert）到 `bili.admin` 数据库表中。

### AdminEntry 字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `guildId` | `string` | 是 | 群组标识，格式：`platform:guildId` |
| `channel` | `string` | 是 | 推送频道，格式：`platform:channelId` |
| `userId` | `string` | 是 | UP 主的平台账号标识，格式：`platform:userId` |
| `uid` | `string` | 是 | B 站 UID |
| `types` | `string[]` | 否 | 推送类型，可选 `live`、`dynamic`、`video`，默认全部 |

### 配置示例

```yaml
plugins:
  mutsuki-bili:
    admins:
      - guildId: "onebot:123456789"
        channel: "onebot:123456789"
        userId: "onebot:987654321"
        uid: "12345"
        types:
          - live
          - dynamic
          - video
      - guildId: "onebot:111222333"
        channel: "onebot:111222333"
        userId: "onebot:444555666"
        uid: "67890"
        types:
          - live
```

> **`platform:id` 格式说明**
>
> 本插件中所有涉及平台标识的字段均使用 `platform:id` 格式，其中 `platform` 为 Koishi 适配器名称（如 `onebot`、`discord`、`telegram`），`id` 为对应平台的原始 ID。

---

## 认证 Cookie（高级用法）

如果你不想使用扫码登录，可以手动填写 B 站 Cookie。这些字段配置后优先级最高，会覆盖通过 QR 扫码获取的 Cookie。

| 字段 | 说明 |
|------|------|
| `sessdata` | B 站登录凭证，用于访问需要身份验证的 API |
| `biliJct` | CSRF Token，部分接口需要 |
| `dedeUserId` | B 站用户 ID |
| `buvid3` | 设备标识 |

获取方式详见 [认证与登录 - 手动配置 Cookie](./authentication.md#方式三手动配置-cookie)。

> 一般建议通过控制台扫码登录，更简单安全。

---

## 轮询间隔

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `liveInterval` | 60000（1 分钟） | 直播状态检测间隔 |
| `dynamicInterval` | 120000（2 分钟） | 动态更新检测间隔 |
| `videoInterval` | 300000（5 分钟） | 新视频投稿检测间隔 |

- 间隔值的单位为毫秒
- 不建议设置过短的间隔，否则可能触发 B 站 API 限速
- 如果监控的 UP 主数量较多，建议适当增大间隔

---

## 重试与限速

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `maxRetries` | 3 | API 请求失败后的最大重试次数 |
| `backoffFactor` | 2 | 重试间隔的指数退避系数 |
| `rateLimitBackoff` | 300000（5 分钟） | 收到 HTTP 429（限速）后的等待时间 |

**重试机制说明：**

1. 首次重试等待 1 秒
2. 后续每次重试等待时间 = 上次等待时间 × `backoffFactor`
3. 例如 `backoffFactor=2` 时：1s → 2s → 4s
4. 触发 429 限速时，直接等待 `rateLimitBackoff` 后再重试
5. 检测到 Cookie 过期（错误码 -101 / -111）时，不再重试并记录警告日志
