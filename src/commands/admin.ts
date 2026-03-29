import type { Command, Context } from 'koishi'
import type { BiliApiClient } from '../api'
import { checkAuthority, getSessionContext, safeGetUserName } from './helpers'

const ALL_TYPES = 'live,dynamic,video'

export function registerAdminCommands(parent: Command, ctx: Context, api: BiliApiClient) {
  const admin = parent.subcommand('.admin', '管理 UP主 绑定（主人专属）')

  admin.subcommand('.bind <userId:string> <uid:string>', '绑定 UP主 账号（同时订阅推送）')
    .option('types', '-t <types:string> 推送类型，逗号分隔（live/dynamic/video），默认全部', { fallback: ALL_TYPES })
    .action(async ({ session, options }, userId, uid) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const { guildId, channelId } = getSessionContext(session)
      const normalizedUserId = userId.includes(':') ? userId : `${session.platform}:${userId}`

      const rawTypes = (options.types ?? ALL_TYPES).split(',').map(s => s.trim()).filter(Boolean)
      const validTypes = rawTypes.filter(t => ['live', 'dynamic', 'video'].includes(t))
      if (!validTypes.length) return '推送类型无效，可选：live, dynamic, video'
      const typesStr = validTypes.join(',')

      await ctx.database.upsert('bili.admin', [{
        guildId,
        channel: channelId,
        userId: normalizedUserId,
        uid,
        types: typesStr,
        paused: false,
      }], ['guildId', 'userId'])

      const name = await safeGetUserName(api, uid)
      return `已绑定 UP主「${name}」(${uid}) → ${normalizedUserId}，推送类型：${typesStr}`
    })

  admin.subcommand('.unbind <userId:string>', '解绑 UP主 账号（同时取消订阅）')
    .action(async ({ session }, userId) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const { guildId } = getSessionContext(session)
      const normalizedUserId = userId.includes(':') ? userId : `${session.platform}:${userId}`

      const rows = await ctx.database.get('bili.admin', { guildId, userId: normalizedUserId })
      if (!rows.length) return `${normalizedUserId} 在本群没有绑定记录`

      await ctx.database.remove('bili.admin', { guildId, userId: normalizedUserId })
      return `已解绑 ${normalizedUserId}（UID ${rows[0].uid}），推送订阅已同步取消`
    })

  admin.subcommand('.list', '查看本群所有绑定/订阅')
    .action(async ({ session }) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'
      if (!session.guildId) return '该指令只能在群内使用'

      const { guildId } = getSessionContext(session)
      const rows = await ctx.database.get('bili.admin', { guildId })
      if (!rows.length) return '本群暂无绑定记录'

      const lines = rows.map(r =>
        `${r.userId} → UID ${r.uid}  [${r.types}]${r.paused ? '  ⏸暂停' : ''}`,
      )
      return `本群 UP主 绑定/订阅列表：\n${lines.join('\n')}`
    })
}
