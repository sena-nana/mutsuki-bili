import { type Context, type HTTP, Logger } from 'koishi'
import type { } from 'koishi-plugin-puppeteer'
import { COMMON_HEADERS } from '../auth'

const logger = new Logger('mutsuki-bili/renderer')

/** base64 占位符：浅灰渐变 SVG */
const PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0%" stop-color="#e8e8e8"/>' +
    '<stop offset="100%" stop-color="#d0d0d0"/>' +
    '</linearGradient></defs>' +
    '<rect width="320" height="180" fill="url(#g)"/>' +
    '</svg>',
  ).toString('base64')

export class RenderHelper {
  constructor(
    private ctx: Context,
    private http: HTTP,
  ) {}

  /** puppeteer 服务是否可用 */
  get available(): boolean {
    return !!this.ctx.puppeteer
  }

  /** 并行预取图片为 base64 data URI */
  async prefetchImages(urls: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>()
    const unique = [...new Set(urls.filter(Boolean))]

    await Promise.allSettled(
      unique.map(async (url) => {
        try {
          const data = await this.http.get<ArrayBuffer>(url, {
            responseType: 'arraybuffer',
            headers: {
              ...COMMON_HEADERS,
              Referer: 'https://www.bilibili.com/',
            },
          })
          const buf = Buffer.from(data)
          const mime = detectMime(buf, url)
          map.set(url, `data:${mime};base64,${buf.toString('base64')}`)
        } catch {
          map.set(url, PLACEHOLDER)
        }
      }),
    )

    return map
  }

  /** 将完整 HTML 文档截图为 PNG buffer */
  async screenshot(html: string): Promise<Buffer> {
    let page: import('puppeteer-core').Page | null = null
    try {
      page = await this.ctx.puppeteer.page()
      await page.setViewport({ width: 480, height: 800, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load', timeout: 10_000 })

      const card = await page.$('.card-wrapper')
      if (!card) throw new Error('Card element not found')

      const screenshot = await card.screenshot({ type: 'png' })
      return Buffer.from(screenshot)
    } finally {
      if (page) { try { await page.close() } catch {} }
    }
  }
}

function detectMime(buf: Buffer, url: string): string {
  // 检查 magic bytes
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49) return 'image/webp'
  // 默认 JPEG，也检查 URL 后缀
  if (url.includes('.webp')) return 'image/webp'
  if (url.includes('.png')) return 'image/png'
  return 'image/jpeg'
}
