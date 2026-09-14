/**
 * Programs for the RMI-PC. They run through AWS-RunShellScript, i.e. as root, like the Run Command
 * calls of the platform project, and only receive a sealed request: host alias, rotator URL,
 * timeouts and the prompt travel encrypted, and the prompt reaches the rotator on stdin, never in
 * a shell string.
 *
 * The payload key lives at ~/.config/trainlabs-tutor-relay/payload.key of the account that owns
 * the NAS access; SSH runs as that account. Started by that account itself (local checks), the
 * programs use its own key and SSH directly.
 */

// Shared by both programs: key lookup, the sealed request, SSH as the key owner, the sealed answer.
const PRELUDE = String.raw`import base64, glob, json, os, pwd, re, subprocess, sys

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    print("TRELAYERR:python-cryptography-missing")
    sys.exit(0)

REQUEST_AAD = b"trainlabs-tutor-relay/request/v1"
RESPONSE_AAD = b"trainlabs-tutor-relay/response/v1"
KEY_SUFFIX = ".config/trainlabs-tutor-relay/payload.key"
HOST_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
URL_RE = re.compile(r"^http://(localhost|127\.0\.0\.1):[0-9]{2,5}/[A-Za-z0-9/._-]*$")


def fail(code):
    print("TRELAYERR:" + code)
    sys.exit(0)


if os.geteuid() == 0:
    paths = glob.glob("/home/*/" + KEY_SUFFIX)
else:
    own = os.path.join(os.path.expanduser("~"), KEY_SUFFIX)
    paths = [own] if os.path.exists(own) else []
if len(paths) != 1:
    fail("key-not-unique")
info = os.stat(paths[0])
if info.st_uid == 0:
    fail("key-owner-root")
if info.st_mode & 0o077:
    fail("key-permissions")
user = pwd.getpwuid(info.st_uid).pw_name
with open(paths[0], "rb") as handle:
    key = base64.b64decode(handle.read().strip())
if len(key) != 32:
    fail("key-length")
aead = AESGCM(key)

try:
    sealed = base64.b64decode(os.environ["TRELAY_REQUEST"])
    request = json.loads(aead.decrypt(sealed[:12], sealed[12:], REQUEST_AAD))
except Exception:
    fail("request-invalid")
if (
    request.get("v") != 1
    or not HOST_RE.match(str(request.get("host", "")))
    or not URL_RE.match(str(request.get("url", "")))
):
    fail("request-invalid")


def parse_http(raw):
    # curl -D - writes every header block (e.g. 100 Continue) before the body.
    status, headers, rest = 0, {}, raw
    while rest.startswith(b"HTTP/"):
        head, separator, rest = rest.partition(b"\r\n\r\n")
        if not separator:
            break
        lines = head.decode("latin-1").split("\r\n")
        parts = lines[0].split(" ")
        status = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        headers = {}
        for line in lines[1:]:
            name, _, value = line.partition(":")
            headers[name.strip().lower()] = value.strip()
    return status, headers, rest


def over_ssh(remote):
    command = [
        "/usr/bin/ssh",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=5",
        "-o", "ServerAliveInterval=3",
        "-o", "ServerAliveCountMax=2",
        request["host"],
        remote,
    ]
    if os.geteuid() == 0:
        command = ["/usr/sbin/runuser", "-u", user, "--"] + command
    return command


def answer(result):
    payload = json.dumps(dict(result, v=1, id=request.get("id"))).encode("utf-8")
    nonce = os.urandom(12)
    print("TRELAY1:" + base64.b64encode(nonce + aead.encrypt(nonce, payload, RESPONSE_AAD)).decode("ascii"))
`;

const CHAT = String.raw`

def attempt(item):
    timeout = int(item.get("timeout", 0))
    if timeout < 1 or timeout > 60:
        return {"status": 0, "error": "timeout-invalid"}
    remote = "curl -sS -m %d -D - -H 'Content-Type: application/json' --data-binary @- %s" % (
        timeout,
        request["url"],
    )
    try:
        done = subprocess.run(
            over_ssh(remote),
            input=json.dumps(item.get("body", {})).encode("utf-8"),
            capture_output=True,
            timeout=timeout + 10,
        )
    except subprocess.TimeoutExpired:
        return {"status": 0, "error": "timeout"}
    if done.returncode != 0:
        return {"status": 0, "error": "transport-exit-%d" % done.returncode}
    status, headers, body = parse_http(done.stdout)
    route = {name: headers[name] for name in ("x-ollama-route", "x-ollama-account", "via") if name in headers}
    result = {"status": status, "headers": route, "body": body.decode("utf-8", "replace")}
    if status != 200:
        # Rotator and Ollama name the failure in error.type, e.g. model_not_allowed or not_found_error.
        try:
            kind = json.loads(body)["error"]["type"]
        except Exception:
            kind = None
        if isinstance(kind, str) and re.match(r"^[a-z_]{1,40}$", kind):
            result["type"] = kind
    return result


result = {"status": 0, "error": "no-attempt"}
tried = []
for index, item in enumerate(request.get("attempts", [])[:2]):
    result = attempt(item)
    result["attempt"] = index
    result["model"] = str(item.get("body", {}).get("model", ""))
    # Model, status and failure signal of every attempt, never prompt or answer.
    tried.append({key: result[key] for key in ("model", "status", "error", "type") if key in result})
    # The rotator answers an unknown cloud model with 400, so every failure falls back.
    if result["status"] == 200:
        break

result["tried"] = tried
answer(result)
`;

// Health (#480): reports every station of the tutor path without calling a model.
const HEALTH = String.raw`
import urllib.request

if request.get("mode") != "health" or not re.match(
    r"^http://(localhost|127\.0\.0\.1):[0-9]{2,5}$", str(request.get("ollama", ""))
):
    fail("request-invalid")

ROTATOR = re.match(r"^http://[^/]+", request["url"]).group(0)
NEXT = "TRELAY-HEALTH-NEXT"

# The rotator's own status and a probe of its cloud route in one SSH round trip, running while the
# local checks below take place.
remote = "curl -sS -m 4 -D - %s/healthz; echo; echo %s; curl -sS -m 4 -D - %s/api/version" % (
    ROTATOR,
    NEXT,
    ROTATOR,
)
nas = subprocess.Popen(
    over_ssh(remote), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
)

local = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def local_json(path):
    try:
        with local.open(request["ollama"] + path, timeout=2) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def model_names(listing):
    models = listing.get("models") if isinstance(listing, dict) else None
    return {m["name"] for m in models or [] if isinstance(m, dict) and isinstance(m.get("name"), str)}


version = local_json("/api/version")
installed = model_names(local_json("/api/tags"))
loaded = model_names(local_json("/api/ps"))
if isinstance(version, dict) and isinstance(version.get("version"), str):
    ollama = {"status": "ok", "version": version["version"]}
else:
    ollama = {"status": "down"}

try:
    out, _ = nas.communicate(timeout=15)
    ssh_error = "transport-exit-255" if nas.returncode == 255 else None
except subprocess.TimeoutExpired:
    nas.kill()
    out, ssh_error = b"", "timeout"

allowed = None
if ssh_error:
    ssh = {"status": "down", "error": ssh_error}
    rotator = {"status": "unknown"}
    cloud = {"status": "unknown"}
else:
    ssh = {"status": "ok"}
    first, _, second = out.partition(("\n%s\n" % NEXT).encode("ascii"))
    status, _, body = parse_http(first)
    try:
        state = json.loads(body) if status == 200 else None
    except ValueError:
        state = None
    if isinstance(state, dict) and state.get("status") == "ok":
        accounts = [a for a in state.get("konten") or [] if isinstance(a, dict)]
        free = sum(1 for a in accounts if a.get("frei") is True and not a.get("gesperrt_noch_s"))
        if isinstance(state.get("erlaubte_modelle"), list):
            allowed = {str(m) for m in state["erlaubte_modelle"]}
        # Counts only: account names and key endings stay on the NAS.
        rotator = {"status": "ok", "cloudAccounts": len(accounts), "cloudAccountsFree": free}
        cloud_status = parse_http(second)[0]
        if cloud_status != 200:
            cloud = {"status": "down", "httpStatus": cloud_status}
        elif accounts and not free:
            cloud = {"status": "degraded", "error": "accounts-limited"}
        else:
            cloud = {"status": "ok"}
    else:
        rotator = {"status": "down", "httpStatus": status}
        cloud = {"status": "unknown"}


def model(name):
    if not name:
        return None
    if name.endswith("@local"):
        if ollama["status"] != "ok":
            return {"status": "unknown"}
        base = name[: -len("@local")]
        return {"status": "ok" if base in installed else "missing", "loaded": base in loaded}
    if allowed is None:
        return {"status": "unknown"}
    return {"status": "ok" if name in allowed else "missing"}


models = request.get("models") if isinstance(request.get("models"), dict) else {}
answer(
    {
        "health": {
            "sshNas": ssh,
            "rotator": rotator,
            "cloudRoute": cloud,
            "ollama": ollama,
            "models": {
                "primary": model(str(models.get("primary") or "")),
                "fallback": model(str(models.get("fallback") or "")),
            },
        }
    }
)
`;

export const RELAY_PROGRAM = PRELUDE + CHAT;
export const HEALTH_PROGRAM = PRELUDE + HEALTH;

const SEALED_TOKEN = /^[A-Za-z0-9+/]+={0,2}$/;

/** The only variable part of the command is the base64 token, which cannot break the quoting. */
function nodeCommand(program, sealedRequest) {
  if (!SEALED_TOKEN.test(sealedRequest)) throw new Error("Sealed request must be base64");
  return [
    "set -eu",
    `export TRELAY_REQUEST='${sealedRequest}'`,
    "exec /usr/bin/python3 - <<'TRELAY_PY'",
    program,
    "TRELAY_PY",
  ].join("\n");
}

export function buildRelayCommand(sealedRequest) {
  return nodeCommand(RELAY_PROGRAM, sealedRequest);
}

export function buildHealthCommand(sealedRequest) {
  return nodeCommand(HEALTH_PROGRAM, sealedRequest);
}
