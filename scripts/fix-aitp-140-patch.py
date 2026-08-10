from pathlib import Path

path = Path("scripts/aitp-140-patch.py")
text = path.read_text()
old = '''replace(
    "apps/web/src/scenarios/contentLoader.ts",
    '  "copilot.context.changed",\\n  "ai.suggestion.shown",',
    '  "copilot.context.changed",\\n  "copilot.task.stopped",\\n  "ai.suggestion.shown",',
)
'''
new = '''replace(
    "apps/web/src/scenarios/contentLoader.ts",
    '  "copilot.context.changed",\\n  "ai.prompt.submitted",\\n  "ai.suggestion.shown",',
    '  "copilot.context.changed",\\n  "copilot.task.stopped",\\n  "ai.prompt.submitted",\\n  "ai.suggestion.shown",',
)
'''
if old not in text:
    raise SystemExit("AITP-140 content-loader patch block not found")
path.write_text(text.replace(old, new, 1))
