import type { Command, Context } from 'koishi'
import type { BiliApiClient } from '../api'
import { dynamicItemToNotification } from '../converters'
import type { MessageFormatter } from '../formatter'
import { checkAuthority, getBoundUid, getSessionContext } from './helpers'

export function registerUserCommands(parent: Command, ctx: Context, api: BiliApiClient, formatter: MessageFormatter) {
  parent.subcommand('.pause [uid:string]', '暂停当前群的推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'
      const { guildId, userId, koishiUserId } = getSessionContext(session)
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'
      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: true })
      return `已暂停 UID ${targetUid} 在本群的推送`
    })

  parent.subcommand('.resume [uid:string]', '恢复当前群的推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'
      const { guildId, userId, koishiUserId } = getSessionContext(session)
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'
      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      await ctx.database.set('bili.admin', { guildId, userId, uid: targetUid }, { paused: false })
      return `已恢复 UID ${targetUid} 在本群的推送`
    })

  parent.subcommand('.preview [uid:string]', '发送该 UP主 最新动态的测试推送')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      if (!session.guildId) return '该指令只能在群内使用'
      const { guildId, userId, koishiUserId } = getSessionContext(session)
      const targetUid = uid ?? await getBoundUid(ctx, guildId, userId, koishiUserId)
      if (!targetUid) return '未指定 UID，或您没有绑定记录'
      if (!await checkAuthority(session, ctx, targetUid)) return '权限不足'

      try {
        const { items } = await api.getUserDynamics(targetUid)
        if (!items.length) return '该 UP主 暂无动态'
        const notification = dynamicItemToNotification(items[0])
        const elements = formatter.format(notification)
        await session.send(elements)
      } catch (err) {
        return `获取动态失败：${String(err)}`
      }
    })
}
