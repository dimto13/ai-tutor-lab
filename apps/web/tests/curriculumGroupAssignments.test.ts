import assert from "node:assert/strict";
import { describe, it } from "node:test";
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

    assert.equal(assignment.assignedBy, "admin-1");
    assert.deepEqual(assignments, [assignment]);
  });

  it("denies assignment without tenant administration permission", async () => {
    const { store } = memoryStore();
    await assert.rejects(
      assignCurriculumToGroup({
        actor: { tenantId: "tenant-a", userId: "trainer-1", roles: ["trainer"] },
        tenantId: "tenant-a",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedAt: 1_800_000_000_000,
        store,
      }),
      /tenant administration permission/,
    );
  });

  it("fails closed for cross-tenant assignment and reporting", async () => {
    const { store } = memoryStore();
    const actor = { tenantId: "tenant-a", userId: "admin-1", roles: ["tenant_admin"] } as const;

    await assert.rejects(
      assignCurriculumToGroup({
        actor,
        tenantId: "tenant-b",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedAt: 1_800_000_000_000,
        store,
      }),
      /tenant scope/,
    );

    await assert.rejects(
      loadGroupCurriculumProgress({ actor, tenantId: "tenant-b", groupSizes: {}, store }),
      /tenant scope/,
    );
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

    assert.deepEqual(progress, [
      {
        tenantId: "tenant-a",
        groupId: "finance",
        curriculumId: "copilot-basics",
        assignedLearners: 4,
        completedLearners: 2,
        completionPercent: 50,
      },
    ]);
    assert.equal(Object.hasOwn(progress[0], "userId"), false);
  });

  it("denies aggregate progress to learners", async () => {
    const { store } = memoryStore();
    await assert.rejects(
      loadGroupCurriculumProgress({
        actor: { tenantId: "tenant-a", userId: "learner-1", roles: ["learner"] },
        tenantId: "tenant-a",
        groupSizes: {},
        store,
      }),
      /aggregate reporting permission/,
    );
  });
});
