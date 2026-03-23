# 指令系统

## 指令总览

| 指令 | 权限 | 说明 |
|------|------|------|
| `bili` | - | 插件帮助入口 |
| `bili.admin.bind` | 主人 | 绑定 UP 主账号并创建推送订阅 |
| `bili.admin.unbind` | 主人 | 解绑 UP 主账号并取消推送订阅 |
| `bili.admin.list` | 主人 | 查看当前群所有绑定 / 订阅记录 |
| `bili.pause` | 主人 / 绑定者 | 暂停当前群的推送 |
| `bili.resume` | 主人 / 绑定者 | 恢复当前群的推送 |
| `bili.preview` | 主人 / 绑定者 | 发送该 UP 主最新动态的测试推送 |
| `bili.login` | 主人 | 扫码登录 B 站账号 |

> 所有群内指令均需要在群聊中使用（依赖 `guildId`），私聊中无法使用。

---

## 管理指令（主人专属）

### bili.admin.bind

**语法：** `bili.admin.bind <userId> <uid> [-t <types>]`

绑定 UP 主平台账号并创建推送订阅。绑定后，该 UP 主的相关通知将推送到当前聊天频道。

| 参数 | 说明 |
|------|------|
| `userId` | UP 主的平台账号标识。同平台可省略前缀（如直接填 `12345`），跨平台需使用 `platform:userId` 格式 |
| `uid` | UP 主的 B 站 UID |
| `-t / --types` | 推送类型，逗号分隔。可选 `live`、`dynamic`、`video`，默认全部 |

**示例：**

```
bili.admin.bind 12345 67890
bili.admin.bind 12345 67890 -t live,video
bili.admin.bind onebot:12345 67890 -t dynamic
```

**行为说明：**
- `channel` 自动设置为当前聊天频道
- `guildId` 自动设置为当前群组
- 同一群组 + 同一 userId 的记录会被 upsert（更新或插入）
- 绑定成功后会尝试获取 UP 主昵称用于确认回复

---

### bili.admin.unbind

**语法：** `bili.admin.unbind <userId>`

解绑指定的 UP 主平台账号，同时取消所有推送订阅。

| 参数 | 说明 |
|------|------|
| `userId` | 要解绑的平台账号标识。同平台可省略前缀 |

**示例：**

```
bili.admin.unbind 12345
```

---

### bili.admin.list

**语法：** `bili.admin.list`

列出当前群所有 UP 主绑定和订阅记录，包括 UID、推送类型和暂停状态。

**输出示例：**

```
本群 UP主 绑定/订阅列表：
onebot:12345 → UID 67890  [live,dynamic,video]
onebot:54321 → UID 11111  [live]  ⏸暂停
```

---

## 自助指令

以下指令除主人外，绑定的 UP 主本人（userId 匹配的用户）也可以使用。

### bili.pause

**语法：** `bili.pause [uid]`

暂停指定 UID 在当前群的推送通知。

| 参数 | 说明 |
|------|------|
| `uid` | 可选。B 站 UID。不指定时自动使用调用者在本群绑定的 UID |

暂停后该 UP 主的所有推送类型都不会发送到当前群，直到使用 `bili.resume` 恢复。

---

### bili.resume

**语法：** `bili.resume [uid]`

恢复指定 UID 在当前群的推送通知。

| 参数 | 说明 |
|------|------|
| `uid` | 可选。B 站 UID。不指定时自动使用调用者在本群绑定的 UID |

---

### bili.preview

**语法：** `bili.preview [uid]`

获取指定 UP 主的最新动态并发送预览，用于测试推送是否正常工作。

| 参数 | 说明 |
|------|------|
| `uid` | 可选。B 站 UID。不指定时自动使用调用者在本群绑定的 UID |

**输出示例：**

```
[预览] UP主名称 的最新动态：
今天也要加油鸭~
https://t.bilibili.com/123456789
```

---

## 登录指令

### bili.login

**语法：** `bili.login`

生成 B 站扫码登录二维码。Bot 会发送一张二维码图片，使用 B 站手机 App 扫描并确认即可完成登录。

- 需要**主人权限**
- 每 3 秒自动轮询扫码状态
- 二维码有效期约 3 分钟（60 次轮询 × 3 秒）
- 登录成功后 Cookie 自动保存到数据库

---

## 权限模型

插件使用两层权限检查：

| 级别 | 条件 | 可用指令 |
|------|------|----------|
| **主人** | `authority >= 4`（Koishi 主人级别） | 所有指令 |
| **绑定者** | 当前群中存在该 userId + uid 的绑定记录 | `bili.pause`、`bili.resume`、`bili.preview` |

权限检查逻辑：先判断是否为主人（authority >= 4），再查询 `bili.admin` 表是否存在匹配的绑定记录。
