import { type Context, Logger, Schema, Time } from 'koishi'
import { BiliApiClient } from './api'
import { AuthManager } from './auth'
import { registerCommands } from './commands'
import { registerConsole } from './console'
import { registerModels } from './db'
import { DynamicScraper } from './dynamic-scraper'
import { registerLinkParser } from './link-parser'
import { PollerManager } from './poller'
import { RenderHelper } from './renderer/render-helper'
import type { ResolverContext } from './resolvers/base'
import { DynamicResolver } from './resolvers/dynamic'
import { GfItemResolver } from './resolvers/gf-item'
import { LiveInfoResolver } from './resolvers/live-info'
import { MhsProfileResolver } from './resolvers/mhs-profile'
import { MhsStallResolver } from './resolvers/mhs-stall'
import { ResolverRegistry } from './resolvers/registry'
import { ShortLinkResolver } from './resolvers/short-link'
import { UserResolver } from './resolvers/user'
import { VideoResolver } from './resolvers/video'
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
  auth: {
    sessdata: string
    biliJct: string
    dedeUserId: string
    buvid3: string
  }
  polling: {
    liveInterval: number
    dynamicInterval: number
    videoInterval: number
  }
  retry: {
    maxRetries: number
    backoffFactor: number
    rateLimitBackoff: number
  }
  puppeteer: {
    fallback: boolean
    timeout: number
  }
  linkParser: {
    enabled: boolean
    cooldown: number
  }
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

  auth: Schema.object({
    sessdata: Schema.string().default('').description('SESSDATA cookie').role('secret'),
    biliJct: Schema.string().default('').description('bili_jct cookie').role('secret'),
    dedeUserId: Schema.string().default('').description('DedeUserID cookie'),
    buvid3: Schema.string().default('').description('buvid3 cookie'),
  }).description('B 站认证（高级用法，建议通过控制台扫码登录）').hidden(),

  polling: Schema.object({
    liveInterval: Schema.natural().role('ms').default(Time.minute).description('直播检测间隔'),
    dynamicInterval: Schema.natural().role('ms').default(2 * Time.minute).description('动态检测间隔'),
    videoInterval: Schema.natural().role('ms').default(5 * Time.minute).description('视频检测间隔'),
  }).description('轮询间隔'),

  retry: Schema.object({
    maxRetries: Schema.natural().default(3).description('单次请求最大重试次数'),
    backoffFactor: Schema.number().default(2).description('退避系数'),
    rateLimitBackoff: Schema.natural().role('ms').default(5 * Time.minute).description('触发限速后的等待时间'),
  }).description('重试策略'),

  puppeteer: Schema.object({
    fallback: Schema.boolean().default(true).description('API 触发风控(352)时是否使用浏览器回退获取动态'),
    timeout: Schema.natural().role('ms').default(30 * Time.second).description('浏览器回退的页面加载超时时间'),
  }).description('Puppeteer 浏览器回退'),

  linkParser: Schema.object({
    enabled: Schema.boolean().default(true).description('是否开启聊天消息中的 B 站链接自动解析'),
    cooldown: Schema.natural().role('ms').default(Time.minute).description('同一链接在同一频道的解析冷却时间'),
  }).description('链接解析'),
})

// ─── Plugin Entry ─────────────────────────────────────────────────────────────

export function apply(ctx: Context, config: Config) {
  registerModels(ctx)

  const auth    = new AuthManager(ctx, config)
  const scraper = new DynamicScraper(ctx, auth, config)
  const api     = new BiliApiClient(ctx, auth, config, scraper)

  // 构建 resolver 注册表
  const registry = new ResolverRegistry()
  registry.register(new VideoResolver())
  registry.register(new DynamicResolver())
  registry.register(new LiveInfoResolver())
  registry.register(new UserResolver())
  registry.register(new ShortLinkResolver())
  registry.register(new MhsProfileResolver())
  registry.register(new MhsStallResolver())
  registry.register(new GfItemResolver())

  const renderHelper = new RenderHelper(ctx, ctx.http)

  const resolverCtx: ResolverContext = {
    api,
    http: ctx.http,
    puppeteer: (ctx as Context & { puppeteer?: ResolverContext['puppeteer'] }).puppeteer,
    renderHelper,
  }

  const poller = new PollerManager(ctx, config, api, resolverCtx)

  // 将 config.admins 静态预设同步到 bili.admin 表
  ctx.on('ready', async () => {
    await syncAdminsFromConfig(ctx, config)
    poller.start()
    logger.info('mutsuki-bili 已启动')
  })

  registerCommands(ctx, config, api, auth)
  registerConsole(ctx, config, auth)
  registerLinkParser(ctx, config, registry, resolverCtx)
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
