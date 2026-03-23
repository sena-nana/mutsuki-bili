import type {
  DynamicItem,
  DynamicNotification,
  LiveInfoNotification,
  LiveNotification,
  LiveRoomInfo,
  UserInfo,
  UserNotification,
  VideoDetail,
  VideoItem,
  VideoNotification,
} from './types'

// ─── 动态转换 ─────────────────────────────────────────────────────────────────

/** DynamicItem → DynamicNotification */
export function dynamicItemToNotification(item: DynamicItem): DynamicNotification {
  const author = item.modules?.module_author
  const dynamic = item.modules?.module_dynamic
  const text = dynamic?.desc?.text ?? ''
  const images: string[] = dynamic?.major?.draw?.items?.map(i => i.src) ?? []
  const archive = dynamic?.major?.archive
  const opus = dynamic?.major?.opus

  return {
    type: 'dynamic',
    uid: String(author?.mid ?? ''),
    userName: author?.name ?? '',
    faceUrl: author?.face ?? '',
    dynamicId: item.id_str,
    text: opus?.summary?.text ?? text,
    images: opus?.pics?.map(p => p.url) ?? images,
    videoLink: archive ? `https:${archive.jump_url}` : undefined,
    videoThumb: archive?.cover,
    videoTitle: archive?.title,
  }
}

// ─── 视频转换 ─────────────────────────────────────────────────────────────────

/** VideoDetail（/x/web-interface/view）→ VideoNotification */
export function videoDetailToNotification(detail: VideoDetail): VideoNotification {
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

/** VideoItem（列表接口）+ 外部提供的 userName → VideoNotification */
export function videoItemToNotification(item: VideoItem, userName: string, uid: string): VideoNotification {
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

// ─── 直播转换 ─────────────────────────────────────────────────────────────────

/** LiveRoomInfo + 用户信息 → LiveNotification（用于推送开播/下播） */
export function liveToNotification(
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

/** LiveRoomInfo → LiveInfoNotification（用于链接解析展示当前状态） */
export function liveRoomToInfoNotification(info: LiveRoomInfo): LiveInfoNotification {
  const status = info.live_status === 1 ? '直播中' : info.live_status === 2 ? '轮播中' : '未开播'
  return {
    type: 'live_info',
    roomId: String(info.room_id),
    title: info.title,
    coverUrl: info.keyframe,
    areaName: info.area_name,
    status,
  }
}

// ─── 用户转换 ─────────────────────────────────────────────────────────────────

/** UserInfo → UserNotification */
export function userInfoToNotification(info: UserInfo): UserNotification {
  return {
    type: 'user',
    uid: String(info.mid),
    userName: info.name,
    faceUrl: info.face,
    sign: info.sign ?? '',
    liveRoomUrl: info.live_room?.url,
    liveStatus: info.live_room ? (info.live_room.liveStatus === 1 ? '直播中' : '未开播') : undefined,
  }
}
