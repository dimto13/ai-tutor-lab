export interface TenantTelemetryRetentionPolicy {
  rawEventRetentionDays: number;
}

export interface TelemetryDeletionResult {
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
  deleteMyRawTelemetry(): Promise<TelemetryDeletionResult>;
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
   * The port operation is deliberately one server-controlled request; browser-side pagination must
   * never be responsible for completing personal-data deletion. Anonymous aggregate projections are
   * intentionally outside this port and therefore survive.
   */
  async deleteForAccountClosure(): Promise<number> {
    const result = await this.port.deleteMyRawTelemetry();
    if (!Number.isInteger(result.deletedCount) || result.deletedCount < 0 || result.complete !== true) {
      throw new Error("Telemetry deletion result is incomplete or invalid");
    }
    return result.deletedCount;
  }
}
