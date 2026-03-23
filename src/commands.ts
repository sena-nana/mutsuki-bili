import { randomBytes } from 'node:crypto'
import { type Context, h, type Session } from 'koishi'
import type { BiliApiClient } from './api'
import type { AuthManager } from './auth'
import type { Config } from './index'

// ─── 鉴权辅助 ─────────────────────────────────────────────────────────────────

/**
 * 检查调用者权限：
 *   1. authority >= 4（主人级）
 *   2. 当前群中绑定了指定 uid 的 admin 记录
 *   3. 用户自助绑定了该 uid（跨群回退）
 */
async function checkAuthority(session: Session, ctx: Context, uid?: string): Promise<boolean> {
  if (((session.user as any)?.authority ?? 0) >= 4) return true
  if (!uid || !session.guildId) return false

  const guildId = `${session.platform}:${session.guildId}`
  const userId = `${session.platform}:${session.userId}`

  // 优先：admin 表群级匹配
  const adminRows = await ctx.database.get('bili.admin', { guildId, userId, uid })
  if (adminRows.length > 0) return true

  // 回退：用户自助绑定匹配（跨群）
  const koishiUserId = (session.user as any)?.id as number | undefined
  if (koishiUserId) {
    const bindRows = await ctx.database.get('bili.binding', { id: koishiUserId, uid, verified: true })
    if (bindRows.length > 0) return true
  }

  return false
}

function generateVerifyCode(): string {
  return `mutsuki-${randomBytes(3).toString('hex')}`
}

const ALL_TYPES = 'live,dynamic,video'

// ─── 指令注册 ─────────────────────────────────────────────────────────────────

export function registerCommands(ctx: Context, _config: Config, api: BiliApiClient, auth: AuthManager) {
  const bili = ctx.command('bili', 'B站 UP主 推送插件')

  // ── bili admin（主人专属） ────────────────────────────────────────────────

  const admin = bili.subcommand('bili.admin', '管理 UP主 绑定（主人专属）')

  /**
   * bili admin bind <userId> <uid> [--types live,dynamic,video]
   * 绑定 = 同时注册管理员 + 创建订阅
   * channel 默认为当前频道
   */
  admin.subcommand('bili.admin.bind <userId:string> <uid:string>', '绑定 UP主 账号（同时订阅推送）')
    .option('types', '-t <types:string> 推送类型，逗号分隔（live/dynamic/video），默认全部', { fallback: ALL_TYPES })
    .action(async ({ session, options }, userId, uid) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const platform = session.platform
      const guildId = `${platform}:${session.guildId}`
      const channel = `${platform}:${session.channelId}`
      const normalizedUserId = userId.includes(':') ? userId : `${platform}:${userId}`

      // 校验 types
      const rawTypes = (options.types ?? ALL_TYPES).split(',').map(s => s.trim()).filter(Boolean)
      const validTypes = rawTypes.filter(t => ['live', 'dynamic', 'video'].includes(t))
      if (!validTypes.length) return '推送类型无效，可选：live, dynamic, video'
      const typesStr = validTypes.join(',')

      await ctx.database.upsert('bili.admin', [{
        guildId,
        channel,
        userId: normalizedUserId,
        uid,
        types: typesStr,
        paused: false,
      }], ['guildId', 'userId'])

      let name = uid
      try {
        const info = await api.getUserInfo(uid)
        name = info.name
      } catch {}

      return `已绑定 UP主「${name}」(${uid}) → ${normalizedUserId}，推送类型：${typesStr}`
    })

  /**
   * bili admin unbind <userId>
   * 解绑 = 同时移除管理员绑定 + 取消订阅
   */
  admin.subcommand('bili.admin.unbind <userId:string>', '解绑 UP主 账号（同时取消订阅）')
    .action(async ({ session }, userId) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const normalizedUserId = userId.includes(':') ? userId : `${session.platform}:${userId}`

      const rows = await ctx.database.get('bili.admin', { guildId, userId: normalizedUserId })
      if (!rows.length) return `${normalizedUserId} 在本群没有绑定记录`

      await ctx.database.remove('bili.admin', { guildId, userId: normalizedUserId })
      return `已解绑 ${normalizedUserId}（UID ${rows[0].uid}），推送订阅已同步取消`
    })

  admin.subcommand('bili.admin.list', '查看本群所有绑定/订阅')
    .action(async ({ session }) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const rows = await ctx.database.get('bili.admin', { guildId })
      if (!rows.length) return '本群暂无绑定记录'

      const lines = rows.map(r =>
        `${r.userId} → UID ${r.uid}  [${r.types}]${r.paused ? '  ⏸暂停' : ''}`,
      )
      return `本群 UP主 绑定/订阅列表：\n${lines.join('\n')}`
    })

  // ── UP主 自助指令 ─────────────────────────────────────────────────────────

  bili.subcommand('bili.pause [uid:string]', '暂停当前群的推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const koishiUserId = (session.user as any)?.id as number | undefined
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'

      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: true })
      return `已暂停 UID ${targetUid} 在本群的推送`
    })

  bili.subcommand('bili.resume [uid:string]', '恢复当前群的推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const koishiUserId = (session.user as any)?.id as number | undefined
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'

      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: false })
      return `已恢复 UID ${targetUid} 在本群的推送`
    })

  bili.subcommand('bili.preview [uid:string]', '发送该 UP主 最新动态的测试推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const koishiUserId = (session.user as any)?.id as number | undefined
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'

      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      try {
        const { items } = await api.getUserDynamics(targetUid)
        if (!items.length) return '该 UP主 暂无动态'
        const item = items[0]
        const author = item.modules?.module_author
        const dynamic = item.modules?.module_dynamic
        const text = dynamic?.desc?.text ?? ''
        return h.text(
          `[预览] ${author?.name ?? targetUid} 的最新动态：\n${text}\n` +
          `https://t.bilibili.com/${item.id_str}`,
        ).toString()
      } catch (err) {
        return `获取动态失败：${String(err)}`
      }
    })

  // ── 用户自助绑定 B 站 UID ─────────────────────────────────────────────────

  bili.subcommand('bili.binduid <uid:string>', '绑定你的 B 站账号')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      const koishiUserId = (session.user as any)?.id as number | undefined
      if (!koishiUserId) return '无法获取用户信息，请确认数据库服务正常'

      // 验证 UID 是否存在
      let userName: string
      try {
        const info = await api.getUserInfo(uid)
        userName = info.name
      } catch {
        return `无法查找 UID ${uid}，请确认 B 站 UID 正确`
      }

      const verifyCode = generateVerifyCode()
      await ctx.database.upsert('bili.binding', [{
        id: koishiUserId,
        uid,
        verified: false,
        verifyCode,
        boundAt: new Date(),
      }])

      return (
        `B 站账号「${userName}」(UID ${uid}) 验证流程已发起。\n` +
        `请将以下验证码添加到你的 B 站个性签名中（请注意备份原签名）：\n${verifyCode}\n` +
        `完成后发送 bili.verify 验证`
      )
    })

  bili.subcommand('bili.verify', '验证 B 站账号绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = (session.user as any)?.id as number | undefined
      if (!koishiUserId) return '无法获取用户信息'

      const [record] = await ctx.database.get('bili.binding', { id: koishiUserId })
      if (!record) return '你还没有发起绑定，请先使用 bili.binduid <uid>'
      if (record.verified) return `你已绑定 B 站 UID ${record.uid}，无需重复验证`

      let sign: string
      try {
        const info = await api.getUserInfo(record.uid)
        sign = info.sign ?? ''
      } catch {
        return '获取 B 站用户信息失败，请稍后重试'
      }

      if (!sign.includes(record.verifyCode)) {
        return (
          `验证失败：未在 UID ${record.uid} 的个性签名中找到验证码。\n` +
          `请确认签名中包含：${record.verifyCode}`
        )
      }

      await ctx.database.set('bili.binding', { id: koishiUserId }, {
        verified: true,
        boundAt: new Date(),
      })

      let userName = record.uid
      try {
        const info = await api.getUserInfo(record.uid)
        userName = info.name
      } catch {}

      return `验证成功！已绑定 B 站账号「${userName}」(UID ${record.uid})`
    })

  bili.subcommand('bili.unbinduid', '解除 B 站账号绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = (session.user as any)?.id as number | undefined
      if (!koishiUserId) return '无法获取用户信息'

      const [record] = await ctx.database.get('bili.binding', { id: koishiUserId })
      if (!record) return '你还没有绑定 B 站账号'

      await ctx.database.remove('bili.binding', { id: koishiUserId })
      return `已解除 B 站 UID ${record.uid} 的绑定`
    })

  bili.subcommand('bili.myuid', '查看你的 B 站绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = (session.user as any)?.id as number | undefined
      if (!koishiUserId) return '无法获取用户信息'

      const [record] = await ctx.database.get('bili.binding', { id: koishiUserId })
      if (!record) return '你还没有绑定 B 站账号，使用 bili.binduid <uid> 开始绑定'

      let userName = record.uid
      try {
        const info = await api.getUserInfo(record.uid)
        userName = info.name
      } catch {}

      const status = record.verified ? '已验证' : '待验证'
      return `你的 B 站绑定：${userName} (UID ${record.uid}) [${status}]`
    })

  // ── bili.login（扫码登录，主人专属） ─────────────────────────────────────

  bili.subcommand('bili.login', '扫码登录 B 站账号（主人专属）')
    .action(async ({ session }) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'

      const { url, qrcodeKey } = await auth.generateQrCode()
      if (!url) return '获取二维码失败，请稍后重试'

      await session.send([
        h.text('请使用 B 站 App 扫描以下二维码登录（有效期 3 分钟）：\n'),
        h.image(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`),
      ])

      let attempts = 0
      const timer = ctx.setInterval(async () => {
        attempts++
        if (attempts > 60) {
          timer()
          await session.send('二维码已超时，请重新执行 bili.login')
          return
        }
        const result = await auth.pollQrCode(qrcodeKey)
        if (result.status === 86038) {
          timer()
          await session.send('二维码已过期，请重新执行 bili.login')
        } else if (result.status === 0) {
          timer()
          auth.invalidateWbiCache()
          await session.send('登录成功！Cookie 已保存')
        }
      }, 3000)
    })
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

async function getBoundUid(ctx: Context, guildId: string, userId: string, koishiUserId?: number): Promise<string | null> {
  // 优先：admin 表的群级绑定
  const adminRows = await ctx.database.get('bili.admin', { guildId, userId })
  if (adminRows[0]?.uid) return adminRows[0].uid

  // 回退：用户自助绑定（跨群）
  if (koishiUserId) {
    const bindRows = await ctx.database.get('bili.binding', { id: koishiUserId, verified: true })
    if (bindRows[0]?.uid) return bindRows[0].uid
  }

  return null
}
