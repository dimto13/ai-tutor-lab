import { defineBackend } from "@aws-amplify/backend";

import { auth } from "./auth/resource";

const backend = defineBackend({
  auth,
});

// Amplify Gen 2 enables guest identities by default. The training platform is a
// protected environment, so every cloud identity must be authenticated.
const { cfnIdentityPool } = backend.auth.resources.cfnResources;
cfnIdentityPool.allowUnauthenticatedIdentities = false;
