import { execFileSync } from "node:child_process";
import { chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Aktiviert die versionierten Hooks aus .githooks/ als Git-Hook-Verzeichnis.
//
// Das Ausfuehrbar-Bit wird hier gesetzt, weil ueber die GitHub-Contents-API
// angelegte Dateien immer mit Modus 100644 im Baum landen. Ein Hook ohne
// Ausfuehrbar-Bit wird von Git stillschweigend uebersprungen -- die Pruefung
// waere dann wirkungslos, ohne dass es jemand merkt.

const hooksDir = ".githooks";

try {
  execFileSync("git", ["config", "core.hooksPath", hooksDir], { stdio: "ignore" });
  for (const entry of readdirSync(hooksDir)) {
    chmodSync(join(hooksDir, entry), 0o755);
  }
} catch {
  // Ausserhalb eines Git-Arbeitsverzeichnisses sind Hooks nicht relevant.
}
