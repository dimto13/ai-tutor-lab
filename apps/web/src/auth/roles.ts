export const applicationRoles = ["learner", "author", "trainer", "tenant_admin"] as const;

export type ApplicationRole = (typeof applicationRoles)[number];

export const applicationPermissions = [
  "training.use",
  "content.author",
  "tenant.reporting.aggregate",
  "tenant.admin",
] as const;

export type ApplicationPermission = (typeof applicationPermissions)[number];

export const roleGroupPrefix = "role:";

export const rolePermissions: Readonly<Record<ApplicationRole, readonly ApplicationPermission[]>> =
  {
    learner: ["training.use"],
    author: ["training.use", "content.author"],
    trainer: ["training.use", "tenant.reporting.aggregate"],
    tenant_admin: ["training.use", "content.author", "tenant.reporting.aggregate", "tenant.admin"],
  };

export function isApplicationRole(value: string): value is ApplicationRole {
  return applicationRoles.some((role) => role === value);
}

/**
 * Normalize signed identity-provider groups to the cloud-neutral application roles.
 *
 * Tenant membership groups are intentionally ignored here. A session without an
 * explicit role remains a learner so existing pilot users keep the least-privileged
 * application role. Unknown `role:*` groups fail closed instead of silently granting
 * or guessing access.
 */
export function parseApplicationRolesFromGroups(
  groups: readonly string[],
): readonly ApplicationRole[] {
  const selected = new Set<ApplicationRole>();

  for (const group of groups) {
    if (!group.startsWith(roleGroupPrefix)) continue;

    const role = group.slice(roleGroupPrefix.length);
    if (!isApplicationRole(role)) {
      throw new Error(`Authenticated session has unknown application role group: ${group}`);
    }
    selected.add(role);
  }

  if (selected.size === 0) return ["learner"];
  return applicationRoles.filter((role) => selected.has(role));
}

export function permissionsForRoles(
  roles: readonly ApplicationRole[],
): readonly ApplicationPermission[] {
  const permissions = new Set<ApplicationPermission>();
  for (const role of roles) {
    for (const permission of rolePermissions[role]) permissions.add(permission);
  }
  return applicationPermissions.filter((permission) => permissions.has(permission));
}

export function hasApplicationPermission(
  roles: readonly ApplicationRole[],
  permission: ApplicationPermission,
): boolean {
  return roles.some((role) => rolePermissions[role].includes(permission));
}
