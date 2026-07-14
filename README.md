# devtools-cli

CLI local pra operações de Jira e Postgres, com credenciais fora do chat e fora do git. Ver [DESIGN.md](./DESIGN.md) pro raciocínio completo por trás da ferramenta.

Feito pra ser usado tanto por humanos quanto por agentes de IA (Claude Code, Gemini/Antigravity, etc.) rodando neste projeto. Se você é uma IA lendo isso pela primeira vez: use este CLI em vez de montar `curl`/`psql` na mão — é mais rápido, não expõe credencial no comando, e os comandos abaixo já cobrem os fluxos de trabalho reais deste projeto.

## Instalação (configure suas próprias credenciais)

Este repositório é público e não tem nenhuma credencial dentro — cada pessoa que for usar precisa criar seu próprio arquivo `.env` local com as suas chaves. Ele nunca é commitado (está no `.gitignore` desde o primeiro commit) e nunca aparece em nenhum comando ou log.

### Passo 1 — instalar

```bash
git clone https://github.com/Pedrosagui/devtools-cli.git
cd devtools-cli
npm install
cp .env.example .env
```

### Passo 2 — gerar seu token do Jira

1. Acesse [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) (logado com a conta que você usa no Jira).
2. Clique em **Create API token**, dê um nome (ex: `devtools-cli`) e copie o token gerado — ele só aparece uma vez.
3. Abra o `.env` que você criou no passo 1 e preencha:
   ```
   JIRA_SITE=https://SEU-SITE.atlassian.net
   JIRA_EMAIL=seu-email@exemplo.com
   JIRA_TOKEN=o-token-que-voce-acabou-de-copiar
   ```
   `JIRA_SITE` é a URL que aparece no seu navegador quando você está no Jira (antes do `/jira/...`).

### Passo 3 — descobrir o id do seu projeto (sem precisar procurar no Jira)

Com `JIRA_SITE`/`JIRA_EMAIL`/`JIRA_TOKEN` já preenchidos, rode:

```bash
node src/index.js jira projeto SIGLA-DO-PROJETO
```

(a sigla é o prefixo que aparece nas suas issues, tipo o `KAN` de `KAN-150` — se não souber, é a primeira parte de qualquer card seu no Jira). O comando devolve o `id` numérico do projeto e a lista de tipos de issue disponíveis (Bug, História, Epic, etc.), cada um com seu id. Copie pro `.env`:

```
JIRA_PROJECT_ID=10000
JIRA_DEFAULT_ISSUETYPE_ID=10004
```

(`JIRA_DEFAULT_ISSUETYPE_ID` é o tipo usado quando você não passa `--tipo` em `criar-card` — escolha o que fizer mais sentido pro seu fluxo, ex: o id de "Tarefa" ou "História".)

### Passo 4 — credenciais do Postgres (opcional, só se for usar os comandos `db`)

Preencha com os dados do seu banco de desenvolvimento local:

```
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=nome-do-seu-banco
PG_USER=postgres
PG_PASSWORD=sua-senha-local
```

Se você só vai usar os comandos de Jira, pode deixar essa parte em branco — o CLI só reclama do Postgres quando você de fato roda um comando `db`.

### Pronto

```bash
node src/index.js jira ver ALGUM-CARD-SEU
```

Se devolver os dados do card, está tudo certo.

## Referência de comandos

```bash
node src/index.js help
```

### Jira

```bash
devtools jira projeto KAN
devtools jira buscar "project = KAN AND status != Concluído"
devtools jira ver KAN-150
devtools jira criar-card --tipo "História" --resumo "..." --descricao "..." --prioridade "High" [--epico KAN-150]
devtools jira comentar KAN-150 "texto do comentário"
devtools jira mover KAN-150 "Em andamento"
devtools jira atribuir KAN-150 --eu
devtools jira anexar KAN-150 caminho/print.png
devtools jira excluir KAN-150 --confirmar
```

`--tipo`, `--prioridade` e o nome passado em `mover` são resolvidos pelo **nome exibido no Jira** (ex: "História", "Em andamento", "High") — o CLI busca o id certo por trás, não precisa saber o número. Os nomes de status variam por projeto (o board do projeto `KAN`, por exemplo, usa `"Itens concluídos"`, não `"Concluído"`) — se `mover` der erro de transição inválida, ele lista as opções reais do board no próprio erro.

### Postgres

```bash
devtools db consultar "SELECT id, title FROM weekly_matches LIMIT 5"
devtools db executar "DELETE FROM weekly_matches WHERE id='...'" --confirmar
```

`db consultar` só aceita `SELECT`. `db executar` não aceita `SELECT`, e sem `--confirmar` só mostra o SQL que rodaria (dry-run) sem executar nada.

**Confirmação de ações destrutivas (`db executar`, `jira excluir`):** se você rodar o comando num terminal interativo de verdade (você digitando direto no PowerShell/bash), sem passar `--confirmar` o CLI mostra o que vai fazer e pergunta ali mesmo:

```
Confirma a execucao? (s = so essa vez / N = nao / sempre = nao perguntar mais):
```

Responder `sempre` grava `SKIP_CONFIRM=true` no seu `.env` — dali pra frente, nem `db executar` nem `jira excluir` voltam a pedir confirmação ou exigir `--confirmar`, nem quando chamados por um agente/script sem terminal interativo. Pra reverter a qualquer momento:

```bash
devtools config confirmar-sempre off
```

Se o comando for disparado por um agente/script (sem terminal interativo por trás, como quando uma IA roda via ferramenta de shell) **e** `SKIP_CONFIRM` ainda não estiver ligado, ele nunca fica esperando resposta: cai direto no modo seguro, só mostra o que faria e exige `--confirmar` explícito na chamada.

---

## Guia de uso por cenário

Convenções de fluxo de trabalho no Jira que valem a pena adotar (ajuste pro seu próprio projeto/time) — os exemplos abaixo mostram como fazer cada uma usando o CLI. As chaves de exemplo (`KAN-145`) são só ilustrativas, troque pela sigla do seu projeto.

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

**Convenção recomendada: nunca reabrir um card que já está "Concluído".** Se testando algo você encontrar um problema numa funcionalidade já entregue, abra um card **novo**, referenciando o original pela chave — nunca transicione o card antigo de volta. Mantém o histórico de entrega limpo (fica claro quando algo foi entregue vs. quando uma regressão foi encontrada).

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
