export interface UserIdentity {
  userId: string;
  tenantId: string | null;
  email: string | null;
  displayName: string | null;
  roles: readonly string[];
}

export interface AuthSession {
  identity: UserIdentity;
  accessToken: string | null;
  expiresAt: string | null;
}

export type SignInRequest =
  | {
      method: "password";
      identifier: string;
      password: string;
    }
  | {
      method: "oidc";
      providerId: string;
    };

export type SignInResult =
  | {
      status: "authenticated";
      session: AuthSession;
    }
  | {
      status: "redirecting";
    };

export interface SignUpRequest {
  email: string;
  password: string;
}

export type SignUpResult =
  | {
      status: "confirmation_required";
      email: string;
      destination: string | null;
    }
  | {
      status: "complete";
      email: string;
    };

export interface ConfirmSignUpRequest {
  email: string;
  confirmationCode: string;
}

/**
 * Cloud-neutral authentication boundary used by application and UI code.
 *
 * Concrete cloud SDKs belong behind an adapter and must normalize their
 * provider-specific user/session representation to these contracts.
 */
export interface AuthService {
  getSession(): Promise<AuthSession | null>;
  refreshSession(): Promise<AuthSession | null>;
  signIn(request: SignInRequest): Promise<SignInResult>;
  signUp(request: SignUpRequest): Promise<SignUpResult>;
  confirmSignUp(request: ConfirmSignUpRequest): Promise<void>;
  signOut(): Promise<void>;
}
