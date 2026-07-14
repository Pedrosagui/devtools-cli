# devtools-cli

CLI local pra operações de Jira e Postgres, com credenciais fora do chat e fora do git. Ver [DESIGN.md](./DESIGN.md) pro raciocínio completo por trás da ferramenta.

Feito pra ser usado tanto por humanos quanto por agentes de IA (Claude Code, Gemini/Antigravity, etc.) rodando neste projeto. Se você é uma IA lendo isso pela primeira vez: use este CLI em vez de montar `curl`/`psql` na mão — é mais rápido, não expõe credencial no comando, e os comandos abaixo já cobrem os fluxos de trabalho reais deste projeto.

## Instalação

```bash
cd devtools-cli
npm install
cp .env.example .env
```

Preencha o `.env` com:
- `JIRA_SITE`, `JIRA_EMAIL`, `JIRA_TOKEN` — token gerado em [id.atlassian.com](https://id.atlassian.com/manage-profile/security/api-tokens)
- `JIRA_PROJECT_ID`, `JIRA_DEFAULT_ISSUETYPE_ID` — descubra rodando `devtools jira ver <QUALQUER-CARD>` uma vez com um projeto conhecido, ou consulte no Jira
- `PG_*` — credenciais do Postgres local de desenvolvimento

O `.env` nunca é commitado (está no `.gitignore` desde o primeiro commit).

## Referência de comandos

```bash
node src/index.js help
```

### Jira

```bash
devtools jira buscar "project = KAN AND status != Concluído"
devtools jira ver KAN-150
devtools jira criar-card --tipo "História" --resumo "..." --descricao "..." --prioridade "High" [--epico KAN-150]
devtools jira comentar KAN-150 "texto do comentário"
devtools jira mover KAN-150 "Em andamento"
devtools jira atribuir KAN-150 --eu
devtools jira anexar KAN-150 caminho/print.png
devtools jira excluir KAN-150 --confirmar
```

`--tipo`, `--prioridade` e o nome passado em `mover` são resolvidos pelo **nome exibido no Jira** (ex: "História", "Em andamento", "High") — o CLI busca o id certo por trás, não precisa saber o número.

### Postgres

```bash
devtools db consultar "SELECT id, title FROM weekly_matches LIMIT 5"
devtools db executar "DELETE FROM weekly_matches WHERE id='...'" --confirmar
```

`db consultar` só aceita `SELECT`. `db executar` não aceita `SELECT`, e sem `--confirmar` só mostra o SQL que rodaria (dry-run) sem executar nada.

---

## Guia de uso por cenário

Este projeto (BomDBola) segue algumas convenções de fluxo de trabalho no Jira. Os exemplos abaixo mostram como fazer cada uma usando o CLI.

### 1. Pegar um card pra trabalhar

Antes de começar a implementar, mova o card pra "Em andamento" e se atribua:

```bash
devtools jira mover KAN-145 "Em andamento"
devtools jira atribuir KAN-145 --eu
```

### 2. Fechar um card com evidência

O padrão aqui é: nunca marcar "Concluído" sem anexar prova (print de teste, resultado de query, etc.) e um comentário explicando o que foi verificado.

```bash
devtools jira anexar KAN-145 D:\caminho\para\print-do-teste.png
devtools jira comentar KAN-145 "Testado via Playwright: formulário valida e submete corretamente. Confirmado no Postgres que o registro foi criado com os campos certos."
devtools jira mover KAN-145 "Concluído"
```

Se o card não pôde ser validado de ponta a ponta (ex: depende de um endpoint que o back ainda não entregou), **não feche** — deixe em "Em andamento" ou "Test" e explique o bloqueio no comentário.

### 3. Achar um bug em um card que já foi entregue

**Regra importante deste projeto: nunca reabrir um card que já está "Concluído".** Se testando algo você encontrar um problema numa funcionalidade já entregue, abra um card **novo**, referenciando o original pela chave — nunca transicione o card antigo de volta.

```bash
devtools jira criar-card --tipo "História" \
  --resumo "Bug: GET /api/matches retorna 500 com attendance (regressão de KAN-101, já entregue)" \
  --descricao "Referência: KAN-101, já Concluído. Abrindo card novo em vez de reabrir. [...descreva o bug e como reproduzir...]" \
  --prioridade "Highest"
```

Isso vale tanto pra bugs pequenos quanto críticos — só mude `--prioridade` (`Highest`, `High`, `Medium`, `Low`, `Lowest`).

### 4. Investigar um problema antes de decidir a causa

Antes de reportar um bug de dado (ex: "essa lista não carrega"), confirme direto no banco se é problema de dado ou de código:

```bash
devtools db consultar "SELECT id, title, days_of_week FROM recurring_groups WHERE id = '...'"
```

### 5. Limpar dado de teste depois de validar um fluxo

Sempre que você cria dado de teste (partida, grupo, usuário fantasma) só pra provar que um fluxo funciona, limpe depois pra não poluir o banco compartilhado:

```bash
devtools db executar "DELETE FROM match_attendances WHERE match_id = '...'" --confirmar
devtools db executar "DELETE FROM weekly_matches WHERE id = '...'" --confirmar
```

Rode primeiro **sem** `--confirmar` pra conferir o SQL antes de executar de verdade.

### 6. Abrir um épico ou card de arquitetura pra discussão (sem implementar)

Quando um problema é grande demais pra resolver na hora (ex: repensar um modelo de dados), abra o card documentando o problema e o impacto, mas não comece a implementar sem alinhar:

```bash
devtools jira criar-card --tipo "Epic" \
  --resumo "Repensar modelagem X" \
  --descricao "[...contexto, impacto, por que não estou implementando agora...]" \
  --prioridade "High"
```

### 7. Consultar o estado de um card antes de continuar um trabalho

Sempre que retomar um card entre sessões, confira o estado atual antes de assumir onde parou:

```bash
devtools jira ver KAN-145
```

---

## Auditoria

Toda chamada grava uma linha em `audit.log` (timestamp, comando, argumentos, resultado — nunca segredos). Esse arquivo também não é commitado. Se dois agentes (ou um agente e um humano) estiverem usando o CLI no mesmo projeto, esse log é o jeito de reconstruir "o que foi feito, quando, por qual comando".

## Liberar sem prompt de permissão (Claude Code)

Em `.claude/settings.local.json` do projeto onde for usar:

```json
{
  "permissions": {
    "allow": ["Bash(node * devtools-cli/src/index.js *)"]
  }
}
```

Se o projeto já usa Auto Mode (classificador de risco por cima da allowlist), comandos com `--confirmar` (exclusão de card, execução de SQL destrutivo) ainda podem pedir confirmação — isso é esperado e desejado, é exatamente a ação mais arriscada do CLI.

## Reduzindo o raio de estrago

- `db executar` exige `--confirmar` explícito pra qualquer coisa que não seja leitura.
- `db *` só fala com o banco configurado no `.env` — não aceita apontar pra outro host.
- `jira excluir` também exige `--confirmar` — é a única ação irreversível do CLI de Jira.
- Nenhum comando aceita segredo como argumento — tudo vem do `.env`, então nada sensível aparece no histórico de comandos ou no `audit.log`.
