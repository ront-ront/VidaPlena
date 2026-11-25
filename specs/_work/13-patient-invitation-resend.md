# Correção M0 — reenvio de convite de paciente (25/11/2026)

Plano aprovado pelo usuário: botão na busca por CPF do cadastro presencial, com API para admin/recepção autenticados com MFA; M2 permanece pausada e suas alterações em andamento são preservadas. Complemento de RF-001, BE-010 e FE-039, com ajuste de linguagem FE-006; implementar backend antes da interface.

## Contrato e regras

- POST `/v1/patients/{id}/invitation`, sem payload de destinatário/conta.201 `{patientId,status:"invited",invitationExpiresAt}` confirma enfileiramento, nunca entrega efetiva.
- GET `/v1/onsite-patients?cpf=` acrescenta `invitation:{canResend:boolean,unavailableReason:string|null}` calculado no servidor; POST revalida tudo.
- Só conta própria de paciente em estado invited e consentimento de dados vigente. Sem conta própria (inclusive dependente/assistido), ativo/inativo ou consentimento pendente/revogado:409 com detalhe acionável. Paciente inexistente404; demais papéis403; sessão sem MFA401.
- Reusar prazo `auth.invite_link_hours`/AUTH_INVITE_LINK_HOURS, emissão e outbox existentes. Invalidar todos os convites anteriores e suprimir notificações antigas pendentes, em transação com novo hash/token cifrado, notificação e auditoria. Aceitação e reenvio usam o lock de identidade existente; consentimento/envio usam lock de destinatário.
- Não recriar cadastro, alterar e-mail/senha/status, criar conta de dependente, expor token em API ou implementar SMTP. Em dev, link continua em EMAIL_MAILBOX_PATH, normalmente apps/backend/var/mailbox.

## Interface e validação

Botão na identidade encontrada por CPF, motivo quando indisponível, loading sem clique duplicado, sucesso/erro preservando formulário e aviso da caixa dev. Limpar resultado de convite ao trocar CPF e descartar respostas antigas da busca. `/convite` identifica paciente e não instrui MFA para ele; internos preservam instrução.

Testar expiração/reemissão/uso único/login, isolamento/perfis/MFA/consentimento, concorrência, rollback/auditoria e outbox/caixa local. Testes de navegador para botão/estados e ativação. Verificação estática somente lint, nunca tsc. Sem migration ou dependência nova; não incluir mudanças da BE-040 em eventual entrega desta correção.

## Estado

Implementada e verificada localmente. Leituras completas, da primeira à última linha: constituição48, BE-01043, FE-03952, FE-00642, AGENTS frontend76, design-system70 e screens-map61 originais; OnsiteConsentForm722 original em blocos sequenciais, ProvisionAccounts208 original e adaptador de provisioning234 original integralmente. Context7 indisponível; guia use-client da versão Next16.3.6 instalada consultado em node_modules/next/dist/docs antes de código frontend.

## Evidências

- Backend7/7 (`/tmp/vidaplena-patient-invite-backend-final.log`, sessão15076, saída0):6 casos de reenvio HTTP/PostgreSQL e1 regressão de convite interno. Teste cadastra paciente pela API com termo, expira convite, reenvia, confere hash/token, invariância do cadastro, outbox, auditoria, e-mail na caixa dev e ativa/loga com nova senha. Demais casos cobrem conta/consentimento, MFA/RBAC, concorrência e rollback de auditoria.
- Regressão M0 consentimento/cadastro/auth7/7 (`/tmp/vidaplena-patient-invite-m0-regression.log`, sessão57931, saída0), em base-base extra descartável com todas as migrations. Node31/31 e clienteHTTP7/7 em logs patient-invite-node/api, sessões26140/89901, saída0.
- Firefox7/7 (`/tmp/vidaplena-patient-invite-browser-final.log`, sessão4692, saída0):5 casos do botão e2 ativações, incluindo paciente e interno; mock contratual, preservação do formulário, erro/retry, resposta inválida, conflito, CPF antigo descartado, teclado e360px.
- Firefox2/2 adicionais (`/tmp/vidaplena-patient-invite-links.log`, sessão8312): convite realmente expirado continua bloqueado, recuperação de senha mantém token em memória até uso, URL sem token. Não usar o antigo log27/29 como resultado integral aprovado;22 fluxos de termo e5 do botão passaram naquela rodada,2 ativações revelaram captura não idempotente no Strict Mode dev, agora corrigida. Documentação primária: https://react.dev/reference/react/StrictMode. Navegação do teste usa commit antes da remoção esperada do token da URL em Firefox.
- Lint backend322/front94 aprovados em logs patient-invite-final-backend/frontend-lint; somente Biome, nunca tsc. Primeira rodada backend teve falhas nas chamadas públicas do teste sem Origin; fixtures corrigidas para cumprir proteção existente, sem enfraquecer servidor.

Sem migration/dependência, SMTP, acesso ao .env/caixa de e-mail privada do usuário, banco dev ou commit. Caixas e bancos lidos pelos testes são criados/removidos por fixtures. Alterações da BE-040 preservadas, M2 segue pausada. Revisão manual com leitor de tela e portões jurídicos originais permanecem para produção; não há novo bloqueio para testar reenvio em dev.
