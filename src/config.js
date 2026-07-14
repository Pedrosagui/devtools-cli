import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variavel de ambiente ${name} nao configurada. Copie .env.example para .env e preencha.`);
  }
  return value;
}

export const config = {
  jira: {
    site: required('JIRA_SITE').replace(/\/$/, ''),
    email: required('JIRA_EMAIL'),
    token: required('JIRA_TOKEN'),
    projectId: process.env.JIRA_PROJECT_ID || '',
    defaultIssueTypeId: process.env.JIRA_DEFAULT_ISSUETYPE_ID || '',
  },
  pg: {
    host: process.env.PG_HOST || 'localhost',
    port: Number(process.env.PG_PORT || 5432),
    database: required('PG_DATABASE'),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  },
};
