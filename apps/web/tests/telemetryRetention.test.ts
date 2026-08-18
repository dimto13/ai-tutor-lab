import assert from "node:assert/strict";
import test from "node:test";
import {
  TelemetryRetentionService,
  type TelemetryDeletionPage,
  type TelemetryRetentionPort,
} from "../src/telemetry/telemetryRetention.ts";

class MemoryRetentionPort implements TelemetryRetentionPort {
  rawEventRetentionDays = 90;
  deletionPages: TelemetryDeletionPage[] = [];

  async loadRetentionPolicy() {
    return { rawEventRetentionDays: this.rawEventRetentionDays };
  }

  async saveRawEventRetentionDays(days: number) {
    this.rawEventRetentionDays = days;
  }

  async deleteMyRawTelemetryPage() {
    const page = this.deletionPages.shift();
    if (!page) throw new Error("missing deletion page");
    return page;
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

test("TelemetryRetentionService drains every raw telemetry page for account closure", async () => {
  const port = new MemoryRetentionPort();
  port.deletionPages = [
    { deletedCount: 8, complete: false },
    { deletedCount: 5, complete: true },
  ];
  const service = new TelemetryRetentionService(port);

  assert.equal(await service.deleteForAccountClosure(), 13);
  assert.deepEqual(port.deletionPages, []);
});

test("TelemetryRetentionService fails closed when paginated deletion stops making progress", async () => {
  const port = new MemoryRetentionPort();
  port.deletionPages = [{ deletedCount: 0, complete: false }];
  const service = new TelemetryRetentionService(port);

  await assert.rejects(() => service.deleteForAccountClosure(), /made no progress/);
});
