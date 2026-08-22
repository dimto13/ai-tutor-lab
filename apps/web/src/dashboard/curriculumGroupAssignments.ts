import { hasApplicationPermission, type ApplicationRole } from "../auth/roles";

export type CurriculumGroupAssignment = Readonly<{
  tenantId: string;
  groupId: string;
  curriculumId: string;
  assignedAt: number;
  assignedBy: string;
}>;

export type CurriculumCompletion = Readonly<{
  tenantId: string;
  groupId: string;
  curriculumId: string;
  userId: string;
  completedAt?: number;
}>;

export type GroupCurriculumProgress = Readonly<{
  tenantId: string;
  groupId: string;
  curriculumId: string;
  assignedLearners: number;
  completedLearners: number;
  completionPercent: number;
}>;

export type CurriculumAssignmentStore = {
  listAssignments(tenantId: string): Promise<readonly CurriculumGroupAssignment[]>;
  saveAssignment(assignment: CurriculumGroupAssignment): Promise<void>;
  listCompletions(tenantId: string): Promise<readonly CurriculumCompletion[]>;
};

export type TenantActor = Readonly<{
  tenantId: string;
  userId: string;
  roles: readonly ApplicationRole[];
}>;

function assertTenantScope(actor: TenantActor, tenantId: string): void {
  if (!tenantId || actor.tenantId !== tenantId) {
    throw new Error("Curriculum group access denied for tenant scope");
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
}

export async function assignCurriculumToGroup(input: {
  actor: TenantActor;
  tenantId: string;
  groupId: string;
  curriculumId: string;
  assignedAt: number;
  store: CurriculumAssignmentStore;
}): Promise<CurriculumGroupAssignment> {
  assertTenantScope(input.actor, input.tenantId);
  if (!hasApplicationPermission(input.actor.roles, "tenant.admin")) {
    throw new Error("Curriculum assignment requires tenant administration permission");
  }

  assertNonEmpty(input.groupId, "groupId");
  assertNonEmpty(input.curriculumId, "curriculumId");
  if (!Number.isFinite(input.assignedAt) || input.assignedAt <= 0) {
    throw new Error("assignedAt must be a positive timestamp");
  }

  const assignment: CurriculumGroupAssignment = {
    tenantId: input.tenantId,
    groupId: input.groupId,
    curriculumId: input.curriculumId,
    assignedAt: input.assignedAt,
    assignedBy: input.actor.userId,
  };

  await input.store.saveAssignment(assignment);
  return assignment;
}

export async function loadGroupCurriculumProgress(input: {
  actor: TenantActor;
  tenantId: string;
  groupSizes: Readonly<Record<string, number>>;
  store: CurriculumAssignmentStore;
}): Promise<readonly GroupCurriculumProgress[]> {
  assertTenantScope(input.actor, input.tenantId);
  if (!hasApplicationPermission(input.actor.roles, "tenant.reporting.aggregate")) {
    throw new Error("Group curriculum progress requires aggregate reporting permission");
  }

  const [assignments, completions] = await Promise.all([
    input.store.listAssignments(input.tenantId),
    input.store.listCompletions(input.tenantId),
  ]);

  return assignments.map((assignment) => {
    const assignedLearners = Math.max(0, input.groupSizes[assignment.groupId] ?? 0);
    const completedUsers = new Set(
      completions
        .filter(
          (completion) =>
            completion.tenantId === input.tenantId &&
            completion.groupId === assignment.groupId &&
            completion.curriculumId === assignment.curriculumId &&
            completion.completedAt !== undefined,
        )
        .map((completion) => completion.userId),
    );
    const completedLearners = Math.min(assignedLearners, completedUsers.size);
    const completionPercent =
      assignedLearners === 0 ? 0 : Math.round((completedLearners / assignedLearners) * 100);

    return {
      tenantId: assignment.tenantId,
      groupId: assignment.groupId,
      curriculumId: assignment.curriculumId,
      assignedLearners,
      completedLearners,
      completionPercent,
    };
  });
}
