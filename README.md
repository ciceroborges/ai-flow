# AI Flow

Fluxo agêntico de desenvolvimento para o Claude Code: um squad de subagentes que leva um pedido do discovery ao MR aberto, em qualquer projeto.

```
/squad <pedido>
   │
   ├─ squad-pm  ⇄ você   discovery em conversa → spec.md        ── Portão: spec
   ├─ squad-architect                 plano executável → plan.md             ── Portão: plano
   ├─ 📌 Issue (opcional) no repositório (spec + abordagem técnica)
   ├─ branch squad/<issue>-<slug> ou squad/<slug>
   ├─ squad-dev                 TDD → código + testes + mr.md (commits locais)
   ├─ squad-qa               suíte + API (curl) + front (Playwright) → qa-report.md
   ├─ squad-reviewer                  code review cético, só código + descrição do MR → review.md
   │     └─ reprovou? volta ao developer (máx. 3 rodadas)
   └─ 🚀 Entrega final: push + MR aberto (Closes #issue ou contexto da spec, validação e review no corpo)
```

Os artefatos de cada tarefa ficam em `.squad/<data>-<slug>/` no projeto (ignorado pelo git).

## Agentes, modelos e esforço

A ideia é concentrar o raciocínio caro onde as decisões são tomadas e deixar a execução rápida e barata.

| Agente | Papel | Modelo | Esforço | Por quê |
|---|---|---|---|---|
| `squad-pm` | Product Manager | opus | high | Discovery exige entender regras de negócio, o que já existe na app e fazer as perguntas certas. |
| `squad-architect` | Architect | opus | xhigh | É onde o pensamento pesado acontece: o plano sai com arquivos, assinaturas e testes por passo, para o Developer não decidir nada. |
| `squad-dev` | Developer | sonnet | medium | Executa um plano já mapeado, em TDD. Precisa ser preciso, não criativo. |
| `squad-qa` | QA Engineer | sonnet | high | Execução procedural (subir app, curl, Playwright), com persistência para lidar com ambiente e casos de borda. |
| `squad-reviewer` | Reviewer | opus | high | Faz o code review cético e independente: achar bug sutil e falha de segurança sem contexto pede o modelo mais forte. |
| Orquestrador (`/squad`) | — | sessão atual | — | Faz a ponte com você, cuida de issue/branch/MR e controla os portões; Sonnet já basta. |

Ajuste no frontmatter (`model`, `effort`) de cada arquivo em `agents/`.

## Como cada etapa funciona

- **Discovery (Product Manager):** investiga o código (o que existe, o que falta, regras de negócio, impactos) e devolve perguntas com opções e recomendação. O orquestrador te repassa, devolve suas respostas ao mesmo agente e repete até não sobrar dúvida que mude o escopo.
- **Plano (Architect):** passos pequenos, cada um com os testes a escrever antes, implementação concreta e comando de "pronto". Inclui o roteiro de validação para o QA Engineer.
- **Issue (opcional):** com spec e plano aprovados, o squad pergunta se deve criar a issue — no repositório do projeto ou em outro, com `--issues-repo` — com contexto, regras, critérios de aceite em checklist e a abordagem técnica. Sem issue, segue só com o contexto da conversa, e o resumo da spec vai para a descrição do MR.
- **Implementação (Developer):** teste primeiro, depois código, suíte verde a cada passo. Escreve a descrição do MR (`mr.md`) como para um colega de fora. O orquestrador commita localmente na branch da issue.
- **QA (QA Engineer):** classifica a mudança (API, front ou ambos), sobe a app, valida endpoints com `curl` e telas com Playwright (ambiente isolado em `.squad/<slug>/e2e/` se o projeto não tiver Playwright) e guarda evidências e screenshots.
- **Code review (Reviewer):** um agente novo a cada rodada, que só recebe o diff e a descrição do MR — sem spec, plano, issue ou conversa — e é instruído a não ler `.squad/`. Revisa como uma pessoa de fora e só aponta o que consegue sustentar com um cenário de falha.
- **Entrega final:** com QA e code review aprovados, você confirma e o orquestrador faz push e abre o MR (com `Closes #issue` ou o contexto da spec, resultado do QA e do code review), comentando o link na issue quando houver. Nunca faz merge.

## Requisitos

- [Claude Code](https://claude.com/claude-code)
- Para issue e MR: [GitHub CLI](https://cli.github.com) ou [GitLab CLI](https://gitlab.com/gitlab-org/cli), autenticado:

```bash
brew install gh && gh auth login
```

```bash
brew install glab && glab auth login
```

A plataforma é detectada pelo `origin` do projeto. Sem CLI, o fluxo oferece seguir em modo `--local`.

## Instalação

```bash
git clone https://github.com/ciceroborges/ai-flow.git
cd ai-flow
./install.sh
```

Cria symlinks em `~/.claude/agents` e `~/.claude/skills`, deixando o squad disponível em todos os projetos. Editar os arquivos do repo atualiza a instalação na hora. Para remover: `./install.sh --uninstall`.

## Uso

Em qualquer projeto, no Claude Code:

```
/squad adicionar login com Google na tela de entrada
/squad corrigir o cálculo de desconto no checkout --auto
/squad --issue 42
/squad nova tela de relatórios --issues-repo minha-org/backlog
/squad experimento de cache --local
```

| Flag | Efeito |
|---|---|
| `--issues-repo owner/nome` | Cria a issue em outro repositório. |
| `--issue <n>` | Parte de uma issue existente e a atualiza em vez de criar outra. |
| `--no-issue` | Não cria issue; segue só com o contexto da conversa e abre o MR no final. |
| `--local` | Sem issue, sem push, sem MR — tudo na branch local. |
| `--auto` | Pula as aprovações de spec e plano (discovery e entrega final continuam). |

## Personalizando por projeto

Os agentes leem o `CLAUDE.md` do projeto. Coloque lá como subir a app, comandos de teste/build, usuários de teste e convenções, e o squad segue. Para sobrescrever um agente só num projeto, crie um arquivo com o mesmo nome em `<projeto>/.claude/agents/`.
