
## Atualização do Google Client ID

Vou atualizar a secret **GOOGLE_CLIENT_ID** com o valor correto:

**Novo valor:**
```
543944011390-32bc853m6jc08jjn25jmf9c98b0qbh2r.apps.googleusercontent.com
```

### Checklist de configuração:

| Item | Status |
|------|--------|
| GOOGLE_CLIENT_ID | Atualizar agora |
| GOOGLE_CLIENT_SECRET | Ja configurado |
| GOOGLE_CALENDAR_ENCRYPTION_KEY | Ja configurado |
| Redirect URI no Google Cloud | Verificar depois |

### Proximo passo apos aprovar:

1. Atualizo a secret no backend
2. Voce testa a conexao em **Configuracoes → Integracoes → Google Calendar**
3. Se der erro de "redirect_uri_mismatch", precisaremos verificar se a URI de callback esta configurada corretamente no Google Cloud Console
