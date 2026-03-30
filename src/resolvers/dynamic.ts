import { h, Logger } from 'koishi'
import { cleanBiliUrl } from '../api'
import { buildCardHeader, buildImageGrid, buildVideoAttach, esc, wrapHtml } from '../renderer/template'
import type { DynamicItem } from '../types'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/dynamic')

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

  async renderImage(data: DynamicNotification, ctx: ResolverContext): Promise<h[] | null> {
    if (!ctx.renderHelper?.available) return null
    try {
      const urls = [data.faceUrl, ...data.images]
      if (data.videoThumb) urls.push(data.videoThumb)
      const imageMap = await ctx.renderHelper.prefetchImages(urls)

      let body = buildCardHeader(imageMap.get(data.faceUrl) ?? '', data.userName, '动态')

      if (data.text) {
        body += `<div class="text-content">${esc(data.text)}</div>`
      }

      body += buildImageGrid(data.images, imageMap)

      if (data.videoTitle && data.videoThumb) {
        body += buildVideoAttach(
          imageMap.get(data.videoThumb) ?? '',
          data.videoTitle,
          data.videoLink,
        )
      }

      const buf = await ctx.renderHelper.screenshot(wrapHtml(body))
      return [h.image(buf, 'image/png')]
    } catch (err) {
      logger.warn('动态图片渲染失败: %s', String(err))
      return null
    }
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
      videoLink: archive ? cleanBiliUrl(`https:${archive.jump_url}`) : undefined,
      videoThumb: archive?.cover,
      videoTitle: archive?.title,
    }
  }
}
