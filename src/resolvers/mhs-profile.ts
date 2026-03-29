import { h, Logger } from 'koishi'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/mhs-profile')

export interface MhsProfileData {
  id: string
  name: string
  avatarUrl: string
  bio: string
  tags: string[]
}

export class MhsProfileResolver extends ContentResolver<MhsProfileData> {
  readonly name = 'mhs_profile'

  readonly patterns = [
    /(?:https?:\/\/)?(?:www\.)?mihuashi\.com\/profiles\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<MhsProfileData | null> {
    if (!ctx.puppeteer) return null
    let page: import('puppeteer-core').Page | null = null
    try {
      page = await ctx.puppeteer.page()
      await page.setViewport({ width: 1280, height: 800 })
      await page.goto(`https://www.mihuashi.com/profiles/${id}`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      })

      await page.waitForSelector('.profile-header, .user-info, .artist-name, [class*="profile"], [class*="artist"], [class*="userName"]', { timeout: 8000 }).catch(() => {})

      const data = await page.evaluate(() => {
        const nameEl = document.querySelector('.artist-name, .user-name, .profile-name, [class*="userName"], [class*="artistName"], [class*="nickname"]')
          ?? document.querySelector('h1, h2')
        const name = nameEl?.textContent?.trim() ?? ''

        const avatarEl = document.querySelector('.avatar img, .profile-avatar img, [class*="avatar"] img, [class*="Avatar"] img')
        const avatarUrl = avatarEl?.getAttribute('src') ?? ''

        const bioEl = document.querySelector('.bio, .profile-bio, .introduction, [class*="introduction"], [class*="bio"], [class*="desc"]')
        const bio = bioEl?.textContent?.trim() ?? ''

        const tagEls = document.querySelectorAll('.tag, .skill-tag, [class*="tag"] span, [class*="Tag"]')
        const tags = Array.from(tagEls).map(el => el.textContent?.trim() ?? '').filter(Boolean)

        return { name, avatarUrl, bio, tags }
      })

      if (!data.name) {
        logger.debug('米画师画师页面未解析到名称 (id=%s)', id)
        return null
      }

      return { id, ...data }
    } catch (err) {
      logger.debug('米画师画师页面抓取失败 (id=%s): %s', id, String(err))
      return null
    } finally {
      if (page) { try { await page.close() } catch {} }
    }
  }

  render(data: MhsProfileData): h[] {
    const elements: h[] = []
    if (data.avatarUrl) elements.push(h.image(data.avatarUrl))
    let text = `\n【米画师】${data.name}\n`
    if (data.bio) text += `${data.bio}\n`
    if (data.tags.length) text += `标签：${data.tags.join('、')}\n`
    text += `https://www.mihuashi.com/profiles/${data.id}`
    elements.push(h.text(text))
    return elements
  }
}
