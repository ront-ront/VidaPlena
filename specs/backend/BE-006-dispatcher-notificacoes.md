# BE-006 - Dispatcher de notificações, EmailSender e portal

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-003, BE-004
- **Requisitos cobertos:** RF-013, RN-005

## 1. Objetivo
Preparar entrega idempotente e auditável por e-mail e portal para convites, segurança e futuros lembretes. Separar mensagens essenciais de não essenciais.

## 2. Escopo
- Inclui: porta `NotificationChannel`/`EmailSender`, caixa/log de desenvolvimento, notificação em portal, preferência, status de envio e retry reutilizável.
- NÃO inclui: agenda de lembretes RF-013 (BE-025), SMS/WhatsApp operacional ou provedor real de produção.

## 3. Contexto necessário
Ler `specs/shared/business-rules.md` (notificações), `specs/shared/api-contracts.md` (notificações/eventos), `specs/shared/data-model.md` (`Notification`), Q-18 e `specs/backend/architecture.md` (portas).

## 4. Detalhamento
- Mensagem guarda categoria, canal, template seguro, status, horário, preferência vigente e chave idempotente. Canais ativos V1: e-mail e portal; SMS/WhatsApp apenas stubs sem envio. EmailSender dev escreve em caixa local/log **somente em desenvolvimento**, com segredos de link nunca no log de produção.
- Essenciais: convite, recuperação, confirmação, lembrete, cancelamento/remarcação e oferta da espera; preferência de canal, não opt-out da categoria. Sem canal externo, entregar no portal e sinalizar recepção. Marketing pode ser desativado. Revogação de consentimento bloqueia todos os envios salvo exceção legal aprovada (P-01).
- Retry de falha registra tentativa e alerta operacional sem duplicar entrega; política concreta de intervalo é parâmetro ainda não aprovado se necessário, documentar antes de implementar.

## 5. Critérios de aceite
- [ ] Dado mesmo evento entregue duas vezes, quando processar, então uma única notificação por chave idempotente é persistida/enviada.
- [ ] Dado opt-out de marketing, quando evento não essencial ocorrer, então não há envio; lembrete essencial continua elegível com consentimento ativo.
- [ ] Dado nenhum canal externo, quando evento essencial ocorrer, então portal recebe e recepção é sinalizada.
- [ ] Dada revogação de consentimento, quando mensagem já enfileirada for processada, então preferência/consentimento é reavaliado e envio não legal é bloqueado.

## 6. Testes esperados
Unitários de classificação e preferência, integração com outbox/caixa dev, idempotência, retry e revogação antes de entrega. Lint do backend.

## 7. Definition of Done
- [ ] Porta e adaptadores dev isolados; produção não usa log/caixa como provedor real.
- [ ] Status/preferência/auditoria persistidos; testes e lint passam.
- [ ] BE-025 continua responsável pelo relógio de lembretes.

## 8. Suposições e pontos em aberto
Lista de essenciais precisa de validação jurídica P-01. Provedor de e-mail real para produção não foi escolhido; Q-18 autoriza apenas implementação dev.
