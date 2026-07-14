#!/usr/bin/env node
import { parseArgs } from './args.js';
import { logAction } from './audit.js';
import { canPromptInteractively, askYesNo } from './confirm.js';
import * as jira from './jira.js';
import * as db from './db.js';

const HELP = `devtools - CLI local para Jira e Postgres

Uso: devtools <grupo> <comando> [args] [--flags]

Jira:
  jira projeto <CHAVE-DO-PROJETO>   (ex: KAN) - descobre o id do projeto e os tipos de issue, pra preencher o .env
  jira buscar "<jql>"
  jira ver <KEY>
  jira criar-card --tipo <Tipo> --resumo "<texto>" [--descricao "<texto>"] [--prioridade <Nome>] [--epico <KEY>]
  jira comentar <KEY> "<texto>"
  jira mover <KEY> "<nome da coluna>"
  jira atribuir <KEY> --eu
  jira anexar <KEY> <caminho-do-arquivo>
  jira excluir <KEY> --confirmar

Postgres (banco de dev configurado no .env):
  db consultar "<SELECT ...>"
  db executar "<SQL>" --confirmar   (sem --confirmar so mostra o que faria)

Acoes destrutivas (excluir card, db executar) pedem --confirmar. Rodando num
terminal interativo de verdade, sem --confirmar o CLI pergunta na hora (s/N)
em vez de exigir que voce ja saiba de antemao. Rodando via agente/script (sem
TTY), sempre cai no modo seguro: só mostra o que faria e exige --confirmar
explicito na proxima chamada.

Exemplos:
  devtools jira mover KAN-150 "Em andamento"
  devtools jira comentar KAN-150 "testado via playwright, evidencia anexada"
  devtools db consultar "SELECT id, title FROM weekly_matches ORDER BY starts_at DESC LIMIT 5"
`;

function printAndAudit(command, args, result) {
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
  logAction(command, args, 'ok');
}

async function main() {
  const [group, command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  const fullCommand = [group, command].filter(Boolean).join(' ');

  if (!group || flags.help || group === 'help') {
    console.log(HELP);
    return;
  }

  try {
    if (group === 'jira') {
      if (command === 'projeto') {
        const info = await jira.projectInfo(positional[0]);
        printAndAudit(fullCommand, positional, info);
      } else if (command === 'buscar') {
        const issues = await jira.searchIssues(positional[0]);
        printAndAudit(fullCommand, positional, issues);
      } else if (command === 'ver') {
        const issue = await jira.getIssue(positional[0]);
        printAndAudit(fullCommand, positional, issue);
      } else if (command === 'criar-card') {
        const key = await jira.createIssue({
          tipo: flags.tipo,
          resumo: flags.resumo,
          descricao: flags.descricao,
          prioridade: flags.prioridade,
          epico: flags.epico,
        });
        printAndAudit(fullCommand, flags, `Criado: ${key}`);
      } else if (command === 'comentar') {
        await jira.commentIssue(positional[0], positional[1]);
        printAndAudit(fullCommand, positional, `Comentario adicionado em ${positional[0]}`);
      } else if (command === 'mover') {
        await jira.transitionIssue(positional[0], positional[1]);
        printAndAudit(fullCommand, positional, `${positional[0]} movido para "${positional[1]}"`);
      } else if (command === 'atribuir') {
        const accountId = flags.eu ? (await jira.whoAmI()).accountId : flags.conta;
        if (!accountId) throw new Error('Use --eu ou --conta <accountId>');
        await jira.assignIssue(positional[0], accountId);
        printAndAudit(fullCommand, positional, `${positional[0]} atribuido`);
      } else if (command === 'anexar') {
        await jira.attachFile(positional[0], positional[1]);
        printAndAudit(fullCommand, positional, `Anexo enviado pra ${positional[0]}`);
      } else if (command === 'excluir') {
        let proceed = !!flags.confirmar;
        if (!proceed && canPromptInteractively()) {
          proceed = await askYesNo(`Isso vai excluir ${positional[0]} permanentemente. Confirma?`);
        }
        if (!proceed) {
          console.log(`Isso vai excluir ${positional[0]} permanentemente. Rode de novo com --confirmar pra seguir.`);
          return;
        }
        await jira.deleteIssue(positional[0]);
        printAndAudit(fullCommand, positional, `${positional[0]} excluido`);
      } else {
        console.log(HELP);
      }
    } else if (group === 'db') {
      if (command === 'consultar') {
        const result = await db.runQuery(positional[0]);
        printAndAudit(fullCommand, positional, result);
      } else if (command === 'executar') {
        let proceed = !!flags.confirmar;
        if (!proceed && canPromptInteractively()) {
          console.log(`SQL a executar: ${positional[0]}`);
          proceed = await askYesNo('Confirma a execucao?');
        }
        const result = await db.runExec(positional[0], proceed);
        if (result.dryRun) {
          console.log(`(dry-run, nada foi executado) SQL: ${result.sql}\nAdicione --confirmar pra executar de verdade (ou rode num terminal interativo pra confirmar na hora).`);
        } else {
          printAndAudit(fullCommand, positional, result);
        }
      } else {
        console.log(HELP);
      }
    } else {
      console.log(HELP);
    }
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    logAction(fullCommand, { ...flags, positional }, `erro: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
