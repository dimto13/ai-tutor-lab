#!/usr/bin/env python3
"""Synchronisiert backlog/backlog.yaml nach GitHub (Milestones, Labels, Issues).

Idempotent: erkennt vorhandene Issues am Titelpräfix "AITP-x:" und aktualisiert sie,
statt Duplikate anzulegen. Bereits geschlossene Issues werden nicht wieder geöffnet.

Voraussetzungen:
    pip install pyyaml requests
    export GITHUB_TOKEN=<Personal Access Token mit Scope "repo">
    export GITHUB_REPO=dimto13/ai-tutor-lab        # optional, das ist der Standard

Aufruf:
    python3 scripts/sync_github.py            # zeigt an, was passieren würde (Dry Run)
    python3 scripts/sync_github.py --apply    # führt die Änderungen aus
"""
from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

try:
    import requests
    import yaml
except ImportError:
    sys.exit("Abhängigkeiten fehlen:  pip install pyyaml requests")

ROOT = Path(__file__).resolve().parent.parent
REPO = os.environ.get("GITHUB_REPO", "dimto13/ai-tutor-lab")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
API = f"https://api.github.com/repos/{REPO}"
APPLY = "--apply" in sys.argv

PRIO_LABEL = {"M": "prio: must", "S": "prio: should", "C": "prio: could", "W": "prio: wont"}
PRIO_COLOR = {"M": "d73a4a", "S": "e99695", "C": "fbca04", "W": "cccccc"}
TYPE_COLOR = {"story": "0e8a16", "task": "1d76db", "chore": "5319e7", "spike": "bfdadc"}
EPIC_COLOR = "6f42c1"

MILESTONE_DESCRIPTIONS = {
    "M1": "Refaktorierung zur Training Engine — Generizität strukturell verankern",
    "M2": "Betreibbares MVP auf AWS — echte Nutzer, echte Daten",
    "M3": "Pilot, Nachweise, Compliance",
    "M4": "Content-Skalierung, Betrieb & Dokumenten-Check",
    "M5": "Enterprise-Funktionen",
    "M6": "Echte Runtime",
}


def session() -> requests.Session:
    if not TOKEN:
        sys.exit("GITHUB_TOKEN ist nicht gesetzt. PAT mit Scope 'repo' erzeugen unter\n"
                 "https://github.com/settings/tokens und exportieren.")
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    return s


def paged(s: requests.Session, url: str, **params):
    params = {"per_page": 100, **params}
    while url:
        r = s.get(url, params=params)
        r.raise_for_status()
        yield from r.json()
        url = r.links.get("next", {}).get("url")
        params = {}


def act(s: requests.Session, method: str, url: str, what: str, **kw):
    if not APPLY:
        print(f"  [dry-run] {method.upper()} {what}")
        return None
    r = s.request(method, url, **kw)
    if r.status_code >= 300:
        sys.exit(f"Fehler bei {what}: {r.status_code} {r.text[:300]}")
    time.sleep(0.3)  # sanft zum Rate Limit
    return r.json()


def checked_acceptance(body: str | None) -> set[str]:
    """Liest manuell abgehakte Akzeptanzkriterien aus einem bestehenden Issue."""
    checked: set[str] = set()
    for line in (body or "").splitlines():
        match = re.match(r"^\s*-\s+\[[xX]\]\s+(.+?)\s*$", line)
        if match:
            checked.add(match.group(1))
    return checked


def issue_body(
    t: dict,
    epic_titles: dict[str, str],
    checked: set[str] | None = None,
) -> str:
    checked = checked or set()
    lines = [t["description"].strip(), ""]
    lines.append("### Akzeptanzkriterien")
    for c in t.get("acceptance", []):
        marker = "x" if c in checked else " "
        lines.append(f"- [{marker}] {c}")
    lines.append("")
    meta = [f"**Epic:** {t['epic']} — {epic_titles.get(t['epic'], '')}",
            f"**Schätzung:** {t.get('estimate', '?')} SP"]
    if t.get("requirements"):
        meta.append(f"**Anforderungen:** {', '.join(t['requirements'])}")
    if t.get("depends_on"):
        deps = ", ".join(f"`{d}`" for d in t["depends_on"])
        meta.append(f"**Abhängig von:** {deps}")
    lines += meta
    lines.append("")
    lines.append("<sub>Generiert aus `backlog/backlog.yaml` — inhaltliche Änderungen bitte "
                 "dort vornehmen und erneut synchronisieren.</sub>")
    return "\n".join(lines)


def main() -> None:
    data = yaml.safe_load((ROOT / "backlog" / "backlog.yaml").read_text(encoding="utf-8"))
    epics = data["epics"]
    tickets = data["tickets"]
    epic_titles = {e["id"]: e["title"] for e in epics}
    s = session()

    mode = "ÄNDERUNGEN WERDEN AUSGEFÜHRT" if APPLY else "DRY RUN (nichts wird geändert; --apply zum Ausführen)"
    print(f"Repo: {REPO} — {mode}\n")

    # ---- Labels ----
    existing_labels = {l["name"] for l in paged(s, f"{API}/labels")}
    wanted: dict[str, str] = {}
    for e in epics:
        wanted[f"epic: {e['id']}"] = EPIC_COLOR
    for p, name in PRIO_LABEL.items():
        wanted[name] = PRIO_COLOR[p]
    for tname, color in TYPE_COLOR.items():
        wanted[f"type: {tname}"] = color
    print("Labels:")
    for name, color in wanted.items():
        if name not in existing_labels:
            act(s, "post", f"{API}/labels", f"Label '{name}'",
                json={"name": name, "color": color})
        else:
            print(f"  vorhanden: {name}")

    # ---- Milestones ----
    existing_ms = {m["title"]: m["number"] for m in paged(s, f"{API}/milestones", state="all")}
    ms_needed = sorted(
        set(MILESTONE_DESCRIPTIONS)
        | {t["milestone"] for t in tickets if t.get("milestone")}
    )
    print("\nMilestones:")
    for title in ms_needed:
        if title not in existing_ms:
            res = act(s, "post", f"{API}/milestones", f"Milestone '{title}'",
                      json={"title": title,
                            "description": MILESTONE_DESCRIPTIONS.get(title, "")})
            if res:
                existing_ms[title] = res["number"]
        else:
            print(f"  vorhanden: {title}")

    # ---- Issues ----
    existing_issues: dict[str, dict] = {}
    for i in paged(s, f"{API}/issues", state="all"):
        if "pull_request" in i:
            continue
        prefix = i["title"].split(":", 1)[0].strip()
        if prefix.startswith("AITP-"):
            existing_issues[prefix] = i

    print(f"\nIssues ({len(tickets)} Tickets, {len(existing_issues)} bereits vorhanden):")
    created = updated = unchanged = skipped = 0
    for t in tickets:
        title = f"{t['id']}: {t['title']}"
        prev = existing_issues.get(t["id"])
        if prev is not None and prev["state"] == "closed":
            print(f"  geschlossen, unangetastet: {t['id']}")
            skipped += 1
            continue

        managed_labels = [
            f"epic: {t['epic']}",
            PRIO_LABEL.get(t.get("priority", "C"), "prio: could"),
            f"type: {t.get('type', 'story')}",
        ]
        existing_label_names = [label["name"] for label in (prev or {}).get("labels", [])]
        manual_labels = [
            name for name in existing_label_names
            if not name.startswith(("epic: ", "prio: ", "type: "))
        ]
        labels = manual_labels + managed_labels
        milestone = existing_ms.get(t.get("milestone"))
        payload = {
            "title": title,
            "body": issue_body(
                t,
                epic_titles,
                checked_acceptance((prev or {}).get("body")),
            ),
            "labels": labels,
            "milestone": milestone,
        }

        if prev is None:
            act(s, "post", f"{API}/issues", f"Issue {title}", json=payload)
            created += 1
        else:
            previous_milestone = (prev.get("milestone") or {}).get("number")
            is_changed = (
                prev["title"] != payload["title"]
                or (prev.get("body") or "") != payload["body"]
                or set(existing_label_names) != set(payload["labels"])
                or previous_milestone != payload["milestone"]
            )
            if is_changed:
                act(s, "patch", f"{API}/issues/{prev['number']}",
                    f"Issue {t['id']} aktualisieren", json=payload)
                updated += 1
            else:
                print(f"  vorhanden, unverändert: {t['id']}")
                unchanged += 1

    print(
        f"\nErgebnis: {created} neu, {updated} aktualisiert, "
        f"{unchanged} unverändert, {skipped} übersprungen."
    )
    if not APPLY:
        print("Das war ein Dry Run. Mit  python3 scripts/sync_github.py --apply  ausführen.")
    else:
        print("Project-Board prüfen: https://github.com/users/dimto13/projects/3")


if __name__ == "__main__":
    main()
