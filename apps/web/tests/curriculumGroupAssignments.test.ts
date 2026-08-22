import { describe, expect, it } from "vitest";
import {
  assignCurriculumToGroup,
  loadGroupCurriculumProgress,
  type CurriculumAssignmentStore,
  type CurriculumCompletion,
  type CurriculumGroupAssignment,
} from "../src/dashboard/curriculumGroupAssignments";

function memoryStore(options?: {
  assignments?: CurriculumGroupAssignment[];
  completions?: CurriculumCompletion[];
}) {
  const assignments = [...(options?.assignments ?? [])];
  const completions = [...(options?.completions ?? [])];
  const store: CurriculumAssignmentStore = {
    async listAssignments(tenantId) {
      return assignments.filter((assignment) => assignment.tenantId === tenantId);
    },
    async saveAssignment(assignment) {
      assignments.push(assignment);
    },
    async listCompletions(tenantId) {
      return completions.filter((completion) => completion.tenantId === tenantId);
    },
  };
  return { store, assignments };
}

describe("curriculum group assignments", () => {
  it("allows a tenant admin to assign a curriculum inside the authenticated tenant", async () => {
    const { store, assignments } = memoryStore();
    const assignment = await assignCurriculumToGroup({
      actor: { tenantId: "tenant-a", userId: "admin-1", roles: ["tenant_admin"] },
      tenantId: "tenant-a",
      groupId: "finance",
      curriculumId: "copilot-basics",
      assignedAt: 1_800_000_000_000,
      store,
    });

    expect(assignment.assignedBy).toBe("admin-1");
    expect(assignments).toEqual([assignment]);
  });

  it("denies assignment without tenant administration permission", async () => {
    const { store } = memoryStore();
    await expect(
      assignCurriculumToGroup({
        actor: { tenantId: "tenant-a", userId: "trainer-1", roles: ["trainer"] },
        tenantId: "tenant-a",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedAt: 1_800_000_000_000,
        store,
      }),
    ).rejects.toThrow("tenant administration permission");
  });

  it("fails closed for cross-tenant assignment and reporting", async () => {
    const { store } = memoryStore();
    const actor = { tenantId: "tenant-a", userId: "admin-1", roles: ["tenant_admin"] } as const;

    await expect(
      assignCurriculumToGroup({
        actor,
        tenantId: "tenant-b",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedAt: 1_800_000_000_000,
        store,
      }),
    ).rejects.toThrow("tenant scope");

    await expect(
      loadGroupCurriculumProgress({ actor, tenantId: "tenant-b", groupSizes: {}, store }),
    ).rejects.toThrow("tenant scope");
  });

  it("exposes aggregate completion per assigned group without person-specific output", async () => {
    const assignment: CurriculumGroupAssignment = {
      tenantId: "tenant-a",
      groupId: "finance",
      curriculumId: "copilot-basics",
      assignedAt: 1_800_000_000_000,
      assignedBy: "admin-1",
    };
    const { store } = memoryStore({
      assignments: [assignment],
      completions: [
        {
          tenantId: "tenant-a",
          groupId: "finance",
          curriculumId: "copilot-basics",
          userId: "u1",
          completedAt: 10,
        },
        {
          tenantId: "tenant-a",
          groupId: "finance",
          curriculumId: "copilot-basics",
          userId: "u1",
          completedAt: 11,
        },
        {
          tenantId: "tenant-a",
          groupId: "finance",
          curriculumId: "copilot-basics",
          userId: "u2",
          completedAt: 12,
        },
        {
          tenantId: "tenant-a",
          groupId: "finance",
          curriculumId: "other",
          userId: "u3",
          completedAt: 13,
        },
      ],
    });

    const progress = await loadGroupCurriculumProgress({
      actor: { tenantId: "tenant-a", userId: "trainer-1", roles: ["trainer"] },
      tenantId: "tenant-a",
      groupSizes: { finance: 4 },
      store,
    });

    expect(progress).toEqual([
      {
        tenantId: "tenant-a",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedLearners: 4,
        completedLearners: 2,
        completionPercent: 50,
      },
    ]);
    expect(progress[0]).not.toHaveProperty("userId");
  });

  it("denies aggregate progress to learners", async () => {
    const { store } = memoryStore();
    await expect(
      loadGroupCurriculumProgress({
        actor: { tenantId: "tenant-a", userId: "learner-1", roles: ["learner"] },
        tenantId: "tenant-a",
        groupSizes: {},
        store,
      }),
    ).rejects.toThrow("aggregate reporting permission");
  });
});
