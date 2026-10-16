# AI Flow

Fluxo agêntico de desenvolvimento para o Claude Code: um squad de subagentes que leva um pedido do discovery ao commit, em qualquer projeto.

```
/squad <pedido>
   │
   ├─ squad-pm         ⇄ você      discovery em conversa → spec.md     ── Portão: spec
   ├─ squad-architect             plano executável → plan.md          ── Portão: plano
   ├─ squad-dev                   TDD → código + testes + mr.md
   ├─ squad-qa                    suíte + API (curl) + front (Playwright) → qa-report.md
   ├─ squad-reviewer              revisão cética, só código + descrição do MR → review.md
   │     └─ reprovou? volta ao dev (máx. 3 rodadas)
   └─ Portão final: você decide commitar
```

Os artefatos de cada tarefa ficam em `.squad/<data>-<slug>/` no projeto.

## Modelos e esforço por etapa

A ideia é concentrar o raciocínio caro onde as decisões são tomadas e deixar a execução rápida e barata.

| Agente | Modelo | Esforço | Por quê |
|---|---|---|---|
| `squad-pm` | opus | high | Discovery exige entender regras de negócio, o que já existe na app e fazer as perguntas certas. |
| `squad-architect` | opus | xhigh | É onde o pensamento pesado acontece: o plano sai com arquivos, assinaturas e testes por passo, para o Dev não decidir nada. |
| `squad-dev` | sonnet | medium | Executa um plano já mapeado, em TDD. Precisa ser preciso, não criativo. |
| `squad-qa` | sonnet | high | Execução procedural (subir app, curl, Playwright), mas com persistência para lidar com ambiente e casos de borda. |
| `squad-reviewer` | opus | high | Revisor cético e independente: encontrar bug sutil e falha de segurança sem contexto pede o modelo mais forte. |
| Orquestrador (`/squad`) | sessão atual | — | Só faz a ponte e controla portões; Sonnet já basta. |

Ajuste no frontmatter (`model`, `effort`) de cada arquivo em `agents/`.

## Como cada etapa funciona

- **Discovery (PM):** o PM investiga o código (o que existe, o que falta, regras de negócio, impactos) e devolve perguntas com opções e recomendação. O orquestrador te repassa, devolve suas respostas ao mesmo PM e repete até não sobrar dúvida que mude o escopo.
- **Plano (Arquiteto):** passos pequenos, cada um com os testes a escrever antes, implementação concreta e comando de "pronto". Inclui o roteiro de validação para o QA.
- **Dev:** teste primeiro, depois código, suíte verde a cada passo. Escreve a descrição do MR (`mr.md`) como para um colega de fora.
- **QA:** classifica a mudança (API, front ou ambos), sobe a app, valida endpoints com `curl` e telas com Playwright (ambiente isolado em `.squad/<slug>/e2e/` se o projeto não tiver Playwright), guarda evidências e screenshots.
- **Code Review:** um agente novo a cada rodada, que só recebe o diff e a descrição do MR — sem spec, plano ou conversa — e é instruído a não ler `.squad/`. Revisa como uma pessoa de fora, e só aponta o que consegue sustentar com um cenário de falha.

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
```

`--auto` pula as aprovações de spec e plano (o discovery e o portão final de commit continuam).

## Personalizando por projeto

Os agentes leem o `CLAUDE.md` do projeto. Coloque lá como subir a app, comandos de teste/build, usuários de teste e convenções, e o squad segue. Para sobrescrever um agente só num projeto, crie um arquivo com o mesmo nome em `<projeto>/.claude/agents/`.
