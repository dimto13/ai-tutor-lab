import { util } from "@aws-appsync/utils";

const TENANT_GROUP_PREFIX = "tenant:";
const ROLE_GROUP_PREFIX = "role:";
const KNOWN_ROLE_GROUPS = [
  "role:learner",
  "role:author",
  "role:trainer",
  "role:tenant_admin",
];

function caller(ctx) {
  const identity = ctx.identity;
  if (!identity || typeof identity.sub !== "string" || identity.sub.length === 0) {
    util.unauthorized();
  }

  const groups = identity.groups || [];
  let tenantId = null;
  let reportingRole = null;

  for (const group of groups) {
    if (typeof group === "string") {
      if (group.startsWith(TENANT_GROUP_PREFIX)) {
        const candidate = group.slice(TENANT_GROUP_PREFIX.length);
        if (candidate.length === 0) {
          util.error("Invalid tenant membership", "TenantMembershipError");
        }
        if (tenantId !== null && tenantId !== candidate) {
          util.error(
            "Multiple tenant memberships require explicit tenant selection",
            "TenantMembershipError",
          );
        }
        tenantId = candidate;
      } else if (group.startsWith(ROLE_GROUP_PREFIX)) {
        if (KNOWN_ROLE_GROUPS.indexOf(group) === -1) {
          util.error("Unknown application role membership", "RoleMembershipError");
        }
        if (group === "role:tenant_admin") reportingRole = "tenant_admin";
        else if (group === "role:trainer" && reportingRole === null) reportingRole = "trainer";
      }
    }
  }

  if (reportingRole === null) util.unauthorized();

  return {
    tenantId: tenantId || `personal:${identity.sub}`,
    role: reportingRole,
  };
}

export function request(ctx) {
  const subject = caller(ctx);
  return {
    payload: {
      tenantId: subject.tenantId,
      role: subject.role,
      personSpecificAttemptAccess: false,
    },
  };
}

export function response(ctx) {
  return ctx.result;
}
