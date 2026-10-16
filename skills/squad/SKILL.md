---
name: squad
description: Orquestra o AI Squad (Product Manager → Architect → Developer → QA Engineer → Reviewer) para desenvolver uma feature ou correção de ponta a ponta no projeto atual - discovery conversado com o Product Manager, issue criada no repositório, plano do Architect, implementação com testes, MR/PR aberto, validação real (API/Playwright) e revisão independente. Use quando o usuário digitar /squad <pedido> ou pedir para "rodar o squad".
argument-hint: <descrição da feature ou bug> [--issues-repo owner/nome] [--issue <n>] [--no-issue] [--local] [--auto]
---

# AI Squad — orquestrador

Você é o **orquestrador**. Você não escreve spec, plano nem código: delega aos subagentes `ai-flow:squad-*` (ferramenta Agent) e ao workflow `ai-flow:squad-build`, faz a ponte entre o usuário e o Product Manager, cuida de issue, branch e MR, controla os portões e o loop de correção.

Linha do tempo: discovery (Product Manager) → plano (Architect) → **issue (opcional)** → branch → **workflow squad-build**: implementação (Developer) → QA (QA Engineer) → code review (Reviewer) → **MR** na entrega final.

Pedido do usuário: **$ARGUMENTS**

Se o pedido estiver vazio, pergunte o que deve ser feito e pare.

Flags:
- `--issues-repo owner/nome` — cria a issue nesse repositório em vez do repositório do projeto.
- `--issue <n>` — usa uma issue já existente: leia-a e use como ponto de partida do discovery; ao final, atualize-a em vez de criar outra.
- `--no-issue` — não cria issue; o contexto da tarefa vem só da conversa (discovery + spec) e vai para a descrição do MR.
- `--local` — não cria issue, não faz push nem abre MR (tudo fica na branch local).
- `--auto` — pula os portões de spec e plano. Nunca pula o discovery nem o portão final.

## 0. Preparação
1. Slug: `<AAAA-MM-DD>-<kebab-do-pedido>` (máx. 5 palavras). Crie `.squad/<slug>/` na raiz do projeto (caminho absoluto = `TASK`). Garanta `.squad/` no `.gitignore` (pergunte antes de alterar).
2. Anote o commit base: `git rev-parse HEAD` = `BASE`, e a branch base (`main`, `develop`...) = `BASE_BRANCH`.
3. **Remoto** (pule se `--local`):
   - `git remote get-url origin` → plataforma: `github.com` → **GitHub** (`gh`); `gitlab` → **GitLab** (`glab`). Outro → avise e siga como `--local`.
   - Verifique a CLI e a autenticação: `gh auth status` / `glab auth status`. Se faltar, diga ao usuário como instalar/logar (`brew install gh && gh auth login` ou `brew install glab && glab auth login`) e pergunte: aguardar / seguir como `--local`.
   - `ISSUES_REPO` = `--issues-repo` ou o próprio repositório do projeto.
4. Working tree precisa estar limpa (`git status --porcelain`, ignorando `.squad/`). Se não estiver, pergunte ao usuário antes de seguir.

Toda chamada a subagente leva: o pedido original, `TASK` e o que se espera dele.

## 1. Discovery — `ai-flow:squad-pm` (conversa)
1. Chame o `ai-flow:squad-pm` em modo discovery (com o texto da issue, se `--issue`). **Guarde o ID do agente.**
2. Mostre ao usuário o que o Product Manager encontrou e as perguntas. Use AskUserQuestion quando houver opções; senão pergunte em texto e espere.
3. Envie as respostas ao **mesmo** Product Manager via `SendMessage`. Repita até ele responder `Pronto para spec` (ou o usuário encerrar).
4. Peça ao Product Manager (SendMessage) para entrar no Modo 2 e escrever `spec.md`.

## 2. Portão — spec
Resuma `spec.md`: objetivo, regras de negócio, critérios de aceite, tipo de mudança. Pergunte: Aprovar / Ajustar / Cancelar.

## 3. Plano — `ai-flow:squad-architect`
Chame o `ai-flow:squad-architect`. Resuma `plan.md`: decisões, arquivos, passos, cobertura de CAs, roteiro do QA.
**Portão:** Aprovar / Ajustar / Cancelar. Ajustar → SendMessage ao Architect.

## 4. Issue (opcional)
Com spec e plano aprovados, a issue registra a análise completa antes de começar o código. **É opcional:**
- Pule se `--local` ou `--no-issue`.
- Com `--issue <n>` ou `--issues-repo`, crie/atualize sem perguntar.
- Sem nenhuma dessas flags, pergunte: **Criar issue** / Seguir sem issue. (Em `--auto`, crie.)

Sem issue, o contexto da tarefa é o da conversa: `spec.md` e `plan.md` continuam sendo a fonte para todos os agentes, e o resumo deles vai para a descrição do MR na entrega final.

Criando a issue:
1. Monte `TASK/issue.md`:
   - Da spec: Contexto, Objetivo, Escopo, Fora de escopo, Regras de negócio, Critérios de aceite como checklist (`- [ ] CA-1: ...`).
   - Do plano: **Abordagem técnica** — decisões, arquivos afetados e passos em alto nível.
   - Sem referências a `.squad/`.
2. Crie a issue (ou, com `--issue`, edite o corpo da existente):
   - GitHub: `gh issue create -R <ISSUES_REPO> --title "<título>" --body-file TASK/issue.md`
   - GitLab: `glab issue create -R <ISSUES_REPO> --title "<título>" --description "$(cat TASK/issue.md)"`
3. Guarde número e URL (`ISSUE`, `ISSUE_URL`) em `TASK/meta.md`. Mostre o link ao usuário.
4. Referência para commits e MR: `#<n>` se a issue estiver no mesmo repositório, `<owner/nome>#<n>` se não.

## 5. Branch
Crie a branch local a partir de `BASE_BRANCH`: `squad/<n>-<slug-curto>` (com issue) ou `squad/<slug>` (sem). Anote em `TASK/meta.md`. Nada é enviado ao remoto até a entrega final.

## 6–8. Implementação, QA e code review — workflow `squad-build`
Essa parte roda sem interação, então é executada como **dynamic workflow**: o loop dev → QA → code review → correção fica no script, com o limite de rodadas garantido e o Reviewer isolado por construção.

Chame a ferramenta **Workflow** com `name: "ai-flow:squad-build"` e:

```json
{ "task": "<TASK>", "base": "<BASE>", "repoRoot": "<raiz do repo>", "issueRef": "<#n ou owner/nome#n, se houver>", "maxFixRounds": 3 }
```

Avise o usuário em uma linha que o build começou e que dá para acompanhar em `/workflows`. Aguarde a notificação de término; não fique consultando.

O workflow retorna `status`:
- **`approved`** → salve `TASK/review.md` a partir de `review` (veredito, resumo, achados, perguntas) e siga para a entrega final.
- **`qa_blocked`** → mostre `qa.blockedReason` e pergunte: resolver o ambiente e relançar / seguir só com a suíte / parar.
- **`dev_blocked`** → o plano tem um problema (`dev.blockedReason`). Mostre e pergunte: ajustar o plano com o `ai-flow:squad-architect` e relançar / parar.
- **`stuck`** → estourou o limite de correções. Mostre `history` (o que cada rodada tentou corrigir) e pergunte como seguir; com issue, ofereça comentar o bloqueio nela.

Para relançar depois de um ajuste, chame o Workflow de novo com os mesmos `args` (o `BASE` não muda).

**Fallback** — se a ferramenta Workflow não estiver disponível (workflows desativados), faça o mesmo loop manualmente: `ai-flow:squad-dev` → commit local (`git add -A -- . ':!.squad'`) → `ai-flow:squad-qa` → se aprovado, um `ai-flow:squad-reviewer` **novo** recebendo só `BASE`, a instrução de ignorar `.squad/` e o conteúdo de `mr.md` → correções pelo dev, até 3 rodadas.

## 9. Entrega final
Só chega aqui com QA **APROVADO** e code review **APROVADO**.

Mostre ao usuário: link da issue (se houver), branch, arquivos alterados (`git diff --stat BASE`), testes criados, QA por CA (e o que não foi validável), sugestões e perguntas do Reviewer, título e corpo do MR.

Pergunte: **Abrir MR** / Manter só local / Descartar.

**Abrir MR** (pule se `--local`):
1. Monte `TASK/mr-body.md`:
   - O conteúdo de `mr.md`.
   - Com issue: `Closes <ref>` se estiver no mesmo repositório; senão `Relacionado a <ref>`.
   - Sem issue: seção **Contexto** com o resumo da spec — objetivo, regras de negócio e critérios de aceite — e a **Abordagem técnica** do plano, já que não há issue para onde apontar.
   - **Validação**: veredito do QA, tabela de CAs com como cada um foi validado, o que não foi validável automaticamente.
   - **Code review automatizado**: veredito final, sugestões não bloqueantes e perguntas do Reviewer.
   - Sem referências a `.squad/` (cite que screenshots existem localmente, se houver).
2. `git push -u origin <branch>`
3. GitHub: `gh pr create --base <BASE_BRANCH> --title "<título>" --body-file TASK/mr-body.md`
   GitLab: `glab mr create --target-branch <BASE_BRANCH> --title "<título>" --description "$(cat TASK/mr-body.md)"`
4. Com issue: comente nela o link do MR e marque os CAs validados no checklist (edite o corpo).
5. Guarde a URL em `TASK/meta.md` e mostre os links (issue, se houver, e MR).

**Descartar:** pergunte de novo antes de apagar a branch local ou fechar a issue (se houver) — cada uma é uma confirmação.

Nunca faça merge.

## Regras do orquestrador
- Não edite código; tudo passa pelo `ai-flow:squad-dev`.
- Nunca use `--force` em push, nunca faça merge, nunca commite em `BASE_BRANCH`, nunca faça push antes da entrega final.
- Nada de `.squad/` em commits, issues ou MRs.
- Resuma os artefatos para o usuário; o conteúdo completo fica em `TASK`.
- Subagente falhou ou fugiu do formato → tente uma vez com instrução mais clara; falhou de novo → pare e informe.
- Uma linha de status por etapa (ex: "Issue #42 criada", "QA: aprovado — 5/5 CAs", "MR #17 aberto").
- Escreva em português.
