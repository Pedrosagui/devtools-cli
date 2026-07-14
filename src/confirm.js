import readline from 'node:readline';

// So oferece prompt interativo quando tem um terminal de verdade dos dois lados -
// um agente rodando o comando via pipe/subprocess nao tem TTY, entao cai direto
// pro fallback seguro (exigir --confirmar explicito), sem travar esperando input
// que nunca vai chegar.
export function canPromptInteractively() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (s/N): `, (answer) => {
      rl.close();
      resolve(['s', 'sim', 'y', 'yes'].includes(answer.trim().toLowerCase()));
    });
  });
}
