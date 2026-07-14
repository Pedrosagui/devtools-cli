import pg from 'pg';
import { config } from './config.js';

const { Client } = pg;

async function withClient(fn) {
  const client = new Client(config.pg);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function runQuery(sql) {
  const trimmed = sql.trim();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error('db consultar so aceita SELECT. Pra outras operacoes use "db executar ... --confirmar".');
  }
  return withClient(async (client) => {
    const result = await client.query(trimmed);
    return { rows: result.rows, rowCount: result.rowCount };
  });
}

export async function runExec(sql, confirmar) {
  const trimmed = sql.trim();
  if (/^select\b/i.test(trimmed)) {
    throw new Error('db executar nao aceita SELECT. Use "db consultar" pra leitura.');
  }
  if (!confirmar) {
    return { dryRun: true, sql: trimmed };
  }
  return withClient(async (client) => {
    const result = await client.query(trimmed);
    return { dryRun: false, rowCount: result.rowCount };
  });
}
