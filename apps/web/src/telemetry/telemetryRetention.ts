export interface TenantTelemetryRetentionPolicy {
  rawEventRetentionDays: number;
}

export interface TelemetryDeletionPage {
  deletedCount: number;
  complete: boolean;
}

/**
 * Cloud-neutral persistence port for retention policy and subject-owned raw telemetry deletion.
 * Tenant and user scope are intentionally absent: the server derives both from authenticated identity.
 */
export interface TelemetryRetentionPort {
  loadRetentionPolicy(): Promise<TenantTelemetryRetentionPolicy>;
  saveRawEventRetentionDays(days: number): Promise<void>;
  deleteMyRawTelemetryPage(): Promise<TelemetryDeletionPage>;
}

function validRetentionDays(days: number): boolean {
  return Number.isInteger(days) && days >= 1;
}

export class TelemetryRetentionService {
  private readonly port: TelemetryRetentionPort;

  constructor(port: TelemetryRetentionPort) {
    this.port = port;
  }

  async loadPolicy(): Promise<TenantTelemetryRetentionPolicy> {
    const policy = await this.port.loadRetentionPolicy();
    if (!validRetentionDays(policy.rawEventRetentionDays)) {
      throw new Error("Telemetry retention policy is invalid");
    }
    return policy;
  }

  async saveRawEventRetentionDays(days: number): Promise<void> {
    if (!validRetentionDays(days)) {
      throw new Error("Raw telemetry retention days must be a positive integer");
    }
    await this.port.saveRawEventRetentionDays(days);
  }

  /**
   * Deletes all raw telemetry owned by the currently authenticated subject before account removal.
   * Anonymous aggregate projections are intentionally outside this port and therefore survive.
   */
  async deleteForAccountClosure(): Promise<number> {
    let deletedCount = 0;
    while (true) {
      const page = await this.port.deleteMyRawTelemetryPage();
      if (!Number.isInteger(page.deletedCount) || page.deletedCount < 0) {
        throw new Error("Telemetry deletion result is invalid");
      }
      deletedCount += page.deletedCount;
      if (page.complete) return deletedCount;
      if (page.deletedCount === 0) {
        throw new Error("Telemetry deletion made no progress");
      }
    }
  }
}
