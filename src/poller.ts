import { type Context, type h, Logger } from 'koishi'
import { type BiliApiClient, BiliApiError, RateLimitError, RiskControlError } from './api'
import type { Config } from './index'
import { DynamicResolver } from './resolvers/dynamic'
import { LivePushResolver } from './resolvers/live-push'
import { VideoResolver } from './resolvers/video'
import { BOT_STATUS_ONLINE, LiveStatus } from './types'
import type { BiliLiveState, DynamicItem } from './types'

const logger = new Logger('mutsuki-bili/poller')

const INTER_UID_DELAY = 2000  // 每个 UID 之间的间隔，防止启动时触发限速

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

export class PollerManager {
  private livePush = new LivePushResolver()
  private dynamicResolver = new DynamicResolver()
  private videoResolver = new VideoResolver()

  constructor(
    private ctx: Context,
    private config: Config,
    private api: BiliApiClient,
  ) {}

  start() {
    this.ctx.setInterval(() => this.pollLive(), this.config.polling.liveInterval)
    this.ctx.setInterval(() => this.pollDynamic(), this.config.polling.dynamicInterval)
    this.ctx.setInterval(() => this.pollVideo(), this.config.polling.videoInterval)
  }

  // ─── 重试辅助 ──────────────────────────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>): Promise<T | null> {
    let delay = 1000
    for (let i = 0; i <= this.config.retry.maxRetries; i++) {
      try {
        return await fn()
      } catch (err) {
        if (err instanceof RateLimitError) {
          logger.warn('触发限速，等待 %ds', this.config.retry.rateLimitBackoff / 1000)
          await sleep(this.config.retry.rateLimitBackoff)
          continue
        }
        if (err instanceof RiskControlError) {
          logger.warn('触发风控(352)且浏览器回退不可用/失败')
          return null
        }
        if (err instanceof BiliApiError && (err.code === -101 || err.code === -111)) {
          logger.warn('Cookie 可能已过期 (code=%d)，请重新登录', err.code)
          return null
        }
        if (i < this.config.retry.maxRetries) {
          await sleep(delay)
          delay *= this.config.retry.backoffFactor
          continue
        }
        logger.warn('请求失败（已重试 %d 次）：%s', this.config.retry.maxRetries, String(err))
        return null
      }
    }
    return null
  }

  // ─── 获取订阅了指定类型的去重 UID 列表（从 bili.admin 表读取）─────────────

  private async getSubscribedUids(type: 'live' | 'dynamic' | 'video'): Promise<string[]> {
    const all = await this.ctx.database.get('bili.admin', {})
    const seen = new Set<string>()
    for (const row of all) {
      if (row.types.split(',').includes(type)) seen.add(row.uid)
    }
    return [...seen]
  }

  // ─── 消息分发（读取 bili.admin 表确定推送目标）────────────────────────────

  private async dispatch(uid: string, type: 'live' | 'dynamic' | 'video', elements: h[]) {
    if (!elements.length) return
    await this.api.proxyImages(elements)

    const rows = await this.ctx.database.get('bili.admin', { uid, paused: false })
    for (const row of rows) {
      if (!row.types.split(',').includes(type)) continue

      const [platform, channelId] = splitPlatformId(row.channel)
      const [, guildId] = splitPlatformId(row.guildId)

      const bot = this.ctx.bots.find(b => b.platform === platform)
      if (!bot || bot.status !== BOT_STATUS_ONLINE) {
        logger.debug('未找到可用 bot: platform=%s', platform)
        continue
      }

      try {
        await bot.sendMessage(channelId, elements, guildId || undefined)
      } catch (err) {
        logger.warn('发送消息失败 channel=%s：%s', row.channel, String(err))
      }
    }
  }

  // ─── 直播轮询 ──────────────────────────────────────────────────────────────

  private async pollLive() {
    const uids = await this.getSubscribedUids('live')
    for (const uid of uids) {
      await this.pollLiveForUid(uid)
      await sleep(INTER_UID_DELAY)
    }
  }

  private async pollLiveForUid(uid: string) {
    const userInfo = await this.withRetry(() => this.api.getUserInfo(uid))
    if (!userInfo) return

    const roomId = String(userInfo.live_room?.roomid ?? 0)
    if (roomId === '0') return

    await this.ctx.database.upsert('bili.user', [{
      uid,
      name: userInfo.name,
      faceUrl: userInfo.face,
      liveRoomId: roomId,
      checkedAt: new Date(),
    }])

    const liveInfo = await this.withRetry(() => this.api.getLiveStatus(roomId))
    if (!liveInfo) return

    const isLive = liveInfo.live_status === LiveStatus.LIVE

    const [cached] = await this.ctx.database.get('bili.live_state', { uid })
    const wasLive = cached?.isLive ?? false

    const now = new Date()
    const newState: BiliLiveState = {
      uid,
      isLive,
      title: liveInfo.title,
      coverUrl: liveInfo.keyframe,
      areaName: liveInfo.area_name,
      startedAt: isLive ? new Date(Number(liveInfo.live_time) * 1000) : (cached?.startedAt ?? now),
      updatedAt: now,
    }
    await this.ctx.database.upsert('bili.live_state', [newState])

    if (isLive && !wasLive) {
      const user = { name: userInfo.name, face: userInfo.face, uid }
      const notification = this.livePush.build(liveInfo, user, 'live_start', roomId, newState.startedAt)
      await this.dispatch(uid, 'live', this.livePush.render(notification))
    } else if (!isLive && wasLive) {
      const user = { name: userInfo.name, face: userInfo.face, uid }
      const endInfo = { ...liveInfo, title: cached?.title ?? '', keyframe: cached?.coverUrl ?? '', area_name: cached?.areaName ?? '' }
      const notification = this.livePush.build(endInfo, user, 'live_end', roomId, cached?.startedAt ?? now)
      await this.dispatch(uid, 'live', this.livePush.render(notification))
    }
  }

  // ─── 动态轮询 ──────────────────────────────────────────────────────────────

  private async pollDynamic() {
    const uids = await this.getSubscribedUids('dynamic')
    for (const uid of uids) {
      await this.pollDynamicForUid(uid)
      await sleep(INTER_UID_DELAY)
    }
  }

  private async pollDynamicForUid(uid: string) {
    const [cached] = await this.ctx.database.get('bili.dynamic_state', { uid })
    const lastId = cached?.lastDynamicId ?? '0'

    const result = await this.withRetry(() => this.api.getUserDynamics(uid))
    if (!result || !result.items.length) return

    const latest = result.items[0]
    const latestId = latest.id_str

    if (lastId === '0') {
      await this.ctx.database.upsert('bili.dynamic_state', [{
        uid, lastDynamicId: latestId, checkedAt: new Date(),
      }])
      return
    }

    const newItems: DynamicItem[] = []
    for (const item of result.items) {
      try {
        if (BigInt(item.id_str) > BigInt(lastId)) newItems.push(item)
      } catch {}
    }

    if (!newItems.length) return

    for (const item of newItems.reverse()) {
      const notification = this.dynamicResolver.buildFromItem(item)
      await this.dispatch(uid, 'dynamic', this.dynamicResolver.render(notification))
    }

    await this.ctx.database.upsert('bili.dynamic_state', [{
      uid, lastDynamicId: latestId, checkedAt: new Date(),
    }])
  }

  // ─── 视频轮询 ──────────────────────────────────────────────────────────────

  private async pollVideo() {
    const uids = await this.getSubscribedUids('video')
    for (const uid of uids) {
      await this.pollVideoForUid(uid)
      await sleep(INTER_UID_DELAY)
    }
  }

  private async pollVideoForUid(uid: string) {
    const [cached] = await this.ctx.database.get('bili.video_state', { uid })
    const lastBvid = cached?.lastBvid ?? ''

    const videos = await this.withRetry(() => this.api.getUserVideos(uid))
    if (!videos || !videos.length) return

    const latest = videos[0]

    if (!lastBvid) {
      await this.ctx.database.upsert('bili.video_state', [{
        uid, lastBvid: latest.bvid, checkedAt: new Date(),
      }])
      return
    }

    if (latest.bvid === lastBvid) return

    const lastPubdate = videos.find(v => v.bvid === lastBvid)?.pubdate ?? 0
    const newVideos = videos.filter(v => v.pubdate > lastPubdate)

    for (const video of newVideos.reverse()) {
      const [userCached] = await this.ctx.database.get('bili.user', { uid })
      const notification = this.videoResolver.buildFromItem(video, userCached?.name ?? uid, uid)
      await this.dispatch(uid, 'video', this.videoResolver.render(notification))
    }

    await this.ctx.database.upsert('bili.video_state', [{
      uid, lastBvid: latest.bvid, checkedAt: new Date(),
    }])
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function splitPlatformId(str: string): [string, string] {
  const idx = str.indexOf(':')
  if (idx === -1) return [str, '']
  return [str.slice(0, idx), str.slice(idx + 1)]
}
