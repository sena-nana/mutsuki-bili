import { h } from 'koishi'
import { LiveStatus } from '../types'
import { ContentResolver, type ResolverContext } from './base'

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
}
