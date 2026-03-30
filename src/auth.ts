import { type Context, Logger } from 'koishi'
import { createHash } from 'node:crypto'
import { toDataURL } from 'qrcode'
import type { Config } from './index'
import type { WbiKeys } from './types'

const logger = new Logger('mutsuki-bili/auth')

// WBI 混合密钥索引表（反向工程自 Bilibili，版本敏感，变动时参考 koishi-plugin-bilibili-notify）
const WBI_INDEX_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
]

const WBI_CACHE_TTL = 6 * 60 * 60 * 1000  // 6 小时

export class AuthManager {
  private wbiCache: WbiKeys | null = null

  constructor(
    private ctx: Context,
    private config: Config,
  ) { }

  /** 组装 Cookie 请求头字符串，config 优先，其次读取 DB */
  async buildCookieHeader(): Promise<string> {
    const parts: string[] = []

    if (this.config.auth.sessdata) {
      parts.push(`SESSDATA=${this.config.auth.sessdata}`)
      parts.push(`bili_jct=${this.config.auth.biliJct}`)
      parts.push(`DedeUserID=${this.config.auth.dedeUserId}`)
      parts.push(`buvid3=${this.config.auth.buvid3}`)
    } else {
      // 读取 QR 登录存储的 cookie
      const rows = await this.ctx.database.get('bili.auth_data', { key: 'cookie' })
      if (rows.length > 0) {
        try {
          const cookies: Record<string, string> = JSON.parse(rows[0].value)
          for (const [k, v] of Object.entries(cookies)) {
            parts.push(`${k}=${v}`)
          }
        } catch (e) { logger.debug('Cookie JSON 解析失败: %s', String(e)) }
      }
    }

    return parts.join('; ')
  }

  /** 获取 WBI 签名密钥（带 6h 缓存） */
  async fetchWbiKeys(): Promise<WbiKeys> {
    if (this.wbiCache && Date.now() - this.wbiCache.fetchedAt < WBI_CACHE_TTL) {
      return this.wbiCache
    }
    const resp = await this.ctx.http.get<any>('https://api.bilibili.com/x/web-interface/nav', {
      headers: { Cookie: await this.buildCookieHeader(), ...COMMON_HEADERS },
    })
    const imgUrl: string = resp?.data?.wbi_img?.img_url ?? ''
    const subUrl: string = resp?.data?.wbi_img?.sub_url ?? ''
    // 取文件名去扩展名作为 key
    const imgKey = imgUrl.split('/').pop()?.replace(/\.\w+$/, '') ?? ''
    const subKey = subUrl.split('/').pop()?.replace(/\.\w+$/, '') ?? ''
    this.wbiCache = { imgKey, subKey, fetchedAt: Date.now() }
    return this.wbiCache
  }

  /** 生成 WBI 签名，返回追加了 w_rid 和 wts 的参数对象 */
  async wbiSign(params: Record<string, string | number>): Promise<Record<string, string | number>> {
    const keys = await this.fetchWbiKeys()
    const raw = keys.imgKey + keys.subKey
    const mixinKey = WBI_INDEX_TABLE.slice(0, 32).map(i => raw[i]).join('')

    const wts = Math.floor(Date.now() / 1000)
    const signed = { ...params, wts }

    // 按 key 排序，过滤特殊字符，拼接查询串
    const query = Object.keys(signed)
      .sort()
      .map(k => {
        const v = String((signed as Record<string, string | number>)[k]).replace(/[!'()*]/g, '')
        return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      })
      .join('&')

    const wRid = createHash('md5').update(query + mixinKey).digest('hex')
    return { ...signed, w_rid: wRid }
  }

  // ─── QR 登录流程 ──────────────────────────────────────────────────────────

  /** 生成扫码登录二维码，返回 { url, qrcodeKey } */
  async generateQrCode(): Promise<{ url: string; qrcodeKey: string }> {
    const resp = await this.ctx.http.get<any>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
      { headers: COMMON_HEADERS },
    )
    return {
      url: resp?.data?.url ?? '',
      qrcodeKey: resp?.data?.qrcode_key ?? '',
    }
  }

  /** 生成二维码并返回 data URI（base64 PNG），避免依赖外部渲染服务 */
  async generateQrDataUrl(): Promise<{ dataUrl: string; qrcodeKey: string }> {
    const { url, qrcodeKey } = await this.generateQrCode()
    if (!url) return { dataUrl: '', qrcodeKey: '' }
    const dataUrl = await toDataURL(url, { width: 200, margin: 2 })
    return { dataUrl, qrcodeKey }
  }

  /**
   * 轮询二维码扫描状态。
   * 返回 status:
   *   0       = 成功（cookies 已存库）
   *   86101   = 未扫码
   *   86090   = 已扫码未确认
   *   86038   = 二维码过期
   */
  async pollQrCode(qrcodeKey: string): Promise<{ status: number; message: string }> {
    const resp = await this.ctx.http.get<any>(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
      {
        params: { qrcode_key: qrcodeKey, source: 'main-fe-header' },
        headers: COMMON_HEADERS,
      },
    )
    const code: number = resp?.data?.code ?? -1

    if (code === 0) {
      // 从响应 URL params 解析 cookie（bili 将 cookie 放在 url 中）
      const url: string = resp?.data?.url ?? ''
      await this.saveCookiesFromRedirectUrl(url)
    }

    return { status: code, message: resp?.data?.message ?? '' }
  }

  private async saveCookiesFromRedirectUrl(redirectUrl: string) {
    try {
      const u = new URL(redirectUrl)
      const cookies: Record<string, string> = {}
      for (const [k, v] of u.searchParams.entries()) {
        if (['SESSDATA', 'bili_jct', 'DedeUserID', 'DedeUserID__ckMd5', 'buvid3'].includes(k)) {
          cookies[k] = v
        }
      }
      await this.ctx.database.upsert('bili.auth_data', [{
        key: 'cookie',
        value: JSON.stringify(cookies),
        updatedAt: new Date(),
      }])
    } catch (e) { logger.debug('QR 登录 Cookie 保存失败: %s', String(e)) }
  }

  /** 清除 WBI 缓存，强制下次请求时重新获取 */
  invalidateWbiCache() {
    this.wbiCache = null
  }
}

export const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
  'Origin': 'https://www.bilibili.com',
}
