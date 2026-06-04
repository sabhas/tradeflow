export function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

export function relationIdName(
  entity: { id: string; name: string } | null | undefined
): { id: string; name: string } | null {
  return entity ? { id: entity.id, name: entity.name } : null;
}

export function relationIdNameCode(
  entity: { id: string; name: string; code?: string } | null | undefined
): { id: string; name: string; code?: string } | null {
  return entity ? { id: entity.id, name: entity.name, code: entity.code } : null;
}
