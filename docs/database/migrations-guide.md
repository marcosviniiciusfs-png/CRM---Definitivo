# Guia de Migrations - CRM Kairoz

## Formato de Nomenclatura

As migrations devem seguir o formato:
```
YYYYMMDDHHMMSS_description.sql
```

Onde:
- `YYYY` - Ano (4 dígitos)
- `MM` - Mês (2 dígitos)
- `DD` - Dia (2 dígitos)
- `HHMMSS` - Hora, minuto e segundo (6 dígitos)
- `description` - Descrição curta em snake_case

## Exemplos

### ✅ Correto
```
20260328120000_add_user_preferences_table.sql
20260328120100_create_index_on_leads_email.sql
20260328120200_add_cascade_delete_to_tasks.sql
```

### ❌ Incorreto
```
add_user_preferences.sql              # Sem timestamp
2026-03-28_add_user_preferences.sql   # Formato de data incorreto
add_user_preferences_table.sql        # Sem data/hora
Add_User_Preferences_Table.sql        # CamelCase em vez de snake_case
```

## Checklist para Nova Migration

- [ ] Nome segue o formato `YYYYMMDDHHMMSS_description.sql`
- [ ] Descrição é clara e em snake_case
- [ ] Migration é reversível (incluir `DOWN` se aplicável)
- [ ] Testada em ambiente de desenvolvimento
- [ ] Não altera migrations existentes
- [ ] Verificar impacto em RLS policies

## Diretório

As migrations ficam em: `supabase/migrations/`

## Comandos Úteis

```bash
# Criar nova migration
supabase migration new nome_da_migration

# Aplicar migrations
supabase db push

# Ver histórico
supabase migration list
```

## Notas

- Nunca altere migrations já aplicadas em produção
- Use transações para operações que modificam múltiplas tabelas
- Documente mudanças complexas com comentários no SQL