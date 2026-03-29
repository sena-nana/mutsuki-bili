import { h, Logger } from 'koishi'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/mhs-stall')

export interface MhsStallData {
  id: string
  title: string
  coverUrl: string
  artistName: string
  price: string
  status: string
}

export class MhsStallResolver extends ContentResolver<MhsStallData> {
  readonly name = 'mhs_stall'

  readonly patterns = [
    /(?:https?:\/\/)?(?:www\.)?mihuashi\.com\/stalls\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<MhsStallData | null> {
    if (!ctx.puppeteer) return null
    let page: import('puppeteer-core').Page | null = null
    try {
      page = await ctx.puppeteer.page()
      await page.setViewport({ width: 1280, height: 800 })
      await page.goto(`https://www.mihuashi.com/stalls/${id}`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      })

      await page.waitForSelector('[class*="stall"], [class*="Stall"], [class*="showcase"], h1, h2', { timeout: 8000 }).catch(() => {})

      const data = await page.evaluate(() => {
        const titleEl = document.querySelector('[class*="stallName"], [class*="title"], h1, h2')
        const title = titleEl?.textContent?.trim() ?? ''

        const coverEl = document.querySelector('[class*="cover"] img, [class*="Cover"] img, [class*="banner"] img, .stall-cover img')
          ?? document.querySelector('[class*="artwork"] img, [class*="gallery"] img')
        const coverUrl = coverEl?.getAttribute('src') ?? ''

        const artistEl = document.querySelector('[class*="artistName"], [class*="userName"], [class*="author"], .artist-name')
        const artistName = artistEl?.textContent?.trim() ?? ''

        const priceEl = document.querySelector('[class*="price"], [class*="Price"]')
        const price = priceEl?.textContent?.trim() ?? ''

        const statusEl = document.querySelector('[class*="status"], [class*="Status"], [class*="state"]')
        const status = statusEl?.textContent?.trim() ?? ''

        return { title, coverUrl, artistName, price, status }
      })

      if (!data.title) {
        logger.debug('米画师橱窗页面未解析到标题 (id=%s)', id)
        return null
      }

      return { id, ...data }
    } catch (err) {
      logger.debug('米画师橱窗页面抓取失败 (id=%s): %s', id, String(err))
      return null
    } finally {
      if (page) { try { await page.close() } catch {} }
    }
  }

  render(data: MhsStallData): h[] {
    const elements: h[] = []
    if (data.coverUrl) elements.push(h.image(data.coverUrl))
    let text = `\n【米画师橱窗】${data.title}\n`
    if (data.artistName) text += `画师：${data.artistName}\n`
    if (data.price) text += `价格：${data.price}\n`
    if (data.status) text += `状态：${data.status}\n`
    text += `https://www.mihuashi.com/stalls/${data.id}`
    elements.push(h.text(text))
    return elements
  }
}
