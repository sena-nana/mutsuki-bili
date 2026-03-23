# Web 控制台

插件集成了 Koishi 控制台页面，提供可视化的 B 站账号管理功能。

## 前提条件

需要安装并启用 `@koishijs/plugin-console` （>= 5.30.0）。

## 页面信息

| 属性 | 值 |
|------|------|
| 路由路径 | `/bili` |
| 侧边栏名称 | 哔哩哔哩 |
| 图标 | `activity:star` |

## 功能说明

### 查看登录状态

页面加载时自动检测当前的 B 站登录状态，显示：

- **已登录（配置文件）** — 使用配置文件中填写的 Cookie 登录
- **已登录（扫码登录）** — 使用 QR 扫码获取的 Cookie 登录，同时显示用户 UID
- **未登录** — 尚未配置认证信息

### 扫码登录

1. 点击「获取二维码」按钮
2. 页面展示 B 站登录二维码
3. 使用 B 站手机 App 扫描
4. 等待确认，页面实时显示扫码状态：
   - 等待扫码
   - 已扫码，等待确认
   - 登录成功
   - 二维码已过期
5. 登录成功后 Cookie 自动保存

扫码过程中页面每 3 秒自动轮询一次状态。

### 退出登录

点击「退出登录」按钮，将清除数据库中存储的 Cookie 并刷新 WBI 密钥缓存。

> 注意：如果认证来源为配置文件（即手动填写了 `sessdata`），退出登录不会清除配置文件中的值，需手动清除。

## 事件接口

控制台页面通过 WebSocket 与后端通信，使用以下事件：

| 事件名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `bili/get-auth-state` | 无 | `BiliAuthState` | 获取当前登录状态 |
| `bili/generate-qr` | 无 | `{ qrImageUrl, qrcodeKey }` | 生成登录二维码 |
| `bili/poll-qr` | `qrcodeKey: string` | `{ status, message }` | 轮询扫码状态 |
| `bili/logout` | 无 | `void` | 退出登录 |

### BiliAuthState 结构

```typescript
interface BiliAuthState {
  isLoggedIn: boolean
  loginSource: 'config' | 'db' | 'none'
  username?: string
}
```

### 扫码状态码

| 状态码 | 含义 |
|--------|------|
| `0` | 登录成功 |
| `86101` | 未扫码 |
| `86090` | 已扫码，等待确认 |
| `86038` | 二维码已过期 |
