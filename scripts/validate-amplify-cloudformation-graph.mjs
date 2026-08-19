import { Template } from "aws-cdk-lib/assertions";

process.env.CDK_CONTEXT_JSON = JSON.stringify({
  "amplify-backend-name": "ci-cloudformation-graph",
  "amplify-backend-namespace": "ci",
  "amplify-backend-type": "branch",
  secretLastUpdated: 123456789,
});

const { backend } = await import("../amplify/backend.ts");

const resourceIdsFrom = (value, resourceIds, references = new Set()) => {
  if (Array.isArray(value)) {
    for (const entry of value) resourceIdsFrom(entry, resourceIds, references);
    return references;
  }

  if (value === null || typeof value !== "object") return references;

  if (typeof value.Ref === "string" && resourceIds.has(value.Ref)) {
    references.add(value.Ref);
  }

  const getAtt = value["Fn::GetAtt"];
  if (Array.isArray(getAtt) && typeof getAtt[0] === "string" && resourceIds.has(getAtt[0])) {
    references.add(getAtt[0]);
  } else if (typeof getAtt === "string") {
    const [logicalId] = getAtt.split(".", 1);
    if (resourceIds.has(logicalId)) references.add(logicalId);
  }

  const substitution = value["Fn::Sub"];
  if (typeof substitution === "string") {
    collectSubstitutionReferences(substitution, new Set(), resourceIds, references);
  } else if (Array.isArray(substitution) && typeof substitution[0] === "string") {
    const replacements =
      substitution[1] !== null && typeof substitution[1] === "object"
        ? new Set(Object.keys(substitution[1]))
        : new Set();
    collectSubstitutionReferences(substitution[0], replacements, resourceIds, references);
  }

  for (const nestedValue of Object.values(value)) {
    resourceIdsFrom(nestedValue, resourceIds, references);
  }

  return references;
};

const collectSubstitutionReferences = (template, replacements, resourceIds, references) => {
  for (const match of template.matchAll(/\$\{([A-Za-z0-9]+)(?:\.[^}]*)?\}/g)) {
    const logicalId = match[1];
    if (!replacements.has(logicalId) && resourceIds.has(logicalId)) references.add(logicalId);
  }
};

const dependencyGraph = (template) => {
  const resources = template.Resources ?? {};
  const resourceIds = new Set(Object.keys(resources));
  const graph = new Map();

  for (const [logicalId, resource] of Object.entries(resources)) {
    const dependencies = resourceIdsFrom(resource, resourceIds);
    const explicitDependencies = resource.DependsOn;
    if (typeof explicitDependencies === "string" && resourceIds.has(explicitDependencies)) {
      dependencies.add(explicitDependencies);
    } else if (Array.isArray(explicitDependencies)) {
      for (const dependency of explicitDependencies) {
        if (resourceIds.has(dependency)) dependencies.add(dependency);
      }
    }
    dependencies.delete(logicalId);
    graph.set(logicalId, dependencies);
  }

  return graph;
};

const findCycle = (graph) => {
  const visited = new Set();
  const active = new Set();
  const path = [];

  const visit = (node) => {
    if (active.has(node)) {
      const start = path.indexOf(node);
      return [...path.slice(start), node];
    }
    if (visited.has(node)) return null;

    visited.add(node);
    active.add(node);
    path.push(node);

    for (const dependency of graph.get(node) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }

    path.pop();
    active.delete(node);
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
};

const assertAcyclic = (name, stack) => {
  const template = Template.fromStack(stack).toJSON();
  const cycle = findCycle(dependencyGraph(template));
  if (cycle) {
    throw new Error(`${name}: CloudFormation dependency cycle detected: ${cycle.join(" -> ")}`);
  }
  console.log(`${name}: CloudFormation dependency graph is acyclic.`);
};

assertAcyclic("data", backend.data.stack);
for (const [name, stack] of Object.entries(backend.data.resources.nestedStacks)) {
  assertAcyclic(`data/${name}`, stack);
}

const dataTemplate = Template.fromStack(backend.data.stack);
dataTemplate.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
  StartingPosition: "TRIM_HORIZON",
  FunctionName: {},
  EventSourceArn: {},
});

console.log("Amplify CloudFormation graph smoke succeeded.");
