export const SHARED_CSS = /* css */`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    margin: 0;
    padding: 0;
    background: transparent;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
      'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* ─── 外层包装（渐变背景 + 间距） ─────────────────────────────── */

  .card-wrapper {
    padding: 20px;
    border-radius: 20px;
    background: linear-gradient(135deg, #e0ecff 0%, #f0e6ff 50%, #ffe6f0 100%);
    display: inline-block;
  }

  /* ─── 主卡片（白色圆角容器） ──────────────────────────────────── */

  .card {
    position: relative;
    max-width: 460px;
    background: #fff;
    border-radius: 16px;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.04),
      0 8px 32px rgba(0, 0, 0, 0.06);
    padding: 20px;
    overflow: hidden;
  }

  /* ─── 头部：头像 + 用户名 ─────────────────────────────────────── */

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }

  .user-name {
    font-size: 15px;
    font-weight: 600;
    color: #1a1a2e;
    line-height: 1.3;
  }

  .card-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 500;
    color: #fff;
    background: linear-gradient(135deg, #667eea, #764ba2);
    padding: 2px 8px;
    border-radius: 10px;
    margin-left: 8px;
    vertical-align: middle;
  }

  /* ─── 文字内容 ────────────────────────────────────────────────── */

  .text-content {
    font-size: 14px;
    line-height: 1.65;
    color: #2c2c3a;
    margin-bottom: 14px;
    word-break: break-word;
    white-space: pre-wrap;
  }

  /* ─── 图片网格 ────────────────────────────────────────────────── */

  .image-grid {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
    border-radius: 12px;
    overflow: hidden;
  }

  .image-grid.cols-1 {
    grid-template-columns: 1fr;
  }

  .image-grid.cols-2 {
    grid-template-columns: 1fr 1fr;
  }

  .image-grid.cols-3 {
    grid-template-columns: 1fr 1fr 1fr;
  }

  .image-cell {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.03);
  }

  .image-cell img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    object-position: top;
  }

  /* ─── 溢出堆叠指示器 ──────────────────────────────────────────── */

  .overflow-cell {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
  }

  .overflow-cell img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    object-position: top;
    filter: blur(2px) brightness(0.6);
  }

  .overflow-cell .stack-images {
    position: absolute;
    bottom: 6px;
    right: 6px;
    display: flex;
  }

  .overflow-cell .stack-images .stack-thumb {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    object-fit: cover;
    border: 1.5px solid rgba(255, 255, 255, 0.7);
    margin-left: -8px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .overflow-cell .stack-images .stack-thumb:first-child {
    margin-left: 0;
  }

  .overflow-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(2px);
  }

  .overflow-overlay span {
    font-size: 22px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  }

  /* ─── 视频附件卡片 ────────────────────────────────────────────── */

  .video-attach {
    display: flex;
    gap: 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 10px;
    padding: 10px;
    margin-bottom: 14px;
    align-items: center;
  }

  .video-attach .video-thumb {
    width: 120px;
    min-width: 120px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    object-position: top;
    border-radius: 6px;
  }

  .video-attach .video-info {
    flex: 1;
    min-width: 0;
  }

  .video-attach .video-title {
    font-size: 13px;
    font-weight: 600;
    color: #1a1a2e;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .video-attach .video-link {
    display: none;
  }

  /* ─── 封面图（单张大图，用于视频/直播） ────────────────────────── */

  .cover-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    object-position: top;
    border-radius: 10px;
    margin-bottom: 14px;
  }

  /* ─── 信息行 ──────────────────────────────────────────────────── */

  .info-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #555;
    margin-bottom: 6px;
  }

  .info-label {
    color: #888;
    flex-shrink: 0;
  }

  .info-value {
    color: #2c2c3a;
  }

  .status-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 10px;
    color: #fff;
  }

  .status-badge.live {
    background: linear-gradient(135deg, #ff6b6b, #ee5a24);
  }

  .status-badge.replay {
    background: linear-gradient(135deg, #f9ca24, #f0932b);
  }

  .status-badge.offline {
    background: rgba(0, 0, 0, 0.25);
  }

  /* ─── 底部链接（隐藏） ────────────────────────────────────────── */

  .footer {
    display: none;
  }

  /* ─── 签名 / 描述 ─────────────────────────────────────────────── */

  .signature {
    font-size: 13px;
    color: #666;
    line-height: 1.5;
    margin-bottom: 10px;
    font-style: italic;
  }

  /* ─── 标题 ────────────────────────────────────────────────────── */

  .card-title {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a2e;
    line-height: 1.4;
    margin-bottom: 10px;
  }
`
