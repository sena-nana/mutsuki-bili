import { randomBytes } from 'node:crypto'
import { type Command, type Context } from 'koishi'
import type { BiliApiClient } from '../api'
import { safeGetUserName } from './helpers'

function generateVerifyCode(): string {
  return `mutsuki-${randomBytes(3).toString('hex')}`
}

export function registerBindingCommands(parent: Command, ctx: Context, api: BiliApiClient) {
  parent.subcommand('bili.binduid <uid:string>', '绑定你的 B 站账号')
    .userFields(['id'])
    .action(async ({ session }, uid) => {
      const koishiUserId = session.user?.id
      if (!koishiUserId) return '无法获取用户信息，请确认数据库服务正常'

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

  parent.subcommand('bili.verify', '验证 B 站账号绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = session.user?.id
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

      const userName = await safeGetUserName(api, record.uid)
      return `验证成功！已绑定 B 站账号「${userName}」(UID ${record.uid})`
    })

  parent.subcommand('bili.unbinduid', '解除 B 站账号绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = session.user?.id
      if (!koishiUserId) return '无法获取用户信息'

      const [record] = await ctx.database.get('bili.binding', { id: koishiUserId })
      if (!record) return '你还没有绑定 B 站账号'

      await ctx.database.remove('bili.binding', { id: koishiUserId })
      return `已解除 B 站 UID ${record.uid} 的绑定`
    })

  parent.subcommand('bili.myuid', '查看你的 B 站绑定')
    .userFields(['id'])
    .action(async ({ session }) => {
      const koishiUserId = session.user?.id
      if (!koishiUserId) return '无法获取用户信息'

      const [record] = await ctx.database.get('bili.binding', { id: koishiUserId })
      if (!record) return '你还没有绑定 B 站账号，使用 bili.binduid <uid> 开始绑定'

      const userName = await safeGetUserName(api, record.uid)
      const status = record.verified ? '已验证' : '待验证'
      return `你的 B 站绑定：${userName} (UID ${record.uid}) [${status}]`
    })
}
