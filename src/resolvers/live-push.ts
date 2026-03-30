import { h, Logger } from 'koishi'
import { buildCardHeader, buildCoverImage, buildInfoRow, wrapHtml } from '../renderer/template'
import type { LiveRoomInfo } from '../types'
import type { ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/live-push')

export interface LiveNotification {
  type: 'live_start' | 'live_end'
  uid: string
  userName: string
  faceUrl: string
  title: string
  coverUrl: string
  areaName: string
  roomId: string
  startedAt: Date
}

export class LivePushResolver {
  build(
    liveInfo: LiveRoomInfo,
    user: { name: string; face: string; uid: string },
    type: 'live_start' | 'live_end',
    roomId: string,
    startedAt: Date,
  ): LiveNotification {
    return {
      type,
      uid: user.uid,
      userName: user.name,
      faceUrl: user.face,
      title: liveInfo.title,
      coverUrl: liveInfo.keyframe,
      areaName: liveInfo.area_name,
      roomId,
      startedAt,
    }
  }

  render(data: LiveNotification): h[] {
    if (data.type === 'live_end') {
      return [h.text(`【下播】${data.userName} 的直播结束了`)]
    }
    const elements: h[] = []
    if (data.coverUrl) elements.push(h.image(data.coverUrl))
    elements.push(h.text(
      `\n【开播】${data.userName}\n` +
      `标题：${data.title}\n` +
      `分区：${data.areaName}\n` +
      `https://live.bilibili.com/${data.roomId}`,
    ))
    return elements
  }

  async renderImage(data: LiveNotification, ctx: ResolverContext): Promise<h[] | null> {
    if (!ctx.renderHelper?.available) return null
    try {
      const urls = [data.faceUrl, data.coverUrl].filter(Boolean)
      const imageMap = await ctx.renderHelper.prefetchImages(urls)

      const badge = data.type === 'live_start' ? '开播' : '下播'

      let body = buildCardHeader(imageMap.get(data.faceUrl) ?? '', data.userName, badge)

      if (data.type === 'live_end') {
        body += `<div class="text-content">${data.userName} 的直播结束了</div>`
      } else {
        body += buildCoverImage(imageMap.get(data.coverUrl) ?? '')
        body += buildInfoRow('标题', data.title)
        body += buildInfoRow('分区', data.areaName)
      }

      const buf = await ctx.renderHelper.screenshot(wrapHtml(body))
      return [h.image(buf, 'image/png')]
    } catch (err) {
      logger.warn('直播推送图片渲染失败: %s', String(err))
      return null
    }
  }
}
