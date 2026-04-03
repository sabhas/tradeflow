export const ROLES = {
  ADMIN: 'Admin',
  ACCOUNTANT: 'Accountant',
  SALES: 'Sales',
  STOREKEEPER: 'Storekeeper',
} as const;

export const PERMISSIONS = {
  // Audit
  'audit:read': 'audit:read',

  'recycle_bin:read': 'recycle_bin:read',
  'recycle_bin:restore': 'recycle_bin:restore',

  // Inventory (future)
  'inventory:read': 'inventory:read',
  'inventory:write': 'inventory:write',

  // Sales (future)
  'sales:read': 'sales:read',
  'sales:create': 'sales:create',
  'sales:update': 'sales:update',
  'sales:post': 'sales:post',

  // Accounting (future)
  'accounting:read': 'accounting:read',
  'accounting:write': 'accounting:write',
} as const;
