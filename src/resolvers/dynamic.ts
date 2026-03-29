import { h } from 'koishi'
import type { DynamicItem } from '../types'
import { ContentResolver, type ResolverContext } from './base'

export interface DynamicNotification {
  type: 'dynamic'
  uid: string
  userName: string
  faceUrl: string
  dynamicId: string
  text: string
  images: string[]
  videoLink?: string
  videoThumb?: string
  videoTitle?: string
}

export class DynamicResolver extends ContentResolver<DynamicNotification> {
  readonly name = 'dynamic'

  readonly patterns = [
    /(?:https?:\/\/)?(?:t\.bilibili\.com|(?:www\.)?bilibili\.com\/opus)\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<DynamicNotification | null> {
    const item = await ctx.api.getDynamicDetail(id)
    return this.buildFromItem(item)
  }

  render(data: DynamicNotification): h[] {
    const elements: h[] = []

    const header = `【动态】${data.userName}\n`
    if (data.text) {
      elements.push(h.text(header + data.text + '\n'))
    } else {
      elements.push(h.text(header))
    }

    for (const img of data.images) {
      elements.push(h.image(img))
    }

    if (data.videoThumb) elements.push(h.image(data.videoThumb))
    if (data.videoTitle) {
      elements.push(h.text(`\n视频：${data.videoTitle}\n${data.videoLink ?? ''}`))
    }

    if (!data.videoTitle) {
      elements.push(h.text(`https://t.bilibili.com/${data.dynamicId}`))
    }

    return elements
  }

  buildFromItem(item: DynamicItem): DynamicNotification {
    const author = item.modules?.module_author
    const dynamic = item.modules?.module_dynamic
    const text = dynamic?.desc?.text ?? ''
    const images: string[] = dynamic?.major?.draw?.items?.map(i => i.src) ?? []
    const archive = dynamic?.major?.archive
    const opus = dynamic?.major?.opus

    return {
      type: 'dynamic',
      uid: String(author?.mid ?? ''),
      userName: author?.name ?? '',
      faceUrl: author?.face ?? '',
      dynamicId: item.id_str,
      text: opus?.summary?.text ?? text,
      images: opus?.pics?.map(p => p.url) ?? images,
      videoLink: archive ? `https:${archive.jump_url}` : undefined,
      videoThumb: archive?.cover,
      videoTitle: archive?.title,
    }
  }
}
