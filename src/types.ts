// ─── DB Row Types ────────────────────────────────────────────────────────────

export interface BiliAdmin {
  id: number
  guildId: string   // "platform:guildId"
  channel: string   // "platform:channelId" 推送目标频道
  userId: string    // "platform:userId"
  uid: string       // Bilibili UID
  types: string     // "live,dynamic,video"（逗号分隔）
  paused: boolean   // UP主是否暂停该群推送
}

export interface BiliUser {
  uid: string
  name: string
  faceUrl: string
  liveRoomId: string  // "0" = 无直播间
  checkedAt: Date
}

export interface BiliLiveState {
  uid: string
  isLive: boolean
  title: string
  coverUrl: string
  areaName: string
  startedAt: Date
  updatedAt: Date
}

export interface BiliDynamicState {
  uid: string
  lastDynamicId: string  // "0" = 未初始化
  checkedAt: Date
}

export interface BiliVideoState {
  uid: string
  lastBvid: string  // "" = 未初始化
  checkedAt: Date
}

export interface BiliAuthData {
  key: string
  value: string
  updatedAt: Date
}

export interface BiliBinding {
  id: number         // Koishi 内部 user.id（主键）
  uid: string        // B 站 UID
  verified: boolean  // 是否已通过签名验证
  verifyCode: string // 验证码
  boundAt: Date      // 绑定完成时间
}

declare module 'koishi' {
  interface Tables {
    'bili.admin': BiliAdmin
    'bili.user': BiliUser
    'bili.live_state': BiliLiveState
    'bili.dynamic_state': BiliDynamicState
    'bili.video_state': BiliVideoState
    'bili.auth_data': BiliAuthData
    'bili.binding': BiliBinding
  }
}

// ─── Config Types ─────────────────────────────────────────────────────────────

/** 静态预设的绑定/订阅记录（控制台配置，启动时 upsert 到 bili.admin 表） */
export interface AdminEntry {
  guildId: string                               // "platform:guildId"
  channel: string                               // "platform:channelId" 推送目标频道
  userId: string                                // "platform:userId" UP主的平台账号
  uid: string                                   // Bilibili UID
  types?: Array<'live' | 'dynamic' | 'video'>  // 缺省 = 全部
}

// ─── Bilibili API Response Types ──────────────────────────────────────────────

export interface BiliApiResponse<T> {
  code: number
  message: string
  data: T
}

export interface UserInfo {
  mid: number
  name: string
  face: string
  sign: string
  live_room: {
    roomid: number
    liveStatus: number
    url: string
  } | null
}

export interface LiveRoomInfo {
  room_id: number
  uid: number
  title: string
  live_status: 0 | 1 | 2  // 0=未播, 1=直播中, 2=轮播
  keyframe: string          // 封面图
  area_name: string
  live_time: string         // 开播时间 unix 秒
}

export interface DynamicItem {
  id_str: string
  type: string
  modules: {
    module_dynamic?: {
      desc?: { text: string }
      major?: {
        type: string
        archive?: {
          cover: string
          title: string
          desc: string
          jump_url: string
        }
        draw?: { items: Array<{ src: string }> }
        opus?: {
          summary?: { text: string }
          pics?: Array<{ url: string }>
          jump_url: string
        }
      }
    }
    module_author?: { name: string; face: string; pub_ts: number; mid?: number }
  }
}

export interface DynamicFeedData {
  items: DynamicItem[]
  offset: string
  has_more: boolean
}

export interface VideoItem {
  bvid: string
  title: string
  pic: string
  desc: string
  pubdate: number
}

/** /x/web-interface/view 返回的完整视频信息 */
export interface VideoDetail {
  bvid: string
  aid: number
  title: string
  pic: string
  desc: string
  owner: { mid: number; name: string; face: string }
  pubdate: number
}

export interface WbiKeys {
  imgKey: string
  subKey: string
  fetchedAt: number
}

// ─── Notification Payloads ────────────────────────────────────────────────────

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

export interface UserNotification {
  type: 'user'
  uid: string
  userName: string
  faceUrl: string
  sign: string
  liveRoomUrl?: string
  liveStatus?: string
}

export interface LiveInfoNotification {
  type: 'live_info'
  roomId: string
  title: string
  coverUrl: string
  areaName: string
  status: '直播中' | '轮播中' | '未开播'
}

export type AnyNotification =
  | LiveNotification | DynamicNotification | VideoNotification
  | UserNotification | LiveInfoNotification
