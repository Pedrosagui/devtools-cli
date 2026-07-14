import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '.env');
dotenv.config({ path: ENV_PATH });

export const config = {
  jira: {
    site: (process.env.JIRA_SITE || '').replace(/\/$/, ''),
    email: process.env.JIRA_EMAIL || '',
    token: process.env.JIRA_TOKEN || '',
    projectId: process.env.JIRA_PROJECT_ID || '',
    defaultIssueTypeId: process.env.JIRA_DEFAULT_ISSUETYPE_ID || '',
  },
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || '',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  },
  // quando true, "db executar" e "jira excluir" nunca mais perguntam/exigem
  // --confirmar - fica assim ate a pessoa desligar de novo (ver setSkipConfirm).
  skipConfirm: process.env.SKIP_CONFIRM === 'true',
};

// Persiste (ou remove) SKIP_CONFIRM=true no .env, sem apagar o resto do arquivo.
export function setSkipConfirm(value) {
  let content = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const line = `SKIP_CONFIRM=${value}`;
  if (/^SKIP_CONFIRM=.*$/m.test(content)) {
    content = content.replace(/^SKIP_CONFIRM=.*$/m, line);
  } else {
    content = content.replace(/\n?$/, '\n') + line + '\n';
  }
  fs.writeFileSync(ENV_PATH, content, 'utf8');
  config.skipConfirm = value;
}

export function requireJiraConfig() {
  const missing = ['site', 'email', 'token'].filter((k) => !config.jira[k]);
  if (missing.length) {
    throw new Error(
      `Faltando JIRA_${missing.map((m) => m.toUpperCase()).join(', JIRA_')} no .env - copie .env.example para .env e preencha.`
    );
  }
}

export function requirePgConfig() {
  if (!config.pg.database) {
    throw new Error('PG_DATABASE nao configurado no .env - preencha as variaveis PG_* antes de usar comandos "db".');
  }
}
