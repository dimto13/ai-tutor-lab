import type { StorageLike } from "../src/persistence/adapters/localStorageTrainingStateRepository.ts";
import { LocalStorageOfflineTrainingStateStore } from "../src/persistence/adapters/localStorageOfflineTrainingStateStore.ts";
import { LocalStorageTrainingStateRepository } from "../src/persistence/adapters/localStorageTrainingStateRepository.ts";
import { OfflineBufferedTrainingStateRepository } from "../src/persistence/offlineBufferedTrainingStateRepository.ts";
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

defineTrainingStateRepositoryContract("OfflineBufferedTrainingStateRepository", () => {
  const remoteStorage = new MemoryStorage();
  const offlineStorage = new MemoryStorage();

  return {
    repositoryFor() {
      return new OfflineBufferedTrainingStateRepository(
        new LocalStorageTrainingStateRepository(remoteStorage),
        new LocalStorageOfflineTrainingStateStore(offlineStorage),
      );
    },
  };
});
