import { h } from 'koishi'
import type { LiveRoomInfo } from '../types'

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
}
