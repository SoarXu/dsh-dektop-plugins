export function normalizeUser(payload) {
  const user = payload?.user ?? {}
  const displayName = String(user.displayName ?? user.display_name ?? '').trim()
  const account = String(user.sAMAccountName ?? user.account ?? '').trim()
  return { displayName: displayName || account || '用户' }
}

export function authLabel(state) {
  if (state?.loading) return '正在登录...'
  if (state?.authenticated) return normalizeUser(state).displayName
  return '登录'
}
