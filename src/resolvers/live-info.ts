import { h, Logger } from 'koishi'
import { buildCoverImage, buildInfoRow, wrapHtml } from '../renderer/template'
import { LiveStatus } from '../types'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/live-info')

export interface LiveInfoData {
  roomId: string
  title: string
  coverUrl: string
  areaName: string
  status: '直播中' | '轮播中' | '未开播'
}

export class LiveInfoResolver extends ContentResolver<LiveInfoData> {
  readonly name = 'live'

  readonly patterns = [
    /(?:https?:\/\/)?live\.bilibili\.com\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<LiveInfoData | null> {
    const info = await ctx.api.getLiveStatus(id)
    const status = info.live_status === LiveStatus.LIVE ? '直播中'
      : info.live_status === LiveStatus.REPLAY ? '轮播中' : '未开播'
    return {
      roomId: String(info.room_id),
      title: info.title,
      coverUrl: info.keyframe,
      areaName: info.area_name,
      status,
    }
  }

  render(data: LiveInfoData): h[] {
    const elements: h[] = []
    if (data.coverUrl) elements.push(h.image(data.coverUrl))
    elements.push(h.text(
      `\n【直播间】${data.title}\n` +
      `状态：${data.status}\n` +
      `分区：${data.areaName}\n` +
      `https://live.bilibili.com/${data.roomId}`,
    ))
    return elements
  }

  async renderImage(data: LiveInfoData, ctx: ResolverContext): Promise<h[] | null> {
    if (!ctx.renderHelper?.available) return null
    try {
      const imageMap = await ctx.renderHelper.prefetchImages([data.coverUrl].filter(Boolean))

      const statusClass = data.status === '直播中' ? 'live'
        : data.status === '轮播中' ? 'replay' : 'offline'

      let body = `<div class="card-header">
  <div class="user-name">直播间<span class="status-badge ${statusClass}">${data.status}</span></div>
</div>`
      body += buildCoverImage(imageMap.get(data.coverUrl) ?? '')
      body += buildInfoRow('标题', data.title)
      body += buildInfoRow('分区', data.areaName)
      const buf = await ctx.renderHelper.screenshot(wrapHtml(body))
      return [h.image(buf, 'image/png')]
    } catch (err) {
      logger.warn('直播间图片渲染失败: %s', String(err))
      return null
    }
  }
}
