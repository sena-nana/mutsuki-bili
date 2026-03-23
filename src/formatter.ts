import { h } from 'koishi'
import type {
  AnyNotification,
  DynamicNotification,
  LiveInfoNotification,
  LiveNotification,
  UserNotification,
  VideoNotification,
} from './types'

export class MessageFormatter {
  format(notification: AnyNotification): h[] {
    switch (notification.type) {
      case 'live_start': return this.formatLiveStart(notification)
      case 'live_end':   return this.formatLiveEnd(notification)
      case 'dynamic':    return this.formatDynamic(notification)
      case 'video':      return this.formatVideo(notification)
      case 'user':       return this.formatUser(notification)
      case 'live_info':  return this.formatLiveInfo(notification)
    }
  }

  private formatLiveStart(n: LiveNotification): h[] {
    const elements: h[] = []
    if (n.coverUrl) elements.push(h.image(n.coverUrl))
    elements.push(h.text(
      `\n【开播】${n.userName}\n` +
      `标题：${n.title}\n` +
      `分区：${n.areaName}\n` +
      `https://live.bilibili.com/${n.roomId}`,
    ))
    return elements
  }

  private formatLiveEnd(n: LiveNotification): h[] {
    return [h.text(`【下播】${n.userName} 的直播结束了`)]
  }

  private formatDynamic(n: DynamicNotification): h[] {
    const elements: h[] = []

    const header = `【动态】${n.userName}\n`
    if (n.text) {
      elements.push(h.text(header + n.text + '\n'))
    } else {
      elements.push(h.text(header))
    }

    for (const img of n.images) {
      elements.push(h.image(img))
    }

    if (n.videoThumb) elements.push(h.image(n.videoThumb))
    if (n.videoTitle) {
      elements.push(h.text(`\n视频：${n.videoTitle}\n${n.videoLink ?? ''}`))
    }

    if (!n.videoTitle) {
      elements.push(h.text(`https://t.bilibili.com/${n.dynamicId}`))
    }

    return elements
  }

  private formatVideo(n: VideoNotification): h[] {
    const elements: h[] = []
    if (n.thumb) elements.push(h.image(n.thumb))
    elements.push(h.text(
      `\n【投稿】${n.userName}\n` +
      `${n.title}\n` +
      `https://www.bilibili.com/video/${n.bvid}`,
    ))
    return elements
  }

  private formatUser(n: UserNotification): h[] {
    const elements: h[] = []
    if (n.faceUrl) elements.push(h.image(n.faceUrl))
    let text = `\n【UP主】${n.userName}\n`
    if (n.sign) text += `签名：${n.sign}\n`
    text += `https://space.bilibili.com/${n.uid}`
    if (n.liveRoomUrl) {
      text += `\n直播间：${n.liveRoomUrl}（${n.liveStatus ?? '未知'}）`
    }
    elements.push(h.text(text))
    return elements
  }

  private formatLiveInfo(n: LiveInfoNotification): h[] {
    const elements: h[] = []
    if (n.coverUrl) elements.push(h.image(n.coverUrl))
    elements.push(h.text(
      `\n【直播间】${n.title}\n` +
      `状态：${n.status}\n` +
      `分区：${n.areaName}\n` +
      `https://live.bilibili.com/${n.roomId}`,
    ))
    return elements
  }
}
