import type { Context } from 'koishi'
import type { BiliApiClient } from '../api'
import type { AuthManager } from '../auth'
import type { Config } from '../index'
import { registerAdminCommands } from './admin'
import { registerBindingCommands } from './binding'
import { registerLoginCommand } from './login'
import { registerUserCommands } from './user'

export function registerCommands(ctx: Context, _config: Config, api: BiliApiClient, auth: AuthManager) {
  const bili = ctx.command('bili', 'B站 UP主 推送插件')
  registerAdminCommands(bili, ctx, api)
  registerUserCommands(bili, ctx, api)
  registerBindingCommands(bili, ctx, api)
  registerLoginCommand(bili, ctx, auth)
}
