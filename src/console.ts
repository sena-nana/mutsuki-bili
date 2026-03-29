import { resolve } from 'node:path'
import type {} from '@koishijs/console'
import type { Context } from 'koishi'
import type { AuthManager } from './auth'
import type { Config } from './index'

export interface BiliAuthState {
  isLoggedIn: boolean
  loginSource: 'config' | 'db' | 'none'
  username?: string
}

declare module '@koishijs/console' {
  interface Events {
    'bili/get-auth-state'(): Promise<BiliAuthState>
    'bili/generate-qr'(): Promise<{ qrImageUrl: string; qrcodeKey: string }>
    'bili/poll-qr'(qrcodeKey: string): Promise<{ status: number; message: string }>
    'bili/logout'(): Promise<void>
  }
}

export function registerConsole(ctx: Context, config: Config, auth: AuthManager) {
  ctx.inject(['console'], (ctx) => {
    ctx.console.addEntry({
      dev: resolve(__dirname, '../client/index.ts'),
      prod: resolve(__dirname, '../dist'),
    })

    ctx.console.addListener('bili/get-auth-state', async () => {
      return getAuthState(ctx, config)
    })

    ctx.console.addListener('bili/generate-qr', async () => {
      const { dataUrl, qrcodeKey } = await auth.generateQrDataUrl()
      return { qrImageUrl: dataUrl, qrcodeKey }
    })

    ctx.console.addListener('bili/poll-qr', async (qrcodeKey: string) => {
      const result = await auth.pollQrCode(qrcodeKey)
      if (result.status === 0) auth.invalidateWbiCache()
      return result
    })

    ctx.console.addListener('bili/logout', async () => {
      await ctx.database.remove('bili.auth_data', { key: 'cookie' })
      auth.invalidateWbiCache()
    })
  })
}

async function getAuthState(ctx: Context, config: Config): Promise<BiliAuthState> {
  if (config.auth.sessdata) {
    return { isLoggedIn: true, loginSource: 'config', username: config.auth.dedeUserId || undefined }
  }
  const rows = await ctx.database.get('bili.auth_data', { key: 'cookie' })
  if (rows.length) {
    try {
      const cookies = JSON.parse(rows[0].value) as Record<string, string>
      return { isLoggedIn: true, loginSource: 'db', username: cookies.DedeUserID }
    } catch {}
  }
  return { isLoggedIn: false, loginSource: 'none' }
}
