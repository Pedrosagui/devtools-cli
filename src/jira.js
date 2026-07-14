import { config, requireJiraConfig } from './config.js';
import fs from 'node:fs';
import path from 'node:path';

function authHeader() {
  const token = Buffer.from(`${config.jira.email}:${config.jira.token}`).toString('base64');
  return `Basic ${token}`;
}

async function jiraFetch(endpoint, options = {}) {
  requireJiraConfig();
  const url = `${config.jira.site}/rest/api/3${endpoint}`;
  const headers = {
    Authorization: authHeader(),
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = data?.errorMessages?.join('; ') || data?.message || response.statusText;
    const err = new Error(`Jira ${response.status}: ${message}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toADF(text) {
  const paragraphs = String(text).split(/\n\s*\n/).filter(Boolean);
  return {
    type: 'doc',
    version: 1,
    content: (paragraphs.length ? paragraphs : [text]).map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p }],
    })),
  };
}

export async function whoAmI() {
  return jiraFetch('/myself');
}

export async function projectInfo(projectKey) {
  const project = await jiraFetch(`/project/${projectKey}`);
  const meta = await jiraFetch(`/issue/createmeta/${project.id}/issuetypes`);
  return {
    projectId: project.id,
    projectKey: project.key,
    projectName: project.name,
    issueTypes: meta.issueTypes.map((t) => ({ id: t.id, name: t.name })),
  };
}

export async function searchIssues(jql, fields = 'summary,status,issuetype,priority') {
  const params = new URLSearchParams({ jql, fields, maxResults: '100' });
  const data = await jiraFetch(`/search/jql?${params.toString()}`);
  return (data.issues || []).map((i) => ({
    key: i.key,
    summary: i.fields.summary,
    status: i.fields.status?.name,
    type: i.fields.issuetype?.name,
    priority: i.fields.priority?.name,
  }));
}

export async function getIssue(key) {
  const data = await jiraFetch(`/issue/${key}?fields=summary,description,status,issuetype,priority,assignee`);
  const descBlocks = data.fields.description?.content || [];
  const description = descBlocks
    .flatMap((b) => (b.content || []).map((c) => c.text || ''))
    .join('\n');
  return {
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status?.name,
    type: data.fields.issuetype?.name,
    priority: data.fields.priority?.name,
    assignee: data.fields.assignee?.displayName || null,
    description,
  };
}

async function findPriorityId(name) {
  if (!name) return null;
  const list = await jiraFetch('/priority');
  const match = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`Prioridade "${name}" nao encontrada. Opcoes: ${list.map((p) => p.name).join(', ')}`);
  return match.id;
}

async function findIssueTypeId(name) {
  if (!name) return config.jira.defaultIssueTypeId;
  const data = await jiraFetch(`/issue/createmeta/${config.jira.projectId}/issuetypes`);
  const match = data.issueTypes.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`Tipo de issue "${name}" nao encontrado nesse projeto.`);
  return match.id;
}

export async function createIssue({ tipo, resumo, descricao, prioridade, epico }) {
  if (!config.jira.projectId) throw new Error('JIRA_PROJECT_ID nao configurado no .env');
  const issueTypeId = await findIssueTypeId(tipo);
  const fields = {
    project: { id: config.jira.projectId },
    issuetype: { id: issueTypeId },
    summary: resumo,
  };
  if (descricao) fields.description = toADF(descricao);
  if (prioridade) fields.priority = { id: await findPriorityId(prioridade) };
  if (epico) fields.parent = { key: epico };

  const created = await jiraFetch('/issue', { method: 'POST', body: JSON.stringify({ fields }) });
  return created.key;
}

export async function commentIssue(key, text) {
  await jiraFetch(`/issue/${key}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body: toADF(text) }),
  });
}

export async function transitionIssue(key, transitionName) {
  const data = await jiraFetch(`/issue/${key}/transitions`);
  const match = data.transitions.find((t) => t.name.toLowerCase() === transitionName.toLowerCase());
  if (!match) {
    const options = data.transitions.map((t) => t.name).join(', ');
    throw new Error(`Transicao "${transitionName}" nao disponivel pra ${key}. Opcoes: ${options}`);
  }
  await jiraFetch(`/issue/${key}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: match.id } }),
  });
}

export async function assignIssue(key, accountId) {
  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ fields: { assignee: { accountId } } }),
  });
}

export async function linkEpic(key, epicKey) {
  await jiraFetch(`/issue/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ fields: { parent: { key: epicKey } } }),
  });
}

export async function attachFile(key, filePath) {
  const absolute = path.resolve(filePath);
  const buffer = fs.readFileSync(absolute);
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(absolute));
  await jiraFetch(`/issue/${key}/attachments`, {
    method: 'POST',
    headers: { 'X-Atlassian-Token': 'no-check' },
    body: form,
  });
}

export async function deleteIssue(key) {
  await jiraFetch(`/issue/${key}`, { method: 'DELETE' });
}
