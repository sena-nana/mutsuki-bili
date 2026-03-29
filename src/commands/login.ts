import type { Command, Context } from 'koishi'
import { h } from 'koishi'
import type { AuthManager } from '../auth'
import { checkAuthority } from './helpers'

export function registerLoginCommand(parent: Command, ctx: Context, auth: AuthManager) {
  parent.subcommand('.login', '扫码登录 B 站账号（主人专属）')
    .action(async ({ session }) => {
      if (!await checkAuthority(session, ctx)) return '权限不足'

      const { dataUrl, qrcodeKey } = await auth.generateQrDataUrl()
      if (!dataUrl) return '获取二维码失败，请稍后重试'

      await session.send([
        h.text('请使用 B 站 App 扫描以下二维码登录（有效期 3 分钟）：\n'),
        h.image(dataUrl),
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
