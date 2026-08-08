#!/usr/bin/env python3
"""Erzeugt docs/06-backlog.md und tickets.csv aus backlog/backlog.yaml.

Aufruf aus dem Projektwurzelverzeichnis:
    python3 scripts/generate_backlog.py

Die CSV ist bewusst generisch gehalten (Jira-, Linear- und Azure-DevOps-Import
akzeptieren diese Spalten bzw. lassen sie beim Import zuordnen).
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("PyYAML fehlt:  pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "backlog" / "backlog.yaml"
MD_OUT = ROOT / "docs" / "06-backlog.md"
CSV_OUT = ROOT / "backlog" / "tickets.csv"

PRIO_NAME = {"M": "Must", "S": "Should", "C": "Could", "W": "Won't"}
PRIO_ORDER = {"M": 0, "S": 1, "C": 2, "W": 3}


def load() -> dict:
    with SRC.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def joined(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    return ", ".join(str(v) for v in value)


def write_markdown(data: dict) -> None:
    meta = data["meta"]
    epics = data["epics"]
    tickets = data["tickets"]
    by_epic: dict[str, list] = {e["id"]: [] for e in epics}
    for t in tickets:
        by_epic.setdefault(t["epic"], []).append(t)

    total = sum(t.get("estimate", 0) for t in tickets)
    lines: list[str] = []
    a = lines.append

    a("# 06 — Backlog")
    a("")
    a("> **Generiert aus `backlog/backlog.yaml`. Nicht direkt bearbeiten.**")
    a(f"> Stand {meta['updated']} · {len(tickets)} Tickets in {len(epics)} Epics · "
      f"{total} Story Points gesamt")
    a("")

    # Übersicht
    a("## Überblick")
    a("")
    a("| Epic | Titel | Tickets | Punkte | Must |")
    a("|---|---|---:|---:|---:|")
    for e in epics:
        items = by_epic.get(e["id"], [])
        pts = sum(i.get("estimate", 0) for i in items)
        musts = sum(1 for i in items if i.get("priority") == "M")
        a(f"| {e['id']} | {e['title']} | {len(items)} | {pts} | {musts} |")
    a("")

    # Meilensteinverteilung
    ms: dict[str, list] = {}
    for t in tickets:
        ms.setdefault(t.get("milestone", "—"), []).append(t)
    a("## Verteilung nach Meilenstein")
    a("")
    a("| Meilenstein | Tickets | Punkte |")
    a("|---|---:|---:|")
    for key in sorted(ms):
        items = ms[key]
        a(f"| {key} | {len(items)} | {sum(i.get('estimate', 0) for i in items)} |")
    a("")

    # Details
    for e in epics:
        items = sorted(
            by_epic.get(e["id"], []),
            key=lambda t: (PRIO_ORDER.get(t.get("priority", "C"), 9), t["id"]),
        )
        if not items:
            continue
        a("---")
        a("")
        a(f"## {e['id']} — {e['title']}")
        a("")
        a(f"*Ziel: {e['goal']}*")
        a("")
        for t in items:
            a(f"### {t['id']} — {t['title']}")
            a("")
            meta_bits = [
                f"**Typ** {t.get('type', 'story')}",
                f"**Priorität** {PRIO_NAME.get(t.get('priority', ''), '—')}",
                f"**Schätzung** {t.get('estimate', '?')} SP",
                f"**Meilenstein** {t.get('milestone', '—')}",
            ]
            if t.get("requirements"):
                meta_bits.append(f"**Anforderungen** {joined(t['requirements'])}")
            if t.get("depends_on"):
                meta_bits.append(f"**Abhängig von** {joined(t['depends_on'])}")
            a(" · ".join(meta_bits))
            a("")
            a(t["description"].strip())
            a("")
            a("**Akzeptanzkriterien**")
            a("")
            for crit in t.get("acceptance", []):
                a(f"- [ ] {crit}")
            a("")

    MD_OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"geschrieben: {MD_OUT.relative_to(ROOT)}")


def write_csv(data: dict) -> None:
    epic_titles = {e["id"]: e["title"] for e in data["epics"]}
    cols = [
        "Key", "Summary", "Issue Type", "Epic", "Epic Name", "Priority",
        "Story Points", "Milestone", "Requirements", "Depends On",
        "Description", "Acceptance Criteria",
    ]
    with CSV_OUT.open("w", encoding="utf-8-sig", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(cols)
        for t in data["tickets"]:
            writer.writerow([
                t["id"],
                t["title"],
                t.get("type", "story").capitalize(),
                t["epic"],
                epic_titles.get(t["epic"], ""),
                PRIO_NAME.get(t.get("priority", ""), ""),
                t.get("estimate", ""),
                t.get("milestone", ""),
                joined(t.get("requirements")),
                joined(t.get("depends_on")),
                t["description"].strip(),
                "\n".join(f"- {c}" for c in t.get("acceptance", [])),
            ])
    print(f"geschrieben: {CSV_OUT.relative_to(ROOT)}")


def validate(data: dict) -> None:
    ids = [t["id"] for t in data["tickets"]]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        sys.exit(f"Doppelte Ticket-IDs: {sorted(dupes)}")
    known = set(ids)
    epics = {e["id"] for e in data["epics"]}
    for t in data["tickets"]:
        if t["epic"] not in epics:
            sys.exit(f"{t['id']}: unbekanntes Epic {t['epic']}")
        for dep in t.get("depends_on", []) or []:
            if dep not in known:
                sys.exit(f"{t['id']}: unbekannte Abhängigkeit {dep}")
    print(f"validiert: {len(ids)} Tickets, {len(epics)} Epics")


if __name__ == "__main__":
    payload = load()
    validate(payload)
    write_markdown(payload)
    write_csv(payload)
