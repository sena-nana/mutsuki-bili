import { type Context, type h, Logger, type Session } from 'koishi'
import type { BiliApiClient } from './api'
import {
  dynamicItemToNotification,
  liveRoomToInfoNotification,
  userInfoToNotification,
  videoDetailToNotification,
} from './converters'
import type { MessageFormatter } from './formatter'
import type { Config } from './index'

const logger = new Logger('mutsuki-bili/link-parser')

// ─── 正则常量 ─────────────────────────────────────────────────────────────────

/** 视频链接：bilibili.com/video/BVxxx 或 bilibili.com/video/avxxx */
const RE_VIDEO_URL = /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10}|av\d+)/g

/** 动态链接：t.bilibili.com/{id} 或 bilibili.com/opus/{id} */
const RE_DYNAMIC_URL = /(?:https?:\/\/)?(?:t\.bilibili\.com|(?:www\.)?bilibili\.com\/opus)\/(\d+)/g

/** 用户空间：space.bilibili.com/{uid} */
const RE_USER_URL = /(?:https?:\/\/)?space\.bilibili\.com\/(\d+)/g

/** 直播间：live.bilibili.com/{roomId} */
const RE_LIVE_URL = /(?:https?:\/\/)?live\.bilibili\.com\/(\d+)/g

/** 短链接：b23.tv/{code} */
const RE_SHORT_URL = /(?:https?:\/\/)?b23\.tv\/([A-Za-z0-9]+)/g

/** 裸 BV 号（Base58 字符集，排除 0/I/O/l） */
const RE_BVID = /\bBV[1-9A-HJ-NP-Za-km-z]{10}\b/g

// ─── 链接类型 ─────────────────────────────────────────────────────────────────

type BiliLinkType = 'video' | 'dynamic' | 'user' | 'live' | 'short'

interface ParsedBiliLink {
  type: BiliLinkType
  id: string
  raw: string
}

// ─── 文本解析 ─────────────────────────────────────────────────────────────────

/** 从文本中提取所有 B 站链接，按特异性从高到低匹配并去重 */
function parseBiliLinks(text: string): ParsedBiliLink[] {
  const results: ParsedBiliLink[] = []
  const seen = new Set<string>()

  const collect = (_regex: RegExp, type: BiliLinkType, raw: string, id: string) => {
    const key = `${type}:${id}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({ type, id, raw })
    }
  }

  // 按特异性从高到低：URL 优先，裸 BV 号最后
  for (const m of text.matchAll(RE_VIDEO_URL)) collect(RE_VIDEO_URL, 'video', m[0], m[1])
  for (const m of text.matchAll(RE_DYNAMIC_URL)) collect(RE_DYNAMIC_URL, 'dynamic', m[0], m[1])
  for (const m of text.matchAll(RE_USER_URL)) collect(RE_USER_URL, 'user', m[0], m[1])
  for (const m of text.matchAll(RE_LIVE_URL)) collect(RE_LIVE_URL, 'live', m[0], m[1])
  for (const m of text.matchAll(RE_SHORT_URL)) collect(RE_SHORT_URL, 'short', m[0], m[1])

  // 裸 BV 号：跳过已被视频 URL 捕获的
  for (const m of text.matchAll(RE_BVID)) {
    const key = `video:${m[0]}`
    if (!seen.has(key)) {
      seen.add(key)
      results.push({ type: 'video', id: m[0], raw: m[0] })
    }
  }

  return results
}

// ─── 小程序卡片解析 ──────────────────────────────────────────────────────────

/** 从消息元素中提取 QQ 小程序/JSON 卡片内的 B 站链接 */
function parseJsonElements(elements: h[]): ParsedBiliLink[] {
  const results: ParsedBiliLink[] = []
  for (const el of elements) {
    if (el.type !== 'json') continue
    try {
      const data = JSON.parse(el.attrs?.data ?? '{}')
      const url = data?.meta?.detail_1?.qqdocurl
        ?? data?.meta?.news?.jumpUrl
        ?? data?.meta?.music?.jumpUrl
        ?? data?.meta?.detail_1?.preview
        ?? ''
      if (url) results.push(...parseBiliLinks(url))
    } catch {}
  }
  return results
}

// ─── 冷却管理 ─────────────────────────────────────────────────────────────────

class LinkCooldownManager {
  private cache = new Map<string, number>()

  constructor(private cooldownMs: number) {}

  check(channelKey: string, link: ParsedBiliLink): boolean {
    const key = `${channelKey}:${link.type}:${link.id}`
    const now = Date.now()
    const last = this.cache.get(key)
    if (last && now - last < this.cooldownMs) return false
    this.cache.set(key, now)
    if (this.cache.size > 500) {
      for (const [k, t] of this.cache) {
        if (now - t > this.cooldownMs * 2) this.cache.delete(k)
      }
    }
    return true
  }
}

// ─── 链接处理分发 ─────────────────────────────────────────────────────────────

async function handleParsedLink(
  link: ParsedBiliLink,
  api: BiliApiClient,
  formatter: MessageFormatter,
): Promise<h[] | null> {
  try {
    switch (link.type) {
      case 'video': {
        const detail = link.id.startsWith('av')
          ? await api.getVideoByAvid(link.id.slice(2))
          : await api.getVideoByBvid(link.id)
        return formatter.format(videoDetailToNotification(detail))
      }

      case 'dynamic': {
        const item = await api.getDynamicDetail(link.id)
        return formatter.format(dynamicItemToNotification(item))
      }

      case 'user': {
        const info = await api.getUserInfo(link.id)
        return formatter.format(userInfoToNotification(info))
      }

      case 'live': {
        const liveInfo = await api.getLiveStatus(link.id)
        return formatter.format(liveRoomToInfoNotification(liveInfo))
      }

      case 'short': {
        const realUrl = await api.resolveShortLink(link.id)
        if (!realUrl) return null
        const subLinks = parseBiliLinks(realUrl)
        const resolved = subLinks.find(l => l.type !== 'short')
        if (!resolved) return null
        return handleParsedLink(resolved, api, formatter)
      }
    }
  } catch (err) {
    logger.debug('处理链接失败 [%s:%s]: %s', link.type, link.id, String(err))
    return null
  }
}

// ─── 去重辅助 ─────────────────────────────────────────────────────────────────

function deduplicateLinks(links: ParsedBiliLink[]): ParsedBiliLink[] {
  const seen = new Set<string>()
  return links.filter(link => {
    const key = `${link.type}:${link.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── 注册入口 ─────────────────────────────────────────────────────────────────

export function registerLinkParser(
  ctx: Context,
  config: Config,
  api: BiliApiClient,
  formatter: MessageFormatter,
): void {
  if (!config.linkParsing) return

  const cooldown = new LinkCooldownManager(config.linkCooldown)

  ctx.on('message', async (session: Session) => {
    if (session.selfId === session.userId) return
    if (!session.content) return
    if ((session as any).parsed?.prefix !== undefined) return

    const textLinks = parseBiliLinks(session.content)
    const jsonLinks = parseJsonElements(session.elements ?? [])
    const allLinks = deduplicateLinks([...textLinks, ...jsonLinks])
    if (allLinks.length === 0) return

    const channelKey = `${session.platform}:${session.channelId}`
    const linksToProcess = allLinks.slice(0, 3)

    for (const link of linksToProcess) {
      if (!cooldown.check(channelKey, link)) continue
      try {
        const elements = await handleParsedLink(link, api, formatter)
        if (elements?.length) {
          await session.send(elements)
        }
      } catch (err) {
        logger.debug('链接解析异常: %s', String(err))
      }
    }
  })
}
