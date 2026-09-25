# Plano de Blindagem e Auditoria do SenaClube

## Fase 1: Segurança Crítica, Autenticação e Prevenção de XSS (P1)
- [x] 1.1 Criar endpoint de autenticação `api/auth.js` e integrar em `server.js`
- [x] 1.2 Proteger `POST /api/bolao` no Vercel e `server.js` com validação de token Bearer
- [x] 1.3 Atualizar `supabase/migrations/20260925_secure_rls.sql` revogando escrita anônima
- [x] 1.4 Remover bypass `?admin=1` e credenciais `admin:admin` no frontend `public/js/app.js`
- [x] 1.5 Implementar `escapeHTML()` e sanitizar todas as interpolações de `innerHTML` no frontend

## Fase 2: Concorrência, Integridade e Proteção de Dados LGPD (P2)
- [x] 2.1 Implementar Trava Otimista de Concorrência (Anti-Lost Updates) com detecção de versão/timestamp
- [x] 2.2 Implementar validação de schema e intervalo de dezenas (1-60) no backend
- [x] 2.3 Proteger e formatar dados sensíveis do organizador (PII/LGPD)

## Fase 3: Headers de Segurança HTTP e Snapshots de Backup (P3)
- [x] 3.1 Configurar cabeçalhos HTTP OWASP (X-Frame-Options, nosniff, etc.) em `vercel.json` e `server.js`
- [x] 3.2 Implementar rotina de snapshots/backups automáticos pré-gravação

## Fase 4: Testes Automatizados e Validação Completa (P4)
- [x] 4.1 Criar suíte de testes unitários para `BolaoEngine` (`tests/bolao-engine.test.js`)
- [x] 4.2 Criar suíte de testes unitários para `WhatsAppParser` (`tests/whatsapp-parser.test.js`)
- [x] 4.3 Configurar script `"test": "node --test"` em `package.json` e rodar testes
- [x] 4.4 Validar interface via browser subagent e testar fluxo de login/salvamento

## Fase 5: Versionamento e Deploy
- [x] 5.1 Verificar Critic Verification (sem segredos expostos, build OK)
- [x] 5.2 Commit com Conventional Commits e Push para o GitHub
- [x] 5.3 Deploy para produção na Vercel e confirmação ao usuário
