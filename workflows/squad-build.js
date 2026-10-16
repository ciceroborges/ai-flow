export const meta = {
  name: 'squad-build',
  description: 'AI Squad: implementa o plano aprovado e roda o loop dev → QA → code review até aprovar (máx. 3 rodadas de correção)',
  phases: ['Implementação', 'QA', 'Code review', 'Correção'],
}

// args: { task, base, repoRoot, issueRef?, maxFixRounds? }
//   task      — caminho absoluto de .squad/<slug>/ (spec.md e plan.md aprovados)
//   base      — commit base para o diff do code review
//   repoRoot  — raiz do repositório do projeto
//   issueRef  — ex: "#42" ou "org/backlog#42" (opcional)
const { task, base, repoRoot, issueRef } = args || {}
const maxFixRounds = (args && args.maxFixRounds) || 3
if (!task || !base || !repoRoot) {
  throw new Error('squad-build precisa de args { task, base, repoRoot }')
}

const DEV_SCHEMA = {
  type: 'object',
  required: ['status', 'summary', 'filesChanged', 'testsAdded', 'suitePassed', 'mrTitle', 'mrBody'],
  properties: {
    status: { type: 'string', enum: ['DONE', 'BLOCKED'] },
    blockedReason: { type: 'string' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' } },
    suitePassed: { type: 'boolean' },
    mrTitle: { type: 'string' },
    mrBody: { type: 'string', description: 'Conteúdo atual de mr.md' },
  },
}

const QA_SCHEMA = {
  type: 'object',
  required: ['verdict', 'changeType', 'suite', 'criteria', 'notValidated', 'problems'],
  properties: {
    verdict: { type: 'string', enum: ['APROVADO', 'REPROVADO', 'BLOQUEADO'] },
    blockedReason: { type: 'string' },
    changeType: { type: 'string', enum: ['API', 'front', 'ambos'] },
    suite: {
      type: 'object',
      required: ['tests', 'lint', 'build'],
      properties: { tests: { type: 'string' }, lint: { type: 'string' }, build: { type: 'string' } },
    },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'how'],
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['OK', 'FALHOU', 'NÃO VALIDADO'] },
          how: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    notValidated: { type: 'array', items: { type: 'string' } },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'description'],
        properties: {
          severity: { type: 'string', enum: ['BLOQUEANTE', 'MENOR'] },
          description: { type: 'string' },
        },
      },
    },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  required: ['verdict', 'summary', 'findings', 'questions'],
  properties: {
    verdict: { type: 'string', enum: ['APROVADO', 'MUDANÇAS NECESSÁRIAS'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'category', 'location', 'problem', 'scenario', 'fix'],
        properties: {
          severity: { type: 'string', enum: ['CORRIGIR', 'SUGESTÃO'] },
          category: { type: 'string', enum: ['correção', 'segurança', 'promessa', 'manutenção'] },
          location: { type: 'string' },
          problem: { type: 'string' },
          scenario: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
}

const COMMIT_SCHEMA = {
  type: 'object',
  required: ['committed'],
  properties: { committed: { type: 'boolean' }, sha: { type: 'string' }, note: { type: 'string' } },
}

const dev = (prompt, label) =>
  agent(prompt, { agentType: 'ai-flow:squad-dev', schema: DEV_SCHEMA, label })

const commit = (message, label) =>
  agent(
    `No repositório ${repoRoot}, na branch atual, registre o trabalho do squad num commit local:\n` +
      `1. git add -A -- . ':!.squad'\n` +
      `2. Se não houver nada staged, não commite e retorne committed=false.\n` +
      `3. Senão: git commit -m ${JSON.stringify(message)}\n` +
      `Não faça push, não troque de branch, não altere arquivos. Retorne o SHA do commit.`,
    { model: 'haiku', effort: 'low', schema: COMMIT_SCHEMA, label },
  )

const commitMsg = (title, suffix) =>
  `${title}${suffix ? ` (${suffix})` : ''}${issueRef ? `\n\nRefs ${issueRef}` : ''}`

const qaFixList = qa =>
  [
    ...qa.criteria.filter(c => c.status === 'FALHOU').map(c => `- ${c.id} falhou: ${c.how}`),
    ...qa.problems.filter(p => p.severity === 'BLOQUEANTE').map(p => `- ${p.description}`),
  ].join('\n')

const reviewFixList = review =>
  review.findings
    .filter(f => f.severity === 'CORRIGIR')
    .map(f => `- [${f.category}] ${f.location} — ${f.problem}\n  Cenário: ${f.scenario}\n  Correção sugerida: ${f.fix}`)
    .join('\n')

// ── Implementação ────────────────────────────────────────────────
phase('Implementação')
let d = await dev(
  `Pasta da tarefa: ${task}\nRepositório: ${repoRoot}\n\n` +
    `Rodada 1. Execute o plan.md aprovado passo a passo em TDD, seguindo a spec.md. ` +
    `Ao final, escreva dev-log.md e mr.md na pasta da tarefa e retorne o conteúdo de mr.md em mrBody.`,
  'dev · rodada 1',
)
if (d.status === 'BLOCKED') {
  return { status: 'dev_blocked', round: 1, dev: d }
}
await commit(commitMsg(d.mrTitle), 'commit · rodada 1')

let fixRound = 0
const history = []

while (true) {
  // ── QA ──────────────────────────────────────────────────────────
  phase('QA')
  const qa = await agent(
    `Pasta da tarefa: ${task}\nRepositório: ${repoRoot}\n\n` +
      `Rodada ${fixRound + 1} de QA. Valide a implementação contra a spec.md seguindo o roteiro do plan.md. ` +
      `Escreva qa-report.md na pasta da tarefa e retorne o resultado estruturado.`,
    { agentType: 'ai-flow:squad-qa', schema: QA_SCHEMA, label: `qa · rodada ${fixRound + 1}` },
  )
  if (qa.verdict === 'BLOQUEADO') {
    return { status: 'qa_blocked', fixRounds: fixRound, dev: d, qa, history }
  }

  let review = null
  let fixes = null
  if (qa.verdict === 'REPROVADO') {
    fixes = { source: 'QA', list: qaFixList(qa) }
  } else {
    // ── Code review isolado: só o diff e a descrição do MR ─────────
    phase('Code review')
    review = await agent(
      `Revise este Merge Request.\n\n` +
        `Base de comparação: ${base}\nRepositório: ${repoRoot}\n` +
        `Ignore completamente o diretório .squad/ (não leia, não considere no diff).\n\n` +
        `## Descrição do MR\n# ${d.mrTitle}\n\n${d.mrBody}`,
      { agentType: 'ai-flow:squad-reviewer', schema: REVIEW_SCHEMA, label: `code review · rodada ${fixRound + 1}` },
    )
    if (review.verdict === 'APROVADO') {
      return { status: 'approved', fixRounds: fixRound, dev: d, qa, review, history }
    }
    fixes = { source: 'code review', list: reviewFixList(review) }
  }

  history.push({ round: fixRound + 1, qaVerdict: qa.verdict, reviewVerdict: review && review.verdict, fixes: fixes.list })

  if (fixRound >= maxFixRounds) {
    return { status: 'stuck', fixRounds: fixRound, dev: d, qa, review, history }
  }

  // ── Correção ────────────────────────────────────────────────────
  fixRound++
  phase('Correção')
  log(`Rodada de correção ${fixRound}/${maxFixRounds} — origem: ${fixes.source}`)
  d = await dev(
    `Pasta da tarefa: ${task}\nRepositório: ${repoRoot}\n\n` +
      `Modo correção, rodada ${fixRound + 1}. Corrija SOMENTE os itens abaixo, apontados pelo ${fixes.source}. ` +
      `Para cada bug, primeiro escreva um teste que o reproduz, depois corrija. ` +
      `Atualize dev-log.md e, se a mudança alterar o que o MR descreve, mr.md. Retorne o mr.md atual em mrBody.\n\n` +
      fixes.list,
    `dev · correção ${fixRound}`,
  )
  if (d.status === 'BLOCKED') {
    return { status: 'dev_blocked', fixRounds: fixRound, dev: d, history }
  }
  await commit(commitMsg(`fix: ${fixes.source}`, `correção ${fixRound}`), `commit · correção ${fixRound}`)
}
