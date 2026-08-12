export interface UserProfileSubject {
  userId: string;
  tenantId: string | null;
}

export interface UserProfileRecord {
  subject: UserProfileSubject;
  displayName: string | null;
  email: string | null;
  revision: number;
}

export class UserProfileConflictError extends Error {
  readonly expectedRevision: number | null;
  readonly actualRevision: number | null;

  constructor(expectedRevision: number | null, actualRevision: number | null) {
    super(
      `User profile revision conflict: expected ${expectedRevision ?? "none"}, actual ${actualRevision ?? "none"}`,
    );
    this.name = "UserProfileConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export interface UserProfileRepository {
  load(subject: UserProfileSubject): Promise<UserProfileRecord | null>;
  save(
    subject: UserProfileSubject,
    input: { displayName: string | null },
    expectedRevision: number | null,
  ): Promise<UserProfileRecord>;
}
