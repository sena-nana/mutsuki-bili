import { Context, HTTP, Logger } from 'koishi'
import type { AuthManager } from './auth'
import { COMMON_HEADERS } from './auth'
import type { DynamicScraper } from './dynamic-scraper'
import type { Config } from './index'
import type {
  BiliApiResponse,
  DynamicFeedData,
  DynamicItem,
  GfItemNotification,
  LiveRoomInfo,
  UserInfo,
  VideoDetail,
  VideoItem,
} from './types'

const logger = new Logger('mutsuki-bili/api')

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

export class RiskControlError extends BiliApiError {
  constructor(message: string) {
    super(352, message)
    this.name = 'RiskControlError'
  }
}

// ─── API 客户端 ───────────────────────────────────────────────────────────────

export class BiliApiClient {
  private http: HTTP

  constructor(
    private ctx: Context,
    private auth: AuthManager,
    private config: Config,
    private scraper?: DynamicScraper,
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
    if (resp.code === 352) {
      throw new RiskControlError(resp.message)
    }
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
   * 当 API 触发风控(352) 且 puppeteer 可用时，自动回退到浏览器获取。
   */
  async getUserDynamics(uid: string, offset = ''): Promise<{ items: DynamicItem[]; offset: string; hasMore: boolean }> {
    try {
      return await this.fetchDynamicsViaApi(uid, offset)
    } catch (err) {
      if (err instanceof RiskControlError && this.scraper?.available) {
        logger.warn('动态 API 触发风控(352)，尝试浏览器回退 uid=%s', uid)
        const result = await this.scraper.scrapeUserDynamics(uid)
        if (result) return result
      }
      throw err
    }
  }

  private async fetchDynamicsViaApi(uid: string, offset: string) {
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

  /** 通过 BV 号获取视频详情 */
  async getVideoByBvid(bvid: string): Promise<VideoDetail> {
    return this.request<VideoDetail>(
      'https://api.bilibili.com/x/web-interface/view',
      { bvid },
    )
  }

  /** 通过 av 号获取视频详情 */
  async getVideoByAvid(aid: string): Promise<VideoDetail> {
    return this.request<VideoDetail>(
      'https://api.bilibili.com/x/web-interface/view',
      { aid },
    )
  }

  /** 获取单条动态详情 */
  async getDynamicDetail(dynamicId: string): Promise<DynamicItem> {
    const data = await this.request<{ item: DynamicItem }>(
      'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail',
      { id: dynamicId },
    )
    return data.item
  }

  /** 获取 B 站工坊商品信息（无需鉴权） */
  async getGfItemInfo(itemsId: string): Promise<GfItemNotification> {
    const resp = await this.ctx.http.get<{
      success: boolean
      data: {
        name: string
        price: number
        mainImgList: string[]
        saleNum: string
        shopInfo: { shopUserNickName: string }
        itemsDiscountPriceVO?: { discountPrice: number }
      }
    }>('https://mall.bilibili.com/mall-up-search/items/info', {
      params: { itemsId },
      headers: { ...COMMON_HEADERS, Referer: 'https://gf.bilibili.com/' },
    })
    if (!resp?.success || !resp.data) throw new BiliApiError(-1, '工坊商品不存在')
    const d = resp.data
    const actualPrice = d.itemsDiscountPriceVO?.discountPrice ?? d.price
    const cover = d.mainImgList?.[0] ?? ''
    return {
      type: 'gf_item',
      id: itemsId,
      name: d.name,
      coverUrl: cover.startsWith('//') ? `https:${cover}` : cover,
      price: `¥${(actualPrice / 100).toFixed(2)}`,
      shopName: d.shopInfo?.shopUserNickName ?? '',
      sales: d.saleNum ?? '',
    }
  }

  /** 解析 b23.tv 短链接，返回重定向后的实际 URL */
  async resolveShortLink(code: string): Promise<string> {
    try {
      // 尝试 HEAD 请求获取重定向 Location
      await this.ctx.http.head('https://b23.tv/' + code, {
        redirect: 'manual',
        headers: COMMON_HEADERS,
      } as HTTP.Config)
    } catch (err: any) {
      // redirect:manual 下 3xx 会抛出错误，从中提取 Location
      const location = err?.response?.headers?.location
        ?? err?.response?.headers?.get?.('location')
      if (location) return location
    }
    // 回退：GET 请求，解析响应体中的跳转 URL
    try {
      const html = await this.ctx.http.get<string>('https://b23.tv/' + code, {
        headers: COMMON_HEADERS,
        responseType: 'text',
      })
      const match = html.match(/content="0;url=(https?:\/\/[^"]+)"/)
        ?? html.match(/window\.location\.href\s*=\s*"(https?:\/\/[^"]+)"/)
      if (match?.[1]) return match[1]
    } catch {}
    return ''
  }
}
