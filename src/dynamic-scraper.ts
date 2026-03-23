import { type Context, Logger } from 'koishi'
import type { AuthManager } from './auth'
import { COMMON_HEADERS } from './auth'
import type { Config } from './index'
import type { DynamicFeedData, DynamicItem } from './types'

const logger = new Logger('mutsuki-bili/scraper')

/** 同一 UID 的浏览器回退最小间隔 */
const SCRAPE_COOLDOWN = 60_000

/** 网络拦截后等待延迟响应的时间 */
const NETWORK_SETTLE_DELAY = 2000

export class DynamicScraper {
  private lastScrapeTime = new Map<string, number>()

  constructor(
    private ctx: Context,
    private auth: AuthManager,
    private config: Config,
  ) {}

  /** puppeteer 服务是否可用且配置允许回退 */
  get available(): boolean {
    return this.config.puppeteer.fallback && !!(this.ctx as any).puppeteer
  }

  /**
   * 通过无头浏览器获取 UP 主动态数据。
   * 首选方式：网络拦截（获得与 API 一致的数据格式）。
   * 备选方式：DOM 解析。
   */
  async scrapeUserDynamics(uid: string): Promise<{
    items: DynamicItem[]
    offset: string
    hasMore: boolean
  } | null> {
    if (!this.available) {
      logger.warn('puppeteer 服务不可用，无法使用浏览器回退')
      return null
    }

    // 冷却检查：避免同一 UID 频繁调用
    const now = Date.now()
    const lastTime = this.lastScrapeTime.get(uid) ?? 0
    if (now - lastTime < SCRAPE_COOLDOWN) {
      logger.debug('UID %s 浏览器回退冷却中，跳过', uid)
      return null
    }
    this.lastScrapeTime.set(uid, now)

    let page: any = null
    try {
      page = await (this.ctx as any).puppeteer.page()

      // 反指纹 → 设置 UA / 视口 → 注入 Cookie → 导航并拦截
      await this.applyStealthScripts(page)
      await page.setViewport({ width: 1920, height: 1080 })
      await page.setUserAgent(COMMON_HEADERS['User-Agent'])
      await this.injectCookies(page)

      // 首选：通过网络拦截直接获取 API 响应
      const captured = await this.navigateAndCapture(page, uid)
      if (captured && captured.items.length > 0) {
        logger.info('浏览器回退成功获取 %d 条动态 (uid=%s)', captured.items.length, uid)
        return captured
      }

      // 备选：从 DOM 中解析
      logger.debug('网络拦截未获取到数据，尝试 DOM 解析 (uid=%s)', uid)
      const domItems = await this.extractFromDOM(page)
      if (domItems.length > 0) {
        logger.info('DOM 解析获取 %d 条动态 (uid=%s)', domItems.length, uid)
        return { items: domItems, offset: '', hasMore: false }
      }

      logger.warn('浏览器回退未能获取任何动态数据 (uid=%s)', uid)
      return null
    } catch (err) {
      logger.warn('浏览器回退异常 (uid=%s): %s', uid, String(err))
      return null
    } finally {
      if (page) {
        try { await page.close() } catch {}
      }
    }
  }

  // ─── 反指纹 ────────────────────────────────────────────────────────────────

  private async applyStealthScripts(page: any): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      // 1. 隐藏 webdriver 标记
      Object.defineProperty(navigator, 'webdriver', { get: () => false })

      // 2. 模拟 Chrome 默认插件列表
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
          ]
          Object.setPrototypeOf(plugins, PluginArray.prototype)
          return plugins
        },
      })

      // 3. 设置中文语言偏好
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      })

      // 4. 模拟 Chrome 运行时对象
      const w = window as any
      w.chrome = {
        runtime: {},
        loadTimes: () => ({}),
        csi: () => ({}),
      }

      // 5. 覆盖 Permissions API（通知权限返回 denied）
      const originalQuery = navigator.permissions.query.bind(navigator.permissions)
      ;(navigator.permissions as any).query = (params: any) => {
        if (params.name === 'notifications') {
          return Promise.resolve({ state: 'denied', onchange: null } as PermissionStatus)
        }
        return originalQuery(params)
      }

      // 6. 隐藏自动化相关的 CDP 检测
      delete (navigator as any).__proto__.webdriver
    })
  }

  // ─── Cookie 注入 ───────────────────────────────────────────────────────────

  private async injectCookies(page: any): Promise<void> {
    const cookieHeader = await this.auth.buildCookieHeader()
    if (!cookieHeader) return

    const cookies = cookieHeader.split('; ').map(pair => {
      const eqIdx = pair.indexOf('=')
      if (eqIdx === -1) return null
      return {
        name: pair.slice(0, eqIdx),
        value: pair.slice(eqIdx + 1),
        domain: '.bilibili.com',
        path: '/',
      }
    }).filter(Boolean)

    if (cookies.length > 0) {
      await page.setCookie(...cookies)
    }
  }

  // ─── 网络拦截（首选方案）──────────────────────────────────────────────────

  private async navigateAndCapture(page: any, uid: string): Promise<{
    items: DynamicItem[]
    offset: string
    hasMore: boolean
  } | null> {
    let captured: { items: DynamicItem[]; offset: string; hasMore: boolean } | null = null

    // 拦截页面自身发出的动态 API 请求的响应
    page.on('response', async (response: any) => {
      try {
        const url: string = response.url()
        if (url.includes('x/polymer/web-dynamic/v1/feed/space')) {
          const json = await response.json()
          if (json?.code === 0 && json?.data) {
            const data = json.data as DynamicFeedData
            captured = {
              items: data.items ?? [],
              offset: data.offset ?? '',
              hasMore: data.has_more ?? false,
            }
          }
        }
      } catch {}
    })

    const timeout = this.config.puppeteer.timeout ?? 30_000
    await page.goto(`https://space.bilibili.com/${uid}/dynamic`, {
      waitUntil: 'networkidle0',
      timeout,
    })

    // 等待可能延迟到达的响应
    await new Promise<void>(resolve => setTimeout(resolve, NETWORK_SETTLE_DELAY))

    return captured
  }

  // ─── DOM 解析（备选方案）──────────────────────────────────────────────────

  private async extractFromDOM(page: any): Promise<DynamicItem[]> {
    try {
      // 先等待动态卡片出现
      await page.waitForSelector('.bili-dyn-list__item', { timeout: 10_000 })
    } catch {
      return []
    }

    return page.evaluate(() => {
      const cards = document.querySelectorAll('.bili-dyn-list__item')
      const items: any[] = []

      for (const card of cards) {
        // 动态 ID：从卡片链接中提取
        const dynLink = card.querySelector('a[href*="t.bilibili.com"], a[href*="bilibili.com/opus/"]')
        const href = dynLink?.getAttribute('href') ?? ''
        const idMatch = href.match(/(?:t\.bilibili\.com|bilibili\.com\/opus)\/(\d+)/)
        const idStr = idMatch?.[1] ?? ''
        if (!idStr) continue

        // 作者信息
        const authorName = card.querySelector('.bili-dyn-title__text')?.textContent?.trim() ?? ''
        const authorFaceEl = card.querySelector('.bili-dyn-avatar .b-img__inner img, .bili-dyn-avatar img')
        const authorFace = authorFaceEl?.getAttribute('src') ?? ''

        // 文字内容
        const richText = card.querySelector('.bili-rich-text')
        const text = richText?.textContent?.trim() ?? ''

        // 图片（draw 类型）
        const imgEls = card.querySelectorAll('.bili-album__preview img, .bili-dyn-card-orig__img img')
        const images = Array.from(imgEls)
          .map(el => (el as HTMLImageElement).getAttribute('src') ?? '')
          .filter(Boolean)

        // 视频卡片（archive 类型）
        const videoCard = card.querySelector('.bili-dyn-card-video')
        let archive: any
        if (videoCard) {
          const videoCover = videoCard.querySelector('.b-img__inner img')?.getAttribute('src') ?? ''
          const videoTitle = videoCard.querySelector('.bili-dyn-card-video__title')?.textContent?.trim() ?? ''
          const videoLink = videoCard.querySelector('a')?.getAttribute('href') ?? ''
          archive = { cover: videoCover, title: videoTitle, desc: '', jump_url: videoLink }
        }

        // Opus 卡片
        const opusCard = card.querySelector('.bili-dyn-card-opus')
        let opus: any
        if (opusCard) {
          const opusText = opusCard.querySelector('.bili-rich-text')?.textContent?.trim() ?? ''
          const opusPicEls = opusCard.querySelectorAll('.bili-album__preview img, .bili-dyn-card-opus__cover img')
          const opusPics = Array.from(opusPicEls)
            .map(el => (el as HTMLImageElement).getAttribute('src') ?? '')
            .filter(Boolean)
          opus = {
            summary: { text: opusText },
            pics: opusPics.map(url => ({ url })),
            jump_url: href,
          }
        }

        // 组装 DynamicItem
        const hasMajor = archive || images.length > 0 || opus
        items.push({
          id_str: idStr,
          type: archive ? 'DYNAMIC_TYPE_AV' : images.length ? 'DYNAMIC_TYPE_DRAW' : 'DYNAMIC_TYPE_WORD',
          modules: {
            module_author: { name: authorName, face: authorFace, pub_ts: 0 },
            module_dynamic: {
              desc: text ? { text } : undefined,
              major: hasMajor ? {
                type: archive ? 'MAJOR_TYPE_ARCHIVE' : opus ? 'MAJOR_TYPE_OPUS' : 'MAJOR_TYPE_DRAW',
                archive,
                draw: images.length > 0 ? { items: images.map(src => ({ src })) } : undefined,
                opus,
              } : undefined,
            },
          },
        })
      }

      return items
    })
  }
}
