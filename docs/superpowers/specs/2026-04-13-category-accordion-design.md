# Category Accordion — Design Spec
**Date:** 2026-04-13
**Scope:** Allowed Item Categories section in PLRackEditModal and PLRackForm
**Status:** Approved

---

## Problema

A seção de categorias nos modais de criação/edição de rack exibe uma lista plana de checkboxes sem agrupamento, sem colapso e sem cascade. Com muitas categorias, o admin precisa percorrer a lista inteira para configurar um rack.

---

## Objetivo

Permitir que o admin configure as categorias permitidas em 2 cliques: abrir o grupo (chevron) e marcar o parent (cascade automático nos filhos).

---

## Solução: PLCategoryAccordion

### Novo arquivo
`src/pages/PLCategoryAccordion.tsx` — componente controlado, compartilhado por PLRackEditModal e PLRackForm.

### Interface
```tsx
interface Category { id: string; name: string; parent_id: string | null }

interface Props {
  categories: Category[]       // lista completa (parents + children) já carregada
  selected: string[]           // IDs selecionados (controlled)
  onChange: (ids: string[]) => void
  disabled?: boolean
}
```

---

## Comportamento

### Accordion
- Cada parent tem um chevron `▶ / ▼` à esquerda do checkbox
- Filhos ficam ocultos por padrão (collapsed)
- Clicar no chevron abre/fecha — não afeta seleção
- Parents sem filhos não exibem chevron
- Estado de abertura: `openGroups: Set<string>` local ao componente

### Checkbox do parent — 3 estados
| Condição | Estado visual |
|---|---|
| parent.id ∈ selected E todos os child.ids ∈ selected | `checked` ✓ |
| parent.id ∉ selected E nenhum child.id ∈ selected | `unchecked` ☐ |
| qualquer outra combinação (parcial) | `indeterminate` — |

### Clique no parent checkbox
- `unchecked` → `checked`: adiciona parent.id + todos os child.ids ao array
- `checked` → `unchecked`: remove parent.id + todos os child.ids
- `indeterminate` → `checked`: adiciona os que faltam (parent.id + child.ids ausentes)

### Clique no child checkbox
- Toggle simples do child.id
- Estado do parent é re-derivado automaticamente

### Select All
- Link/botão no cabeçalho da seção (lado direito do label)
- Adiciona todos os IDs (parents + children) ao array de uma vez
- Texto muda para "Clear All" quando tudo está selecionado — **fora do escopo desta iteração**; manter apenas "Select All" por ora

---

## O que NÃO muda

- Tabela `rack_allowed_categories` — mesma estrutura, apenas recebe mais IDs (parent + filhos juntos)
- Lógica de filtro em `pickingLineService.ts` e `PLSlotContextMenu.tsx` — sem alteração
- Racks existentes — IDs já salvos continuam funcionando normalmente
- Estilo geral dos modais — inline styles, mesmas cores e fontes do sistema

---

## Arquivos tocados

| Arquivo | Alteração |
|---|---|
| `src/pages/PLCategoryAccordion.tsx` | **Criado** — componente do accordion |
| `src/pages/PLRackEditModal.tsx` | Substitui seção de categorias inline pelo `<PLCategoryAccordion>` |
| `src/pages/PLRackForm.tsx` | Idem |

---

## Estilo visual (consistente com o sistema)
- Container: `border: '1px solid #e4e4e7'`, `background: '#fafafa'`, `maxHeight: 220px`, `overflowY: 'auto'`
- Parent row: `background: '#f4f4f5'`, hover `#eff6ff`
- Child row: `paddingLeft: 36px`, hover `#f4f4f5`
- Chevron: `ChevronRight` / `ChevronDown` do Lucide, 13px, cor `#71717a`
- Indeterminate: implementado via `ref.indeterminate = true` no elemento `<input type="checkbox">`
- Select All: `fontSize: 10`, `color: '#2563eb'`, `cursor: 'pointer'`, sem border/background

---

## Fora do escopo
- "Clear All" toggle
- Categorias com mais de 2 níveis de profundidade
- Animação de abertura/fechamento do accordion
- Persistência do estado de abertura entre sessões
