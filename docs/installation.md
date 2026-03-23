# 安装与依赖

## 安装方式

### 通过 npm 安装

```bash
npm install koishi-plugin-mutsuki-bili
```

### 通过 Koishi 市场安装

在 Koishi 控制台的「插件市场」中搜索 `mutsuki-bili`，点击安装即可。

## 必需服务

插件启动时需要以下 Koishi 服务：

| 服务 | 说明 |
|------|------|
| `database` | 用于存储绑定关系、状态缓存、认证数据。支持 Koishi ORM 兼容的任意数据库驱动（SQLite、MySQL、PostgreSQL 等） |
| `http` | 用于调用 B 站 API 接口 |

请确保已安装并启用至少一个数据库插件（如 `@koishijs/plugin-database-sqlite`）。

## 可选依赖

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| `@koishijs/plugin-console` | >= 5.30.0 | 提供 Web 控制台的扫码登录页面。如不使用控制台登录功能可不安装 |

## 环境要求

- Koishi >= 4.18.7
- Node.js >= 18（ES2022 支持）
