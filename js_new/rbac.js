export function can(perm, permissions) {
  return (
    permissions?.includes(perm) ||
    permissions?.includes('system.full_access')
  )
}
