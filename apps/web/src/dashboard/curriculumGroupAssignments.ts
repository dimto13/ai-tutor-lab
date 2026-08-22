import { hasApplicationPermission, type ApplicationRole } from "../auth/roles.ts";

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

function normalizedId(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function assignmentKey(groupId: string, curriculumId: string): string {
  return `${groupId.length}:${groupId}${curriculumId.length}:${curriculumId}`;
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

  const userId = normalizedId(input.actor.userId, "actor.userId");
  const groupId = normalizedId(input.groupId, "groupId");
  const curriculumId = normalizedId(input.curriculumId, "curriculumId");
  if (!Number.isFinite(input.assignedAt) || input.assignedAt <= 0) {
    throw new Error("assignedAt must be a positive timestamp");
  }

  const existing = (await input.store.listAssignments(input.tenantId)).find(
    (assignment) => assignment.groupId === groupId && assignment.curriculumId === curriculumId,
  );
  if (existing) return existing;

  const assignment: CurriculumGroupAssignment = {
    tenantId: input.tenantId,
    groupId,
    curriculumId,
    assignedAt: input.assignedAt,
    assignedBy: userId,
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

  const completedByAssignment = new Map<string, Set<string>>();
  for (const completion of completions) {
    if (completion.tenantId !== input.tenantId || completion.completedAt === undefined) continue;
    const key = assignmentKey(completion.groupId, completion.curriculumId);
    const users = completedByAssignment.get(key) ?? new Set<string>();
    users.add(completion.userId);
    completedByAssignment.set(key, users);
  }

  return assignments.map((assignment) => {
    const rawGroupSize = input.groupSizes[assignment.groupId];
    if (rawGroupSize !== undefined && (!Number.isInteger(rawGroupSize) || rawGroupSize < 0)) {
      throw new Error(`Invalid group size for ${assignment.groupId}`);
    }
    const assignedLearners = rawGroupSize ?? 0;
    const completedLearners =
      completedByAssignment.get(assignmentKey(assignment.groupId, assignment.curriculumId))?.size ??
      0;
    if (completedLearners > assignedLearners) {
      throw new Error(`Completion count exceeds assigned learners for ${assignment.groupId}`);
    }
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
