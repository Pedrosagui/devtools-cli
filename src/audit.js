import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_PATH = path.join(__dirname, '..', 'audit.log');

export function logAction(command, args, result) {
  const entry = {
    ts: new Date().toISOString(),
    command,
    args,
    result,
  };
  try {
    fs.appendFileSync(AUDIT_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // auditoria nao deve derrubar o comando principal
  }
}
