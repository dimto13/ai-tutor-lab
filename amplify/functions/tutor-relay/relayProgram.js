/**
 * Runs on the RMI-PC through AWS-RunShellScript, i.e. as root, like the Run Command calls of the
 * platform project. It only receives a sealed request: host alias, rotator URL, timeouts and the
 * prompt travel encrypted, and the prompt reaches the rotator on stdin, never in a shell string.
 *
 * The payload key lives at ~/.config/trainlabs-tutor-relay/payload.key of the account that owns
 * the NAS access; SSH runs as that account. Started by that account itself (local checks), the
 * program uses its own key and SSH directly.
 */
export const RELAY_PROGRAM = String.raw`import base64, glob, json, os, pwd, re, subprocess, sys

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


def attempt(item):
    timeout = int(item.get("timeout", 0))
    if timeout < 1 or timeout > 60:
        return {"status": 0, "error": "timeout-invalid"}
    remote = "curl -sS -m %d -D - -H 'Content-Type: application/json' --data-binary @- %s" % (
        timeout,
        request["url"],
    )
    command = ["/usr/bin/ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", request["host"], remote]
    if os.geteuid() == 0:
        command = ["/usr/sbin/runuser", "-u", user, "--"] + command
    try:
        done = subprocess.run(
            command,
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
    return {"status": status, "headers": route, "body": body.decode("utf-8", "replace")}


result = {"status": 0, "error": "no-attempt"}
for index, item in enumerate(request.get("attempts", [])[:2]):
    result = attempt(item)
    result["attempt"] = index
    result["model"] = str(item.get("body", {}).get("model", ""))
    # The rotator answers an unknown cloud model with 400, so every failure falls back.
    if result["status"] == 200:
        break

payload = json.dumps(dict(result, v=1, id=request.get("id"))).encode("utf-8")
nonce = os.urandom(12)
print("TRELAY1:" + base64.b64encode(nonce + aead.encrypt(nonce, payload, RESPONSE_AAD)).decode("ascii"))
`;

const SEALED_TOKEN = /^[A-Za-z0-9+/]+={0,2}$/;

/** The only variable part of the command is the base64 token, which cannot break the quoting. */
export function buildRelayCommand(sealedRequest) {
  if (!SEALED_TOKEN.test(sealedRequest)) throw new Error("Sealed request must be base64");
  return [
    "set -eu",
    `export TRELAY_REQUEST='${sealedRequest}'`,
    "exec /usr/bin/python3 - <<'TRELAY_PY'",
    RELAY_PROGRAM,
    "TRELAY_PY",
  ].join("\n");
}
