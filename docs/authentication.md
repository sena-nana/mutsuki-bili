# 认证与登录

插件需要 B 站账号的 Cookie 来访问部分 API 接口（如动态列表、视频列表等）。提供三种认证方式，按优先级从高到低排列：

1. 配置文件手动填写 Cookie（最高优先级）
2. QR 扫码登录（推荐，Cookie 自动存入数据库）
3. 未登录状态（部分功能可能受限）

---

## 方式一：Web 控制台扫码登录（推荐）

**前提条件：** 已安装并启用 `@koishijs/plugin-console`。

**操作步骤：**

1. 打开 Koishi 控制台（通常为 `http://localhost:5140`）
2. 在左侧边栏找到「哔哩哔哩」页面
3. 点击「获取二维码」按钮
4. 使用 B 站手机 App 扫描二维码
5. 在手机上确认登录
6. 页面显示「登录成功」后即完成

登录成功后，Cookie 自动存储在 `bili.auth_data` 数据库表中，插件重启后会自动读取，无需重复登录。

**退出登录：** 在控制台「哔哩哔哩」页面点击「退出登录」按钮。

---

## 方式二：聊天指令扫码登录

适用于无法访问 Web 控制台的场景。

在聊天中发送：

```
bili.login
```

Bot 会发送一张二维码图片，使用 B 站手机 App 扫描并确认即可。

- 需要**主人权限**（authority >= 4）
- 二维码有效期 3 分钟
- 每 3 秒自动轮询一次扫码状态

---

## 方式三：手动配置 Cookie

如果你更倾向于手动管理认证信息，可以在配置文件中直接填写 B 站 Cookie。

```yaml
plugins:
  mutsuki-bili:
    sessdata: "你的SESSDATA值"
    biliJct: "你的bili_jct值"
    dedeUserId: "你的DedeUserID值"
    buvid3: "你的buvid3值"
```

**获取方法：**

1. 在浏览器中登录 [bilibili.com](https://www.bilibili.com)
2. 按 `F12` 打开开发者工具
3. 切换到 `Application`（应用）选项卡
4. 在左侧 `Storage > Cookies` 下找到 `https://www.bilibili.com`
5. 分别复制 `SESSDATA`、`bili_jct`、`DedeUserID`、`buvid3` 的值

> **注意：** 配置文件中的 Cookie 优先级最高。如果同时配置了 `sessdata` 且通过扫码登录，将始终使用配置文件中的 Cookie。

---

## Cookie 优先级

```
配置文件 Cookie（sessdata 等字段） > 数据库 Cookie（QR 扫码登录） > 未登录
```

插件在每次 API 请求时按此优先级组装 Cookie 请求头。

---

## WBI 签名机制

B 站部分 API（如获取用户视频列表）需要 WBI（Web API 签名）验证。插件已内置 WBI 签名逻辑，用户无需手动操作。

**工作原理：**

1. 自动从 B 站 `nav` 接口获取 WBI 密钥
2. 密钥缓存 6 小时，过期后自动重新获取
3. 对需要签名的请求参数进行排序、拼接、MD5 哈希
4. 自动附加 `w_rid`（签名）和 `wts`（时间戳）参数

> WBI 签名算法基于逆向工程，如果 B 站更新签名方案，可能需要更新插件版本。
