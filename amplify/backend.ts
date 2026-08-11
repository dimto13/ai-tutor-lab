import { defineBackend } from "@aws-amplify/backend";
import { auth } from "./auth/resource";

/**
 * Vorbereitung fuer AITP-83: Das Backend stellt ausschliesslich Auth bereit.
 *
 * Bewusst noch ohne `data`. Die Ablage von Lernfortschritt, Einstellungen und
 * Punkten ist AITP-84 und braucht ein eigenes Datenmodell mit tenantId/userId.
 * Bis dahin liefert Auth nur die Identitaet, unter der diese Daten spaeter haengen.
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
const backend = defineBackend({ auth });

// Keine Gast-Identitaeten ausgeben. AITP-82 verlangt, dass die Umgebung nicht
// offen zugaenglich ist; ein Identity Pool mit unauthenticated role waere genau das.
backend.auth.resources.cfnResources.cfnIdentityPool.allowUnauthenticatedIdentities = false;
