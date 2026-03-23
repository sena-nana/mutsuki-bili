import { type Context, type Session } from 'koishi'
import type { BiliApiClient } from '../api'

/** 从 session 中提取平台格式化的上下文信息 */
export function getSessionContext(session: Session) {
  return {
    guildId: `${session.platform}:${session.guildId}`,
    userId: `${session.platform}:${session.userId}`,
    channelId: `${session.platform}:${session.channelId}`,
    koishiUserId: session.user?.id,
  }
}

/**
 * 检查调用者权限：
 *   1. authority >= 4（主人级）
 *   2. 当前群中绑定了指定 uid 的 admin 记录
 *   3. 用户自助绑定了该 uid（跨群回退）
 */
export async function checkAuthority(session: Session, ctx: Context, uid?: string): Promise<boolean> {
  if ((session.user?.authority ?? 0) >= 4) return true
  if (!uid || !session.guildId) return false

  const { guildId, userId, koishiUserId } = getSessionContext(session)

  const adminRows = await ctx.database.get('bili.admin', { guildId, userId, uid })
  if (adminRows.length > 0) return true

  if (koishiUserId) {
    const bindRows = await ctx.database.get('bili.binding', { id: koishiUserId, uid, verified: true })
    if (bindRows.length > 0) return true
  }

  return false
}

/** 获取用户绑定的 UID：admin 表优先，用户自助绑定回退 */
export async function getBoundUid(ctx: Context, guildId: string, userId: string, koishiUserId?: number): Promise<string | null> {
  const adminRows = await ctx.database.get('bili.admin', { guildId, userId })
  if (adminRows[0]?.uid) return adminRows[0].uid

  if (koishiUserId) {
    const bindRows = await ctx.database.get('bili.binding', { id: koishiUserId, verified: true })
    if (bindRows[0]?.uid) return bindRows[0].uid
  }

  return null
}

/** 安全获取 UP 主名称，失败时返回 uid */
export async function safeGetUserName(api: BiliApiClient, uid: string): Promise<string> {
  try {
    return (await api.getUserInfo(uid)).name
  } catch {
    return uid
  }
}
