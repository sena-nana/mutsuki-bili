<template>
  <k-layout>
    <template #header>哔哩哔哩登录管理</template>

    <k-card v-if="authState === null" class="bili-card">
      <p>加载中...</p>
    </k-card>

    <k-card v-else-if="authState.isLoggedIn" class="bili-card">
      <div class="bili-status logged-in">
        <div class="bili-row">
          <span class="bili-label">登录状态</span>
          <span class="bili-value success">已登录</span>
        </div>
        <div class="bili-row" v-if="authState.username">
          <span class="bili-label">账号 UID</span>
          <span class="bili-value">{{ authState.username }}</span>
        </div>
        <div class="bili-row">
          <span class="bili-label">登录方式</span>
          <span class="bili-value">{{ authState.loginSource === 'config' ? '配置文件（高级）' : '扫码登录' }}</span>
        </div>
        <div v-if="authState.loginSource === 'config'" class="bili-note">
          Cookie 通过配置文件设置，请直接编辑 koishi.yml 修改。
        </div>
        <div v-else class="bili-actions">
          <k-button type="warning" @click="logout">退出登录</k-button>
        </div>
      </div>
    </k-card>

    <k-card v-else class="bili-card">
      <div class="bili-status not-logged-in">
        <div class="bili-row">
          <span class="bili-label">登录状态</span>
          <span class="bili-value warning">未登录</span>
        </div>
        <div v-if="!qrImageUrl" class="bili-actions">
          <k-button @click="generateQr" :disabled="generating">
            {{ generating ? '生成中...' : '获取登录二维码' }}
          </k-button>
        </div>
        <div v-else class="bili-qr-section">
          <p class="bili-qr-hint">请使用 B 站 App 扫描以下二维码：</p>
          <img :src="qrImageUrl" class="bili-qr-img" />
          <p class="bili-qr-status">{{ qrMessage }}</p>
          <div class="bili-actions">
            <k-button @click="cancelQr">取消</k-button>
          </div>
        </div>
        <div v-if="errorMessage" class="bili-error">{{ errorMessage }}</div>
      </div>
    </k-card>
  </k-layout>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { send } from '@koishijs/client'

interface AuthState {
  isLoggedIn: boolean
  loginSource: 'config' | 'db' | 'none'
  username?: string
}

const authState = ref<AuthState | null>(null)
const qrImageUrl = ref('')
const qrcodeKey = ref('')
const qrMessage = ref('等待扫码...')
const generating = ref(false)
const errorMessage = ref('')

let pollTimer: ReturnType<typeof setInterval> | null = null

async function fetchAuthState() {
  try {
    authState.value = await send('bili/get-auth-state')
  } catch {
    errorMessage.value = '获取登录状态失败'
  }
}

async function generateQr() {
  generating.value = true
  errorMessage.value = ''
  try {
    const result = await send('bili/generate-qr')
    qrImageUrl.value = result.qrImageUrl
    qrcodeKey.value = result.qrcodeKey
    qrMessage.value = '等待扫码...'
    startPolling()
  } catch {
    errorMessage.value = '获取二维码失败，请稍后重试'
  } finally {
    generating.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const result = await send('bili/poll-qr', qrcodeKey.value)
      if (result.status === 86038) {
        qrMessage.value = '二维码已过期，请重新生成'
        stopPolling()
        qrImageUrl.value = ''
      } else if (result.status === 86090) {
        qrMessage.value = '已扫码，请在手机上确认...'
      } else if (result.status === 0) {
        qrMessage.value = '登录成功！'
        stopPolling()
        qrImageUrl.value = ''
        await fetchAuthState()
      }
    } catch {}
  }, 3000)
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function cancelQr() {
  stopPolling()
  qrImageUrl.value = ''
  qrcodeKey.value = ''
}

async function logout() {
  try {
    await send('bili/logout')
    await fetchAuthState()
  } catch {
    errorMessage.value = '退出登录失败'
  }
}

onMounted(fetchAuthState)
onUnmounted(stopPolling)
</script>

<style scoped>
.bili-card {
  max-width: 480px;
}

.bili-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.bili-label {
  min-width: 80px;
  color: var(--k-text-light);
  font-size: 0.9em;
}

.bili-value {
  font-weight: 500;
}

.bili-value.success {
  color: var(--k-color-success);
}

.bili-value.warning {
  color: var(--k-color-warning);
}

.bili-note {
  margin: 12px 0;
  color: var(--k-text-light);
  font-size: 0.85em;
}

.bili-actions {
  margin-top: 16px;
}

.bili-qr-section {
  margin-top: 12px;
}

.bili-qr-hint {
  margin-bottom: 8px;
  color: var(--k-text-light);
}

.bili-qr-img {
  display: block;
  width: 200px;
  height: 200px;
  border-radius: 8px;
  border: 1px solid var(--k-color-border);
}

.bili-qr-status {
  margin-top: 8px;
  font-size: 0.9em;
  color: var(--k-text-light);
}

.bili-error {
  margin-top: 12px;
  color: var(--k-color-error);
  font-size: 0.9em;
}
</style>
