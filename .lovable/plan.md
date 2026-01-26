

# Plano: Otimização do Layout do Ranking com Equipes

## Problema Atual

Na imagem fornecida, os cards de colaboradores estão aparecendo em **2 colunas** (um do lado do outro), quando o esperado é que apareçam em **1 coluna** (um embaixo do outro). O espaço vazio à direita deve ser preenchido com as **equipes que cada colaborador pertence**.

---

## Solução Proposta

### Layout Atualizado

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Card do Colaborador (Coluna Única)                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ [1] [Avatar] Mateus Brito          │  [Equipe A] [Equipe B]     │  [⭐ 0 pts] │
│              0 tarefas • 0 no prazo │                            │            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [2] [Avatar] Marcos                │  [Equipe A]                │  [⭐ 0 pts] │
│              0 tarefas • 0 no prazo │                            │            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [3] [Avatar] Kerlys kauan          │  (sem equipes)             │  [⭐ 0 pts] │
│              0 tarefas • 0 no prazo │                            │            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Mudanças Técnicas

### Parte 1: Expandir LeaderboardData para incluir equipes

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

Adicionar campo `teams` na interface:

```typescript
export interface LeaderboardData {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  // ... campos existentes ...
  // NOVO: Equipes do colaborador
  teams?: Array<{
    id: string;
    name: string;
    color: string | null;
  }>;
}
```

---

### Parte 2: Buscar membros de equipes no Ranking.tsx

**Arquivo:** `src/pages/Ranking.tsx`

Nas funções `loadSalesData` e `loadTasksData`, adicionar busca das equipes de cada usuário:

```typescript
// Buscar team_members para associar equipes aos usuários
const { data: teamMembers } = await supabase
  .from('team_members')
  .select('user_id, team_id, teams(id, name, color)')
  .in('user_id', userIds);

// Agrupar equipes por user_id
const teamsByUser = new Map<string, Array<{id: string; name: string; color: string | null}>>();
for (const tm of teamMembers || []) {
  const team = tm.teams as any;
  if (!team) continue;
  const current = teamsByUser.get(tm.user_id) || [];
  current.push({ id: team.id, name: team.name, color: team.color });
  teamsByUser.set(tm.user_id, current);
}

// Incluir equipes no retorno
return {
  user_id: userId,
  // ... outros campos ...
  teams: teamsByUser.get(userId) || [],
};
```

---

### Parte 3: Alterar Layout para Coluna Única

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

Mudar o grid de 2 colunas para 1 coluna (linha ~423):

De:
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[500px] overflow-y-auto pr-2">
```

Para:
```tsx
<div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2">
```

---

### Parte 4: Adicionar Exibição de Equipes no RankingCard

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

Modificar o componente `RankingCard` para receber e exibir as equipes. Adicionar uma nova seção entre as informações do colaborador e o badge de pontos:

```tsx
const RankingCard = ({
  rep,
  position,
  type,
}: {
  rep: LeaderboardData;
  position: number;
  type: "sales" | "tasks";
}) => {
  // ... código existente ...

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all">
      {/* Position Badge */}
      {/* ... */}
      
      {/* Avatar */}
      {/* ... */}
      
      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Nome e métricas */}
      </div>
      
      {/* NOVO: Teams Badges */}
      {rep.teams && rep.teams.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          {rep.teams.slice(0, 3).map(team => (
            <div 
              key={team.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium"
              style={{ 
                borderColor: team.color || 'hsl(var(--border))',
                color: team.color || 'hsl(var(--muted-foreground))',
                backgroundColor: `${team.color}15` || 'transparent'
              }}
            >
              <Users className="h-2.5 w-2.5" />
              <span className="truncate max-w-[60px]">{team.name}</span>
            </div>
          ))}
          {rep.teams.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{rep.teams.length - 3}</span>
          )}
        </div>
      )}
      
      {/* Stats Badge */}
      {/* ... */}
    </div>
  );
};
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/TaskLeaderboard.tsx` | 1. Adicionar `teams` à interface LeaderboardData<br>2. Mudar grid para coluna única<br>3. Exibir badges de equipes no RankingCard |
| `src/pages/Ranking.tsx` | 1. Buscar `team_members` com join em `teams`<br>2. Agrupar equipes por `user_id`<br>3. Incluir `teams` no objeto de dados |

---

## Resultado Visual Esperado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Pódio Top 3 (Esquerda)              │  Lista em COLUNA ÚNICA (Direita)     │
│                                     │                                       │
│   🥈      🥇      🥉                │  ┌─────────────────────────────────┐  │
│  Marcos  Mateus  Kerlys             │  │ [1] Mateus    [Equipe A]  0pts │  │
│                                     │  └─────────────────────────────────┘  │
│                                     │  ┌─────────────────────────────────┐  │
│                                     │  │ [2] Marcos    [Equipe B]  0pts │  │
│                                     │  └─────────────────────────────────┘  │
│                                     │  ┌─────────────────────────────────┐  │
│                                     │  │ [3] Kerlys    (sem equipe) 0pts│  │
│                                     │  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Validação

1. **Layout de Coluna Única:**
   - Os cards aparecem um embaixo do outro (não lado a lado)
   - Largura total do container é utilizada

2. **Exibição de Equipes:**
   - Cada card mostra badges coloridos das equipes
   - Cor da borda e texto segue a cor da equipe
   - Limite de 3 equipes visíveis + indicador "+N" se houver mais
   - Colaboradores sem equipe não mostram nada (sem "sem equipes")

3. **Responsividade:**
   - Em mobile, equipes ficam menores ou ocultas
   - Layout permanece funcional em todas as telas

4. **Integridade dos Dados:**
   - Query de `team_members` funciona corretamente
   - Colaboradores sem equipes não causam erro

