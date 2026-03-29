import { h, Logger } from 'koishi'
import { ContentResolver, type ResolverContext } from './base'

const logger = new Logger('mutsuki-bili/gf-item')

export interface GfItemData {
  id: string
  name: string
  coverUrl: string
  price: string
  shopName: string
  sales: string
}

export class GfItemResolver extends ContentResolver<GfItemData> {
  readonly name = 'gf_item'

  readonly patterns = [
    /(?:https?:\/\/)?gf\.bilibili\.com\/item\/detail\/(\d+)/g,
  ]

  async fetch(id: string, ctx: ResolverContext): Promise<GfItemData | null> {
    try {
      const resp = await ctx.http.get<{
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
        params: { itemsId: id },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://gf.bilibili.com/',
        },
      })
      if (!resp?.success || !resp.data) return null
      const d = resp.data
      const actualPrice = d.itemsDiscountPriceVO?.discountPrice ?? d.price
      const cover = d.mainImgList?.[0] ?? ''
      return {
        id,
        name: d.name,
        coverUrl: cover.startsWith('//') ? `https:${cover}` : cover,
        price: `¥${(actualPrice / 100).toFixed(2)}`,
        shopName: d.shopInfo?.shopUserNickName ?? '',
        sales: d.saleNum ?? '',
      }
    } catch (err) {
      logger.debug('工坊商品获取失败 (id=%s): %s', id, String(err))
      return null
    }
  }

  render(data: GfItemData): h[] {
    const elements: h[] = []
    if (data.coverUrl) elements.push(h.image(data.coverUrl))
    let text = `\n【工坊】${data.name}\n`
    if (data.price) text += `价格：${data.price}\n`
    if (data.shopName) text += `店铺：${data.shopName}\n`
    if (data.sales) text += `${data.sales}\n`
    text += `https://gf.bilibili.com/item/detail/${data.id}`
    elements.push(h.text(text))
    return elements
  }
}
