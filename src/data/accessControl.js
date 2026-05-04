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

export function normalizeRole(role = DEFAULT_ROLE) {
  const value = String(role || DEFAULT_ROLE).trim().toLowerCase();

  if (value === "admin") {
    return ACCESS_ROLES.admin;
  }

  if (value === "viewer") {
    return ACCESS_ROLES.viewer;
  }

  return DEFAULT_ROLE;
}

export function getRolePermissions(role = DEFAULT_ROLE) {
  const normalizedRole = normalizeRole(role);
  return ROLE_PERMISSIONS[normalizedRole] ?? ROLE_PERMISSIONS[DEFAULT_ROLE];
}
