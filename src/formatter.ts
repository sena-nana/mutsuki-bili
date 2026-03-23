import { h } from 'koishi'
import type { AnyNotification, DynamicNotification, LiveNotification, VideoNotification } from './types'

export class MessageFormatter {
  format(notification: AnyNotification): h[] {
    switch (notification.type) {
      case 'live_start': return this.formatLiveStart(notification)
      case 'live_end':   return this.formatLiveEnd(notification)
      case 'dynamic':    return this.formatDynamic(notification)
      case 'video':      return this.formatVideo(notification)
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
}
