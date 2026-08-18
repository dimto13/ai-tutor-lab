import assert from "node:assert/strict";
import test from "node:test";
import {
  TelemetryRetentionService,
  type TelemetryDeletionResult,
  type TelemetryRetentionPort,
} from "../src/telemetry/telemetryRetention.ts";

class MemoryRetentionPort implements TelemetryRetentionPort {
  rawEventRetentionDays = 90;
  deletionResult: TelemetryDeletionResult = { deletedCount: 0, complete: true };
  deletionCalls = 0;

  async loadRetentionPolicy() {
    return { rawEventRetentionDays: this.rawEventRetentionDays };
  }

  async saveRawEventRetentionDays(days: number) {
    this.rawEventRetentionDays = days;
  }

  async deleteMyRawTelemetry() {
    this.deletionCalls += 1;
    return this.deletionResult;
  }
}

test("TelemetryRetentionService persists tenant raw-event retention through its port", async () => {
  const port = new MemoryRetentionPort();
  const service = new TelemetryRetentionService(port);

  assert.deepEqual(await service.loadPolicy(), { rawEventRetentionDays: 90 });
  await service.saveRawEventRetentionDays(30);
  assert.deepEqual(await service.loadPolicy(), { rawEventRetentionDays: 30 });

  await assert.rejects(() => service.saveRawEventRetentionDays(0), /positive integer/);
  await assert.rejects(() => service.saveRawEventRetentionDays(1.5), /positive integer/);
});

test("TelemetryRetentionService delegates account closure to one complete server deletion", async () => {
  const port = new MemoryRetentionPort();
  port.deletionResult = { deletedCount: 13, complete: true };
  const service = new TelemetryRetentionService(port);

  assert.equal(await service.deleteForAccountClosure(), 13);
  assert.equal(port.deletionCalls, 1);
});

test("TelemetryRetentionService fails closed when the server does not confirm complete deletion", async () => {
  const port = new MemoryRetentionPort();
  port.deletionResult = { deletedCount: 8, complete: false };
  const service = new TelemetryRetentionService(port);

  await assert.rejects(() => service.deleteForAccountClosure(), /incomplete or invalid/);
  assert.equal(port.deletionCalls, 1);
});
