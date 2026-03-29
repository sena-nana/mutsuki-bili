import { h } from 'koishi'
import { LiveStatus } from '../types'
import { ContentResolver, type ResolverContext } from './base'

export interface UserNotification {
  type: 'user'
  uid: string
  userName: string
  faceUrl: string
  sign: string
  liveRoomUrl?: string
  liveStatus?: string
}

export class UserResolver extends ContentResolver<UserNotification> {
  readonly name = 'user'

  readonly patterns = [
    /(?:https?:\/\/)?space\.bilibili\.com\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<UserNotification | null> {
    const info = await ctx.api.getUserInfo(id)
    return {
      type: 'user',
      uid: String(info.mid),
      userName: info.name,
      faceUrl: info.face,
      sign: info.sign ?? '',
      liveRoomUrl: info.live_room?.url,
      liveStatus: info.live_room
        ? (info.live_room.liveStatus === LiveStatus.LIVE ? '直播中' : '未开播')
        : undefined,
    }
  }

  render(data: UserNotification): h[] {
    const elements: h[] = []
    if (data.faceUrl) elements.push(h.image(data.faceUrl))
    let text = `\n【UP主】${data.userName}\n`
    if (data.sign) text += `签名：${data.sign}\n`
    text += `https://space.bilibili.com/${data.uid}`
    if (data.liveRoomUrl) {
      text += `\n直播间：${data.liveRoomUrl}（${data.liveStatus ?? '未知'}）`
    }
    elements.push(h.text(text))
    return elements
  }
}
