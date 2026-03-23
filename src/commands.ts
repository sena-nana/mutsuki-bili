import { type Context, h, type Session } from 'koishi'
import type { BiliApiClient } from './api'
import type { AuthManager } from './auth'
import type { Config } from './index'

// ─── 鉴权辅助 ─────────────────────────────────────────────────────────────────

/**
 * 检查调用者权限：
 *   1. authority >= 4（主人级）
 *   2. 当前群中绑定了指定 uid 的 UP主 管理员
 */
async function checkAuthority(session: Session, ctx: Context, uid?: string): Promise<boolean> {
  if (((session.user as { authority?: number } | undefined)?.authority ?? 0) >= 4) return true
  if (!uid || !session.guildId) return false

  const guildId = `${session.platform}:${session.guildId}`
  const userId = `${session.platform}:${session.userId}`

  const rows = await ctx.database.get('bili.admin', { guildId, userId, uid })
  return rows.length > 0
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
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId)
      if (!targetUid) return '未指定 UID，或您在本群没有绑定记录'

      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: true })
      return `已暂停 UID ${targetUid} 在本群的推送`
    })

  bili.subcommand('bili.resume [uid:string]', '恢复当前群的推送')
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId)
      if (!targetUid) return '未指定 UID，或您在本群没有绑定记录'

      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: false })
      return `已恢复 UID ${targetUid} 在本群的推送`
    })

  bili.subcommand('bili.preview [uid:string]', '发送该 UP主 最新动态的测试推送')
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'

      const guildId = `${session.platform}:${session.guildId}`
      const userId = `${session.platform}:${session.userId}`
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId)
      if (!targetUid) return '未指定 UID，或您在本群没有绑定记录'

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

async function getBoundUid(ctx: Context, guildId: string, userId: string): Promise<string | null> {
  const rows = await ctx.database.get('bili.admin', { guildId, userId })
  return rows[0]?.uid ?? null
}
