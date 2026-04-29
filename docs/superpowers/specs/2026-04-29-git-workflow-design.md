# Git Workflow — Design Spec
**Data:** 2026-04-29
**Status:** Aprovado pelo Project Owner

---

## Problema

A máquina local utilizada para desenvolvimento é um ambiente potencialmente vulnerável. O código não deve residir permanentemente no ambiente local — o GitHub é o ambiente seguro, versionado e autoritativo do projeto.

## Objetivo

Garantir que todo o código desenvolvido seja imediatamente commitado e versionado no GitHub, com branches de feature isolando qualquer trabalho antes de chegar à `main`.

---

## Workflow Adotado

### Ferramentas

- **git** — controle de versão local (staging temporário)
- **gh CLI** — operações GitHub direto do terminal (branches, PRs, merge)
- **Autenticação** — `gh auth login` via browser (OAuth), sem token manual

### Regras Fixas

1. **`main` é intocável** — nenhuma edição direta. Sempre via PR.
2. **Toda feature ou correção começa com uma branch remota** — criada via `gh` antes de qualquer edição.
3. **Commit + push imediato** — nenhuma sessão termina com uncommitted changes locais.
4. **PR obrigatório antes do merge** — criado via `gh pr create`, revisado pelo Project Owner.
5. **Merge somente após aprovação** — `gh pr merge` após validação.

### Nomenclatura de Branches

| Tipo | Prefixo | Exemplo |
|---|---|---|
| Nova funcionalidade | `feat/` | `feat/dashboard-overview` |
| Correção de bug | `fix/` | `fix/inventory-spinner-flash` |
| Manutenção/refactor | `chore/` | `chore/update-dependencies` |

### Fluxo por Sessão

```
1. gh repo clone / git pull (sincronizar com remoto)
2. gh api / git push origin HEAD:refs/heads/feat/<nome>  ← branch criada no GitHub
3. git checkout feat/<nome>
4. [Claude edita arquivos localmente]
5. git add <arquivos> && git commit -m "..."
6. git push origin feat/<nome>   ← código seguro no GitHub imediatamente
7. gh pr create                  ← PR aberto para revisão
8. Project Owner revisa e aprova
9. gh pr merge                   ← merge na main
10. git checkout main && git pull ← local sincronizado
```

### Local como Staging Temporário

O repositório local é apenas uma área de trabalho transitória. O GitHub é a fonte da verdade. Após cada push, o código local é descartável.

---

## Setup Inicial (a executar uma vez)

```bash
# 1. Instalar gh CLI
winget install GitHub.cli

# 2. Autenticar via browser
gh auth login
# → selecionar GitHub.com → HTTPS → Login via browser → autorizar

# 3. Verificar
gh auth status
```

---

## O que Muda na Prática

| Antes | Depois |
|---|---|
| Branch criada localmente, nunca pushed | Branch criada e pushed imediatamente |
| Edições sem commit ficavam locais | Commit + push após cada bloco de trabalho |
| Sem PR formal | PR obrigatório antes de qualquer merge |
| `main` editada diretamente às vezes | `main` nunca tocada diretamente |
