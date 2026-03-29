import type { h } from 'koishi'
import { ContentResolver, type ResolverContext } from './base'

export class ShortLinkResolver extends ContentResolver<null> {
  readonly name = 'short'

  readonly patterns = [
    /(?:https?:\/\/)?b23\.tv\/([A-Za-z0-9]+)/g,
  ]

  async fetch(_id: string, _ctx: ResolverContext): Promise<null> {
    return null
  }

  render(): h[] {
    return []
  }
}
