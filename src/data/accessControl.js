export const ACCESS_ROLES = {
  admin: "Admin",
  viewer: "Viewer",
};

export const ROLE_PERMISSIONS = {
  [ACCESS_ROLES.admin]: {
    canExport: true,
    canEdit: true,
    canView: true,
    mode: "full",
  },
  [ACCESS_ROLES.viewer]: {
    canExport: false,
    canEdit: false,
    canView: true,
    mode: "read-only",
  },
};

export const DEFAULT_ROLE = ACCESS_ROLES.viewer;

export function getRolePermissions(role = DEFAULT_ROLE) {
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
}
