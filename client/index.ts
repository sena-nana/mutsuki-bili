import { Context } from '@koishijs/client'
import LoginPage from './views/login.vue'

export default (ctx: Context) => {
  ctx.page({
    id: 'bili-login',
    path: '/bili',
    name: '哔哩哔哩',
    icon: 'activity:star',
    order: 300,
    component: LoginPage,
  })
}
