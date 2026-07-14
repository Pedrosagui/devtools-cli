import readline from 'node:readline';
import { config, setSkipConfirm } from './config.js';

// So oferece prompt interativo quando tem um terminal de verdade dos dois lados -
// um agente rodando o comando via pipe/subprocess nao tem TTY, entao cai direto
// pro fallback seguro (exigir --confirmar explicito), sem travar esperando input
// que nunca vai chegar.
export function canPromptInteractively() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

// Retorna 'sim', 'nao' ou 'sempre'. "sempre" quer dizer: confirma esta e para de
// perguntar dai pra frente (quem chama e responsavel por persistir isso).
export function askConfirmation(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (s = so essa vez / N = nao / sempre = nao perguntar mais): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      if (['sempre', 'always'].includes(normalized)) return resolve('sempre');
      if (['s', 'sim', 'y', 'yes'].includes(normalized)) return resolve('sim');
      resolve('nao');
    });
  });
}

// Junta as tres fontes possiveis de confirmacao numa so decisao:
// 1) preferencia persistida (SKIP_CONFIRM=true no .env) -> confirma sem perguntar
// 2) --confirmar na chamada -> confirma
// 3) terminal interativo sem os dois acima -> pergunta na hora (e pode persistir "sempre")
// 4) nenhum dos tres -> nao confirma (modo seguro pra uso via agente/script)
export async function resolveConfirmation({ hasConfirmFlag, question }) {
  if (config.skipConfirm) return true;
  if (hasConfirmFlag) return true;
  if (!canPromptInteractively()) return false;

  const answer = await askConfirmation(question);
  if (answer === 'sempre') {
    setSkipConfirm(true);
    console.log('Ok - daqui pra frente esse tipo de acao nao vai mais perguntar. Pra voltar a perguntar, rode: devtools config confirmar-sempre off');
    return true;
  }
  return answer === 'sim';
}
