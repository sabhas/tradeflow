export function hasPermission(permissions: string[], code: string): boolean {
  return permissions.includes('*') || permissions.includes(code);
}
