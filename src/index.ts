import { type Context, Logger, Schema, Time } from 'koishi'
import { BiliApiClient } from './api'
import { AuthManager } from './auth'
import { registerCommands } from './commands'
import { registerConsole } from './console'
import { registerModels } from './db'
import { DynamicScraper } from './dynamic-scraper'
import { MessageFormatter } from './formatter'
import { registerLinkParser } from './link-parser'
import { PollerManager } from './poller'
import type { AdminEntry } from './types'

export const name = 'mutsuki-bili'

export const inject = {
  required: ['database', 'http'],
  optional: ['console', 'puppeteer'],
}

const logger = new Logger('mutsuki-bili')

// ─── Config Schema ────────────────────────────────────────────────────────────

export interface Config {
  admins: AdminEntry[]
  sessdata: string
  biliJct: string
  dedeUserId: string
  buvid3: string
  liveInterval: number
  dynamicInterval: number
  videoInterval: number
  maxRetries: number
  backoffFactor: number
  rateLimitBackoff: number
  puppeteerFallback: boolean
  puppeteerTimeout: number
  linkParsing: boolean
  linkCooldown: number
}

export const Config: Schema<Config> = Schema.object({
  admins: Schema.array(Schema.object({
    guildId: Schema.string().required().description('群组标识，格式：platform:guildId'),
    channel: Schema.string().required().description('推送频道，格式：platform:channelId'),
    userId: Schema.string().required().description('UP主 平台账号，格式：platform:userId'),
    uid: Schema.string().required().description('B站 UID'),
    types: Schema.array(Schema.union(['live', 'dynamic', 'video'] as const))
      .default(['live', 'dynamic', 'video'])
      .description('推送类型'),
  })).default([]).description('UP主 绑定/订阅预设（启动时同步到数据库）'),

  sessdata: Schema.string().default('').description('SESSDATA cookie（优先于 QR 登录；高级用法，建议通过控制台扫码登录）').role('secret').hidden(),
  biliJct: Schema.string().default('').description('bili_jct cookie').role('secret').hidden(),
  dedeUserId: Schema.string().default('').description('DedeUserID cookie').hidden(),
  buvid3: Schema.string().default('').description('buvid3 cookie').hidden(),

  liveInterval: Schema.natural().role('ms').default(Time.minute).description('直播检测间隔'),
  dynamicInterval: Schema.natural().role('ms').default(2 * Time.minute).description('动态检测间隔'),
  videoInterval: Schema.natural().role('ms').default(5 * Time.minute).description('视频检测间隔'),

  maxRetries: Schema.natural().default(3).description('单次请求最大重试次数'),
  backoffFactor: Schema.number().default(2).description('退避系数'),
  rateLimitBackoff: Schema.natural().role('ms').default(5 * Time.minute).description('触发限速后的等待时间'),

  puppeteerFallback: Schema.boolean().default(true).description('API 触发风控(352)时是否使用浏览器回退获取动态'),
  puppeteerTimeout: Schema.natural().role('ms').default(30 * Time.second).description('浏览器回退的页面加载超时时间'),

  linkParsing: Schema.boolean().default(true).description('是否开启聊天消息中的 B 站链接自动解析'),
  linkCooldown: Schema.natural().role('ms').default(Time.minute).description('同一链接在同一频道的解析冷却时间'),
})

// ─── Plugin Entry ─────────────────────────────────────────────────────────────

export function apply(ctx: Context, config: Config) {
  registerModels(ctx)

  const auth      = new AuthManager(ctx, config)
  const scraper   = new DynamicScraper(ctx, auth, config)
  const api       = new BiliApiClient(ctx, auth, config, scraper)
  const formatter = new MessageFormatter()
  const poller    = new PollerManager(ctx, config, api, formatter)

  // 将 config.admins 静态预设同步到 bili.admin 表
  ctx.on('ready', async () => {
    await syncAdminsFromConfig(ctx, config)
    poller.start()
    logger.info('mutsuki-bili 已启动')
  })

  registerCommands(ctx, config, api, auth, formatter)
  registerConsole(ctx, config, auth)
  registerLinkParser(ctx, config, api, formatter)
}

async function syncAdminsFromConfig(ctx: Context, config: Config) {
  if (!config.admins.length) return
  await ctx.database.upsert(
    'bili.admin',
    config.admins.map(a => ({
      guildId: a.guildId,
      channel: a.channel,
      userId: a.userId,
      uid: a.uid,
      types: (a.types ?? ['live', 'dynamic', 'video']).join(','),
      paused: false,
    })),
    ['guildId', 'userId'],
  )
  logger.debug('已同步 %d 条 admin 预设', config.admins.length)
}
