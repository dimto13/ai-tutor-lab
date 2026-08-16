import assert from "node:assert/strict";
import test from "node:test";

import {
  hasApplicationPermission,
  parseApplicationRolesFromGroups,
  permissionsForRoles,
} from "../src/auth/roles.ts";

test("role groups normalize independently from tenant membership", () => {
  assert.deepEqual(
    parseApplicationRolesFromGroups([
      "tenant:acme-training",
      "role:trainer",
      "role:author",
      "unrelated-provider-group",
    ]),
    ["author", "trainer"],
  );
});

test("sessions without an explicit role remain least-privileged learners", () => {
  assert.deepEqual(parseApplicationRolesFromGroups(["tenant:acme-training"]), ["learner"]);
});

test("unknown role groups fail closed", () => {
  assert.throws(
    () => parseApplicationRolesFromGroups(["role:super_admin"]),
    /unknown application role group/,
  );
});

test("role permissions match the four application roles", () => {
  assert.deepEqual(permissionsForRoles(["learner"]), ["training.use"]);
  assert.deepEqual(permissionsForRoles(["author"]), ["training.use", "content.author"]);
  assert.deepEqual(permissionsForRoles(["trainer"]), [
    "training.use",
    "tenant.reporting.aggregate",
  ]);
  assert.deepEqual(permissionsForRoles(["tenant_admin"]), [
    "training.use",
    "content.author",
    "tenant.reporting.aggregate",
    "tenant.admin",
  ]);
});

test("trainer reporting permission does not imply tenant administration", () => {
  assert.equal(hasApplicationPermission(["trainer"], "tenant.reporting.aggregate"), true);
  assert.equal(hasApplicationPermission(["trainer"], "tenant.admin"), false);
  assert.equal(hasApplicationPermission(["tenant_admin"], "tenant.admin"), true);
});
