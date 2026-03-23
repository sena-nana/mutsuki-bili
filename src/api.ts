import { Context, HTTP } from 'koishi'
import type { AuthManager } from './auth'
import { COMMON_HEADERS } from './auth'
import type { Config } from './index'
import type {
  BiliApiResponse,
  DynamicFeedData,
  DynamicItem,
  LiveRoomInfo,
  UserInfo,
  VideoItem,
} from './types'

// ─── 错误类型 ─────────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor() {
    super('Bilibili API rate limit (429)')
    this.name = 'RateLimitError'
  }
}

export class BiliApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(`Bilibili API error ${code}: ${message}`)
    this.name = 'BiliApiError'
  }
}

// ─── API 客户端 ───────────────────────────────────────────────────────────────

export class BiliApiClient {
  private http: HTTP

  constructor(
    private ctx: Context,
    private auth: AuthManager,
    private config: Config,
  ) {
    this.http = ctx.http.extend({ headers: COMMON_HEADERS })
  }

  /** 通用请求方法，自动附加 Cookie，可选 WBI 签名 */
  private async request<T>(
    url: string,
    params: Record<string, string | number> = {},
    signed = false,
  ): Promise<T> {
    const cookie = await this.auth.buildCookieHeader()
    const finalParams = signed ? await this.auth.wbiSign(params) : params

    let resp: BiliApiResponse<T>
    try {
      resp = await this.http.get<BiliApiResponse<T>>(url, {
        params: finalParams,
        headers: { Cookie: cookie },
      })
    } catch (err) {
      if (err instanceof HTTP.Error && err.response?.status === 429) {
        throw new RateLimitError()
      }
      throw err
    }

    // Bilibili 业务错误码
    if (resp.code !== 0) {
      // -101: 未登录, -111: csrf校验失败 → 可能 cookie 过期
      throw new BiliApiError(resp.code, resp.message)
    }

    return resp.data
  }

  /** 获取 UP主 基本信息（含直播间 ID） */
  async getUserInfo(uid: string): Promise<UserInfo> {
    return this.request<UserInfo>(
      'https://api.bilibili.com/x/space/acc/info',
      { mid: uid },
    )
  }

  /** 获取直播间状态 */
  async getLiveStatus(roomId: string): Promise<LiveRoomInfo> {
    return this.request<LiveRoomInfo>(
      'https://api.live.bilibili.com/room/v1/Room/get_info',
      { room_id: roomId, from: 'room' },
    )
  }

  /**
   * 获取 UP主 动态列表。
   * offset 为空时获取最新一页；有 offset 时获取该 offset 之后的内容。
   */
  async getUserDynamics(uid: string, offset = ''): Promise<{ items: DynamicItem[]; offset: string; hasMore: boolean }> {
    const params: Record<string, string | number> = {
      host_mid: uid,
      platform: 'web',
      features: 'itemOpusStyle,listOnlyfans,opusBigCover,onlyfansVote,endFooterHidden,decorationCard',
    }
    if (offset) params.offset = offset

    const data = await this.request<DynamicFeedData>(
      'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space',
      params,
    )
    return {
      items: data.items ?? [],
      offset: data.offset ?? '',
      hasMore: data.has_more ?? false,
    }
  }

  /** 获取 UP主 最新视频列表（WBI 签名，取第一页前5条） */
  async getUserVideos(uid: string): Promise<VideoItem[]> {
    const data = await this.request<{ list: { vlist: VideoItem[] } }>(
      'https://api.bilibili.com/x/space/wbi/arc/search',
      { mid: uid, pn: 1, ps: 5, order: 'pubdate' },
      true,  // WBI signed
    )
    return data?.list?.vlist ?? []
  }
}
