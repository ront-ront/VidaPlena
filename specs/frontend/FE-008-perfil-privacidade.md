# FE-008 - Perfil, contatos, consentimentos e direitos do titular

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-004, BE-009, BE-011, BE-012
- **Requisitos cobertos:** RF-004, RF-005, RNF-016

## 1. Objetivo
Dar ao usuário uma área pessoal para manter contato, consultar/revogar termos e solicitar seus direitos, com consequências explicadas antes de agir.

## 2. Escopo
- Inclui: `/minha-conta` com seções de dados, contatos, dependentes, consentimentos e pedidos do titular; confirmação de novo contato.
- NÃO inclui: edição direta de CPF/nascimento, tratamento da fila DPO (FE-038) ou histórico clínico (FE-027).

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md`, `specs/frontend/design-system.md`, `specs/shared/api-contracts.md` (me/consents/requests), `specs/shared/access-policy.md`, DRS §§3.1.4–3.1.5 e Q-09/Q-20.

## 4. Detalhamento
- Mostrar campos atuais e quais são editáveis; novo e-mail/telefone fica pendente até confirmação no novo canal. CPF/data de nascimento orientam solicitação à clínica com responsável auditado. Dependentes aparecem só para responsável vinculado.
- Histórico de termos mostra versão, data, origem, ator e estado; revogar exige diálogo com consequência (portal/notificações bloqueados, dados obrigatórios retidos) sem prometer exclusão indevida. Pedidos de acesso/correção/exportação/eliminação mostram prazo/status e resposta. Após revogação, caminho assistido precisa ser oferecido, sujeito P-01.
- Layout proposto Q-14: navegação simples por seções, ação principal clara, vazio/loading/erro/sucesso, pt-BR e 360 px. Não renderizar conteúdo clínico interno na área pessoal.

## 5. Critérios de aceite
- [ ] Dado contato novo, quando salvar, então aparece “aguardando confirmação” e o anterior permanece oficial.
- [ ] Dada revogação, quando confirmar, então estado fica registrado e o portal bloqueia ações dependentes, explicando dados retidos.
- [ ] Dado dependente sem vínculo, quando forçar ID na rota, então não há dados na UI nem na resposta da API.
- [ ] Dado pedido do titular, quando enviar, então exibe ID, prazo pela chave `privacy.subject_request_days` e acompanhamento.

## 6. Testes esperados
Fluxos de contato, histórico/revogação, dependentes, pedido e estados loading/erro; acessibilidade e lint.

## 7. Definition of Done
- [ ] Nenhum dado clínico interno exibido; permissões/contrato respeitados.
- [ ] Consequências e canal assistido claros; testes/lint passam, sem `tsc`.
- [ ] Jurídico P-01 permanece marcado.

## 8. Suposições e pontos em aberto
Canal de confirmação de telefone não existe operacionalmente na V1 (sem SMS); até decisão, a tela não deve fingir confirmação automática. Fluxo pós-revogação precisa de validação DPO/jurídico.
