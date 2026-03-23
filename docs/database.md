# 数据库结构

插件使用 Koishi ORM 注册了 6 张数据库表，所有表名以 `bili.` 为前缀。

## 表概览

| 表名 | 主键 | 用途 |
|------|------|------|
| `bili.admin` | `id`（自增） | 绑定关系与推送订阅 |
| `bili.user` | `uid` | UP 主基本信息缓存 |
| `bili.live_state` | `uid` | 直播状态快照 |
| `bili.dynamic_state` | `uid` | 动态轮询进度 |
| `bili.video_state` | `uid` | 视频轮询进度 |
| `bili.auth_data` | `key` | 认证数据存储 |

---

## bili.admin

存储 UP 主绑定关系和推送订阅配置。同一个 UP 主可被多个群订阅。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `id` | unsigned（自增） | - | 自增主键 |
| `guildId` | string(127) | - | 群组标识，格式 `platform:guildId` |
| `channel` | string(127) | `""` | 推送目标频道，格式 `platform:channelId` |
| `userId` | string(127) | - | UP 主的平台账号标识，格式 `platform:userId` |
| `uid` | string(63) | - | B 站 UID |
| `types` | string(63) | `"live,dynamic,video"` | 订阅的推送类型，逗号分隔 |
| `paused` | boolean | `false` | 是否暂停推送 |

**Upsert 键：** `guildId` + `userId`（同一群组中同一平台账号只能绑定一条记录）

---

## bili.user

缓存 UP 主的基本信息，由轮询过程自动更新。

| 字段 | 类型 | 说明 |
|------|------|------|
| `uid` | string(63) | B 站 UID（主键） |
| `name` | string(255) | UP 主昵称 |
| `faceUrl` | text | 头像 URL |
| `liveRoomId` | string(63) | 直播间 ID，`"0"` 表示无直播间 |
| `checkedAt` | timestamp | 最后一次信息获取时间 |

---

## bili.live_state

记录每个 UP 主的直播状态快照，用于检测开播 / 下播状态变化。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uid` | string(63) | - | B 站 UID（主键） |
| `isLive` | boolean | `false` | 当前是否在直播 |
| `title` | string(255) | `""` | 直播间标题 |
| `coverUrl` | text | `""` | 直播间封面 / 关键帧图片 URL |
| `areaName` | string(127) | `""` | 直播分区名称 |
| `startedAt` | timestamp | - | 开播时间 |
| `updatedAt` | timestamp | - | 最后一次状态检查时间 |

---

## bili.dynamic_state

记录每个 UP 主的动态轮询进度，用于去重。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uid` | string(63) | - | B 站 UID（主键） |
| `lastDynamicId` | string(63) | `"0"` | 上次处理的最新动态 ID。`"0"` 表示未初始化（首次轮询） |
| `checkedAt` | timestamp | - | 最后一次检查时间 |

---

## bili.video_state

记录每个 UP 主的视频轮询进度，用于去重。

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `uid` | string(63) | - | B 站 UID（主键） |
| `lastBvid` | string(63) | `""` | 上次处理的最新视频 BV 号。空字符串表示未初始化 |
| `checkedAt` | timestamp | - | 最后一次检查时间 |

---

## bili.auth_data

存储认证数据（主要用于 QR 扫码登录获取的 Cookie）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `key` | string(63) | 数据键名（主键），目前固定为 `"cookie"` |
| `value` | text | JSON 格式的 Cookie 键值对 |
| `updatedAt` | timestamp | 最后一次更新时间 |

**Value 示例：**

```json
{
  "SESSDATA": "xxx",
  "bili_jct": "xxx",
  "DedeUserID": "123456",
  "DedeUserID__ckMd5": "xxx",
  "buvid3": "xxx"
}
```

---

## platform:id 格式约定

插件中 `guildId`、`channel`、`userId` 等字段统一使用 `platform:id` 格式：

| 示例 | 说明 |
|------|------|
| `onebot:123456789` | QQ（OneBot）群号 123456789 |
| `discord:987654321` | Discord 频道 ID |
| `telegram:111222333` | Telegram 群组 ID |

`platform` 对应 Koishi 中适配器的平台名称。
