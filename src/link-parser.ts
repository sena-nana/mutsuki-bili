import { type Context, Logger, type Session } from 'koishi'
import type { Config } from './index'
import type { ResolverContext } from './resolvers/base'
import type { ResolverRegistry } from './resolvers/registry'

const logger = new Logger('mutsuki-bili/link-parser')

// ─── 冷却管理 ─────────────────────────────────────────────────────────────────

class LinkCooldownManager {
  private cache = new Map<string, number>()

  constructor(private cooldownMs: number) {}

  check(channelKey: string, resolverName: string, id: string): boolean {
    const key = `${channelKey}:${resolverName}:${id}`
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

// ─── 注册入口 ─────────────────────────────────────────────────────────────────

export function registerLinkParser(
  ctx: Context,
  config: Config,
  registry: ResolverRegistry,
  resolverCtx: ResolverContext,
): void {
  if (!config.linkParser.enabled) return

  const cooldown = new LinkCooldownManager(config.linkParser.cooldown)

  ctx.on('message', async (session: Session) => {
    if (session.selfId === session.userId) return
    if (!session.content) return
    if ((session as Session & { parsed?: { prefix?: string } }).parsed?.prefix !== undefined) return

    const matches = registry.matchAll(session.content)
    if (matches.length === 0) return

    const channelKey = `${session.platform}:${session.channelId}`

    for (const { resolver, id } of matches.slice(0, 3)) {
      if (!cooldown.check(channelKey, resolver.name, id)) continue

      try {
        // 短链接特殊处理：递归解析
        if (resolver.name === 'short') {
          const realUrl = await resolverCtx.api.resolveShortLink(id)
          if (realUrl) {
            const elements = await registry.resolveFirst(realUrl, resolverCtx)
            if (elements?.length) {
              await resolverCtx.api.proxyImages(elements)
              await session.send(elements)
            }
          }
          continue
        }

        const data = await resolver.fetch(id, resolverCtx)
        if (data) {
          const elements = resolver.render(data)
          if (elements.length) {
            await resolverCtx.api.proxyImages(elements)
            await session.send(elements)
          }
        }
      } catch (err) {
        logger.debug('链接解析异常 [%s:%s]: %s', resolver.name, id, String(err))
      }
    }
  })
}
