export interface User {
  id: string;
  email: string;
  name: string;
  branchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions?: Permission[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
  permissions: string[];
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: Date;
}
