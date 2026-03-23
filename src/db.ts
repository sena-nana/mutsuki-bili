import type { Context } from 'koishi'

export function registerModels(ctx: Context) {
  ctx.model.extend('bili.admin', {
    id: 'unsigned',
    guildId: 'string(127)',
    channel: { type: 'string', length: 127, initial: '' },
    userId: 'string(127)',
    uid: 'string(63)',
    types: { type: 'string', length: 63, initial: 'live,dynamic,video' },
    paused: { type: 'boolean', initial: false },
  }, { autoInc: true })

  ctx.model.extend('bili.user', {
    uid: 'string(63)',
    name: 'string(255)',
    faceUrl: 'text',
    liveRoomId: 'string(63)',
    checkedAt: 'timestamp',
  }, { primary: 'uid' })

  ctx.model.extend('bili.live_state', {
    uid: 'string(63)',
    isLive: { type: 'boolean', initial: false },
    title: { type: 'string', length: 255, initial: '' },
    coverUrl: { type: 'text', initial: '' },
    areaName: { type: 'string', length: 127, initial: '' },
    startedAt: 'timestamp',
    updatedAt: 'timestamp',
  }, { primary: 'uid' })

  ctx.model.extend('bili.dynamic_state', {
    uid: 'string(63)',
    lastDynamicId: { type: 'string', length: 63, initial: '0' },
    checkedAt: 'timestamp',
  }, { primary: 'uid' })

  ctx.model.extend('bili.video_state', {
    uid: 'string(63)',
    lastBvid: { type: 'string', length: 63, initial: '' },
    checkedAt: 'timestamp',
  }, { primary: 'uid' })

  ctx.model.extend('bili.auth_data', {
    key: 'string(63)',
    value: 'text',
    updatedAt: 'timestamp',
  }, { primary: 'key' })
}
