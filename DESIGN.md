# devtools-cli — CLI local para Jira e Postgres (design doc)

Status: **proposta, aguardando aprovação** — nada foi implementado ainda, essa pasta só tem este documento.

## 1. Problema

Hoje, toda ação no Jira (criar card, comentar, mover, anexar print) e toda consulta/limpeza no Postgres local passam por comandos brutos (`curl`, `psql`) montados na hora, com o e-mail, o token do Jira e a senha do Postgres embutidos literalmente no comando. Isso tem dois efeitos ruins:

1. **Prompt de permissão toda hora.** O comando muda a cada chamada (payload JSON diferente, query SQL diferente), então o sistema de permissão do Claude Code (e do Gemini no Antigravity) não consegue reconhecer "isso já foi aprovado antes" — cada `curl`/`psql` novo pede aprovação de novo.
2. **Segredo aparecendo em toda parte.** O token do Jira e a senha do Postgres ficam escritos no comando, e por consequência no histórico/transcript da conversa, toda vez que uma ação é feita.

## 2. Objetivo

Um programinha de linha de comando, rodando localmente na sua máquina, que:

- Guarda as credenciais (token do Jira, senha do Postgres) **uma vez só**, num arquivo local que nunca entra no `git` nem aparece na conversa.
- Expõe um conjunto pequeno e fixo de comandos (`jira criar-card`, `jira comentar`, `jira mover`, `db consultar`, etc.) — o comando em si nunca muda de forma, só os argumentos.
- Porque o comando tem forma fixa, dá pra liberar ele **uma vez** nas configurações de permissão (`Bash(devtools jira *)`, por exemplo) e nunca mais ser interrompido pra aprovar.
- Funciona igual pros dois assistentes (Claude Code e Gemini/Antigravity) — é só um programa de terminal, nenhum dos dois precisa de integração especial.

## 3. Onde mora

```
D:\Estudo\git\devtools-cli\      ← repositório git próprio, separado dos dois apps
├── .env                          ← credenciais reais (NUNCA commitado — no .gitignore)
├── .env.example                  ← modelo do .env, sem valores reais (esse sim vai pro git)
├── .gitignore
├── package.json
├── src/
│   ├── index.js                  ← ponto de entrada do CLI
│   ├── jira.js                   ← comandos de Jira
│   └── db.js                     ← comandos de Postgres
└── README.md                     ← como instalar e usar
```

Fica como um repositório **seu**, versionado separadamente dos repos do BomDBola — faz sentido ser separado porque é uma ferramenta de apoio, não faz parte do produto.

## 4. Stack

**Node.js** puro (já está instalado, já foi usado várias vezes nesta sessão pra scripts). Sem framework pesado — só `dotenv` (ler o `.env`) e o `fetch` nativo do Node pra chamar a API do Jira. Pro Postgres, a lib `pg` (driver oficial). Isso mantém o projeto pequeno, sem build step, roda direto com `node`.

## 5. Comandos propostos (v1)

### Jira
```
devtools jira criar-card --tipo Story --resumo "..." --descricao "..." [--prioridade High] [--epico KAN-150]
devtools jira comentar KAN-150 "texto do comentário"
devtools jira mover KAN-150 "Em andamento"        # transiciona por nome da coluna
devtools jira atribuir KAN-150 --eu               # te atribui o card
devtools jira anexar KAN-150 caminho/print.png
devtools jira buscar "project=KAN AND status != Concluído"
devtools jira ver KAN-150                          # mostra resumo + descrição + status
```

### Postgres (banco de dev local)
```
devtools db consultar "SELECT id, title FROM weekly_matches LIMIT 5"
devtools db executar "DELETE FROM weekly_matches WHERE id='...'" --confirmar
```

Note que `db executar` (qualquer coisa que não seja `SELECT`) **exige** a flag `--confirmar` — sem ela, o comando só mostra o que faria e não executa. Isso evita um `DELETE` acidental disparado por engano.

O alvo do Postgres fica **fixo** no `.env` (só o banco `bomdbola-dev` local) — o CLI não aceita apontar pra outro host/banco, pra reduzir o raio de estrago possível.

## 6. Onde ficam as credenciais

Arquivo `.env` na raiz do `devtools-cli`, no formato:

```
JIRA_SITE=https://quentindevs.atlassian.net
JIRA_EMAIL=baldo.gui2211@gmail.com
JIRA_TOKEN=ATATT3xFfGF0...
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=bomdbola-dev
PG_USER=postgres
PG_PASSWORD=postgres
```

Esse arquivo entra no `.gitignore` desde o primeiro commit — nunca vai pro GitHub. Um `.env.example` (sem valores reais, só os nomes das variáveis) fica versionado, pra você lembrar o que precisa preencher se reinstalar em outra máquina.

**Importante:** o token do Jira que você colou no chat mais cedo nesta sessão deveria ser rotacionado (id.atlassian.com → API tokens → revogar e gerar um novo) antes de colocá-lo nesse `.env`, já que ele ficou exposto na conversa. Isso não muda com essa ferramenta — só reforçando.

## 7. Como isso reduz os pedidos de permissão

Hoje, a regra de permissão do Claude Code precisaria ser algo tão amplo quanto `Bash(curl *)` pra parar de perguntar — o que é perigoso, porque libera `curl` pra qualquer coisa, não só Jira.

Com o CLI, a regra fica **estreita e segura**: `Bash(node devtools-cli/src/index.js *)` (ou um atalho tipo `Bash(devtools *)` se você instalar como comando global). Como o programa só sabe fazer as ações específicas que ele implementa (criar card, comentar, consultar o banco de dev), liberar esse prefixo de comando é seguro mesmo sendo amplo — o programa em si é a trava, não a permissão do terminal.

## 8. Registro de auditoria

Toda chamada ao CLI grava uma linha num arquivo `devtools-cli/audit.log` (também no `.gitignore` — tem dado operacional, não precisa ir pro git): timestamp, comando, argumentos (sem o token/senha), sucesso ou erro. Como dois agentes diferentes (Claude e Gemini) vão usar a mesma ferramenta sem te perguntar toda vez, esse log é o jeito de você conseguir auditar depois "o que foi feito, quando, por qual comando" se precisar.

## 9. Riscos e o que fica de fora da v1

- **Não implementa `delete` de card no Jira.** Exclusão de issue é irreversível e rara — fica de fora, se precisar excluir algo continua sendo uma ação manual sua no Jira.
- **`db executar` é poderoso** (roda qualquer SQL não-SELECT no banco de dev) — a flag `--confirmar` obrigatória é a única trava. Não tem transação automática nem rollback — se rodar um DELETE errado, é na hora.
- **Compartilhado entre os dois agentes.** Como o Gemini também vai poder chamar esse CLI, as duas IAs passam a ter o mesmo nível de acesso a Jira e ao banco de dev. Isso é basicamente o que já acontece hoje (cada uma já tem acesso via `curl`/`psql`), só que agora fica registrado num log único.
- **Sem suporte a múltiplos projetos Jira/bancos ainda.** Fixo no BomDBola pra v1. Se fizer sentido reusar pro projeto "tocae" também, dá pra generalizar depois (múltiplos perfis no `.env`, tipo `.env.tocae`).

## 10. Próximos passos (se aprovar)

1. Você revisa este documento e ajusta o que quiser (nome dos comandos, se quer incluir mais operações, etc.)
2. Eu crio o repositório git em `D:\Estudo\git\devtools-cli`, com `.gitignore` já cobrindo `.env` e `audit.log` desde o primeiro commit
3. Implemento os comandos de Jira primeiro (é o que gera mais atrito hoje), depois os de Postgres
4. Você roda `git init` + primeiro commit (ou eu faço, se preferir) — mas o `.env` com as credenciais reais nunca é commitado, fica só local
5. Você rotaciona o token do Jira exposto antes de colocá-lo no `.env`
6. Adiciono a regra de permissão (`Bash(node devtools-cli/src/index.js *)`) no `.claude/settings.local.json` do projeto
7. Te mostro como configurar o mesmo CLI no Gemini/Antigravity (é só apontar o terminal dele pra mesma pasta)
