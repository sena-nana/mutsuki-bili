import type { h } from 'koishi'
import { Logger } from 'koishi'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/resolver')

export class ResolverRegistry {
  private resolvers: ContentResolver[] = []

  register(resolver: ContentResolver): void {
    this.resolvers.push(resolver)
  }

  /** 从文本中匹配所有链接，返回去重的 { resolver, id } 列表 */
  matchAll(text: string): Array<{ resolver: ContentResolver; id: string }> {
    const results: Array<{ resolver: ContentResolver; id: string }> = []
    const seen = new Set<string>()

    const collect = (resolver: ContentResolver, patterns: RegExp[]) => {
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          const id = resolver.extractId(m)
          const key = `${resolver.name}:${id}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push({ resolver, id })
          }
        }
      }
    }

    // 第一轮：高优先级（URL 模式）
    for (const r of this.resolvers) collect(r, r.patterns)
    // 第二轮：��优先级（裸文本模式）
    for (const r of this.resolvers) collect(r, r.loosePatterns)

    return results
  }

  /** 短链接解析后递归调用：匹配第一个非 short 的 resolver 并 fetch + render */
  async resolveFirst(text: string, ctx: ResolverContext): Promise<h[] | null> {
    const matches = this.matchAll(text)
    for (const { resolver, id } of matches) {
      if (resolver.name === 'short') continue
      try {
        const data = await resolver.fetch(id, ctx)
        if (data) {
          const imageResult = await resolver.renderImage(data, ctx)
          if (imageResult?.length) return imageResult
          return resolver.render(data)
        }
      } catch (err) {
        logger.debug('resolver [%s:%s] 失败: %s', resolver.name, id, String(err))
      }
    }
    return null
  }
}
