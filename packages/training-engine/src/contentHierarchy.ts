import type { LearningLayer, Scenario } from "./types.ts";

export interface Curriculum {
  id: string;
  title: string;
  description?: string;
  courseIds: string[];
}

export interface Course {
  id: string;
  curriculumId: string;
  title: string;
  description?: string;
  moduleIds: string[];
}

export interface TrainingModule {
  id: string;
  courseId: string;
  title: string;
  description?: string;
  learningLayer: LearningLayer;
  scenarioIds: string[];
}

export interface LearningContentGraph {
  curricula: Curriculum[];
  courses: Course[];
  modules: TrainingModule[];
  scenarios: Scenario[];
}

export function validateLearningContentGraph(graph: LearningContentGraph): void {
  const curricula = new Map(graph.curricula.map((item) => [item.id, item]));
  const courses = new Map(graph.courses.map((item) => [item.id, item]));
  const modules = new Map(graph.modules.map((item) => [item.id, item]));
  const scenarios = new Map(graph.scenarios.map((item) => [item.id, item]));

  assertUnique("curriculum", graph.curricula.map((item) => item.id));
  assertUnique("course", graph.courses.map((item) => item.id));
  assertUnique("module", graph.modules.map((item) => item.id));
  assertUnique("scenario", graph.scenarios.map((item) => item.id));

  for (const course of graph.courses) {
    if (!curricula.has(course.curriculumId)) {
      throw new Error(`Course ${course.id} references unknown curriculum ${course.curriculumId}`);
    }
  }

  for (const module of graph.modules) {
    if (!courses.has(module.courseId)) {
      throw new Error(`Module ${module.id} references unknown course ${module.courseId}`);
    }
  }

  for (const scenario of graph.scenarios) {
    if (!scenario.moduleId || !modules.has(scenario.moduleId)) {
      throw new Error(`Scenario ${scenario.id} references unknown module ${scenario.moduleId ?? ""}`);
    }
  }

  for (const curriculum of graph.curricula) {
    assertReferences("course", curriculum.id, curriculum.courseIds, courses);
  }
  for (const course of graph.courses) {
    assertReferences("module", course.id, course.moduleIds, modules);
  }
  for (const module of graph.modules) {
    assertReferences("scenario", module.id, module.scenarioIds, scenarios);
  }
}

function assertUnique(kind: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
    seen.add(id);
  }
}

function assertReferences(
  kind: string,
  ownerId: string,
  ids: string[],
  values: ReadonlyMap<string, unknown>,
): void {
  for (const id of ids) {
    if (!values.has(id)) throw new Error(`${ownerId} references unknown ${kind} ${id}`);
  }
}
