import {
  LocalStorageTrainingStateRepository,
  type StorageLike,
} from "../src/persistence/adapters/localStorageTrainingStateRepository.ts";
import { defineTrainingStateRepositoryContract } from "./trainingStateRepository.contract.ts";

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

defineTrainingStateRepositoryContract("LocalStorageTrainingStateRepository", () => {
  const storage = new MemoryStorage();
  return {
    repositoryFor: () => new LocalStorageTrainingStateRepository(storage),
  };
});
