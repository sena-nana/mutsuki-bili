import { SHARED_CSS } from './styles'

/** 将 body 内容包装为完整 HTML 文档 */
export function wrapHtml(bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${SHARED_CSS}</style>
</head>
<body>
<div class="card-wrapper">
<div class="card">
${bodyContent}
</div>
</div>
</body>
</html>`
}

/** 生成卡片头部（头像 + 用户名） */
export function buildCardHeader(
  avatarDataUri: string,
  userName: string,
  badge?: string,
): string {
  const badgeHtml = badge ? `<span class="card-badge">${esc(badge)}</span>` : ''
  return `<div class="card-header">
  ${avatarDataUri ? `<img class="avatar" src="${avatarDataUri}">` : ''}
  <div class="user-name">${esc(userName)}${badgeHtml}</div>
</div>`
}

/** 生成图片网格 HTML */
export function buildImageGrid(
  imageUrls: string[],
  imageMap: Map<string, string>,
): string {
  if (!imageUrls.length) return ''

  const total = imageUrls.length
  const maxShow = 9

  // 确定网格列数
  let colsClass: string
  if (total <= 1) colsClass = 'cols-1'
  else if (total <= 4) colsClass = 'cols-2'
  else colsClass = 'cols-3'

  const showCount = Math.min(total, maxShow)
  const overflow = total - maxShow

  let cells = ''

  for (let i = 0; i < showCount; i++) {
    const src = imageMap.get(imageUrls[i]) ?? imageUrls[i]

    // 最后一格：溢出堆叠指示器
    if (overflow > 0 && i === showCount - 1) {
      // 从第9张之后取最多3张小图做堆叠缩略
      const stackUrls = imageUrls.slice(maxShow, maxShow + 3)
      const stackThumbs = stackUrls
        .map(u => `<img class="stack-thumb" src="${imageMap.get(u) ?? u}">`)
        .join('')

      cells += `<div class="overflow-cell">
  <img src="${src}">
  <div class="overflow-overlay">
    <span>+${overflow + 1}</span>
  </div>
  <div class="stack-images">${stackThumbs}</div>
</div>`
    } else {
      cells += `<div class="image-cell"><img src="${src}"></div>`
    }
  }

  return `<div class="image-grid ${colsClass}">${cells}</div>`
}

/** 生成视频附件卡片 */
export function buildVideoAttach(
  thumbDataUri: string,
  title: string,
  link?: string,
): string {
  return `<div class="video-attach">
  <img class="video-thumb" src="${thumbDataUri}">
  <div class="video-info">
    <div class="video-title">${esc(title)}</div>
    ${link ? `<div class="video-link">${esc(link)}</div>` : ''}
  </div>
</div>`
}

/** 生成封面大图 */
export function buildCoverImage(dataUri: string): string {
  if (!dataUri) return ''
  return `<img class="cover-image" src="${dataUri}">`
}

/** 生成信息行 */
export function buildInfoRow(label: string, value: string): string {
  return `<div class="info-row">
  <span class="info-label">${esc(label)}</span>
  <span class="info-value">${esc(value)}</span>
</div>`
}

/** 生成信息行（value 为原始 HTML，不转义） */
export function buildInfoRowHtml(label: string, valueHtml: string): string {
  return `<div class="info-row">
  <span class="info-label">${esc(label)}</span>
  <span class="info-value">${valueHtml}</span>
</div>`
}

/** 生成底部链接 */
export function buildFooter(url: string): string {
  return `<div class="footer">${esc(url)}</div>`
}

/** HTML 转义 */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
