import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'prompts', 'docs', '.github'];
const textExtensions = new Set(['.md', '.yml', '.yaml', '.json']);
const excludedPrefixes = ['docs/archiv/', 'backlog/'];

const hardcodedControlPatterns = [
  /implementation[- ]control(?:[- ]issue|-ssot)?[^\n]{0,120}#\d+/i,
  /control[- ]ssot[^\n]{0,120}#\d+/i,
  /session- und kontextmanagement[^\n]{0,120}#\d+/i,
  /active control[^\n]{0,120}#\d+/i,
];

async function collectFiles(relativePath) {
  const absolutePath = path.join(root, relativePath);
  const statEntries = await readdir(absolutePath, { withFileTypes: true }).catch(() => null);

  if (statEntries === null) {
    return [relativePath];
  }

  const files = [];
  for (const entry of statEntries) {
    const child = path.posix.join(relativePath.replaceAll('\\', '/'), entry.name);
    if (excludedPrefixes.some((prefix) => child.startsWith(prefix))) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(child)));
    } else if (textExtensions.has(path.extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
}

const files = [];
for (const scanRoot of scanRoots) {
  if (path.extname(scanRoot)) {
    files.push(scanRoot);
  } else {
    files.push(...(await collectFiles(scanRoot)));
  }
}

const violations = [];
for (const file of [...new Set(files)]) {
  const relative = file.replaceAll('\\', '/');
  if (excludedPrefixes.some((prefix) => relative.startsWith(prefix))) {
    continue;
  }

  const content = await readFile(path.join(root, file), 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of hardcodedControlPatterns) {
      if (pattern.test(line)) {
        violations.push(
          `${relative}:${index + 1}: hardcoded CONTROL issue reference is forbidden: ${line.trim()}`,
        );
      }
    }
  });
}

const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
if (!agents.includes('control:active')) {
  violations.push('AGENTS.md must define dynamic CONTROL discovery via `control:active`.');
}
if (!agents.includes('docs/24-control-plane.md')) {
  violations.push('AGENTS.md must reference docs/24-control-plane.md.');
}

const controlPlane = await readFile(path.join(root, 'docs/24-control-plane.md'), 'utf8');
if (!controlPlane.includes('is:issue is:open label:"control:active"')) {
  violations.push('docs/24-control-plane.md must contain the canonical active-CONTROL discovery query.');
}

const issueTemplate = await readFile(path.join(root, '.github/ISSUE_TEMPLATE/aufgabe.md'), 'utf8');
if (issueTemplate.includes('backlog/backlog.yaml') || /per\s+Sync\s+erzeugt/i.test(issueTemplate)) {
  violations.push(
    '.github/ISSUE_TEMPLATE/aufgabe.md still advertises the retired generated-backlog sync.',
  );
}

if (violations.length > 0) {
  console.error('Control-plane contract validation failed:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Control-plane contract OK: ${new Set(files).size} governance files checked.`);
