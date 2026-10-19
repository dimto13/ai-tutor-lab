import platformKnowledgeData from "../../../../content/tutor/platform-knowledge.de.json" with { type: "json" };
import { normalizeTutorText, wholeWords } from "./tutorText.ts";

export interface PlatformTopic {
  id: string;
  title: string;
  answer: string;
}

interface PlatformTopicSource extends PlatformTopic {
  patterns: string[];
}

const topics = (platformKnowledgeData as { topics: PlatformTopicSource[] }).topics.map((topic) => ({
  ...topic,
  matchers: topic.patterns.map(wholeWords),
}));

export function getPlatformTopics(): PlatformTopic[] {
  return topics.map(({ id, title, answer }) => ({ id, title, answer }));
}

/** First topic whose pattern occurs in the message; the content file orders topics by priority. */
export function findPlatformTopic(message: string): PlatformTopic | null {
  const text = normalizeTutorText(message);
  if (!text) return null;
  const topic = topics.find(({ matchers }) => matchers.some((matcher) => matcher.test(text)));
  return topic ? { id: topic.id, title: topic.title, answer: topic.answer } : null;
}
