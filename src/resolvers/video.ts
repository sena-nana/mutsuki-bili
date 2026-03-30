import { h, Logger } from 'koishi'
import { buildCardHeader, buildCoverImage, wrapHtml } from '../renderer/template'
import type { VideoDetail, VideoItem } from '../types'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/video')

export interface VideoNotification {
  type: 'video'
  uid: string
  userName: string
  bvid: string
  title: string
  thumb: string
  desc: string
  pubDate: Date
}

export class VideoResolver extends ContentResolver<VideoNotification> {
  readonly name = 'video'

  readonly patterns = [
    /(?:https?:\/\/)?(?:www\.)?bilibili\.com\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10}|av\d+)/g,
  ]

  readonly loosePatterns = [
    /\bBV[1-9A-HJ-NP-Za-km-z]{10}\b/g,
  ]

  extractId(match: RegExpMatchArray): string {
    return match[1] ?? match[0]
  }

  async fetch(id: string, ctx: ResolverContext): Promise<VideoNotification | null> {
    const detail = id.startsWith('av')
      ? await ctx.api.getVideoByAvid(id.slice(2))
      : await ctx.api.getVideoByBvid(id)
    return this.buildFromDetail(detail)
  }

  render(data: VideoNotification): h[] {
    const elements: h[] = []
    if (data.thumb) elements.push(h.image(data.thumb))
    elements.push(h.text(
      `\n【投稿】${data.userName}\n` +
      `${data.title}\n` +
      `https://www.bilibili.com/video/${data.bvid}`,
    ))
    return elements
  }

  async renderImage(data: VideoNotification, ctx: ResolverContext): Promise<h[] | null> {
    if (!ctx.renderHelper?.available) return null
    try {
      const imageMap = await ctx.renderHelper.prefetchImages([data.thumb])

      let body = buildCardHeader('', data.userName, '投稿')
      body += buildCoverImage(imageMap.get(data.thumb) ?? '')
      body += `<div class="card-title">${data.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>`
      const buf = await ctx.renderHelper.screenshot(wrapHtml(body))
      return [h.image(buf, 'image/png')]
    } catch (err) {
      logger.warn('视频图片渲染失败: %s', String(err))
      return null
    }
  }

  buildFromDetail(detail: VideoDetail): VideoNotification {
    return {
      type: 'video',
      uid: String(detail.owner.mid),
      userName: detail.owner.name,
      bvid: detail.bvid,
      title: detail.title,
      thumb: detail.pic,
      desc: detail.desc,
      pubDate: new Date(detail.pubdate * 1000),
    }
  }

  buildFromItem(item: VideoItem, userName: string, uid: string): VideoNotification {
    return {
      type: 'video',
      uid,
      userName,
      bvid: item.bvid,
      title: item.title,
      thumb: item.pic,
      desc: item.desc,
      pubDate: new Date(item.pubdate * 1000),
    }
  }
}
