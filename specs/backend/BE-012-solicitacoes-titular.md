# BE-012 - Solicitações do titular, exportação e fila do DPO

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-005, BE-011
- **Requisitos cobertos:** RF-005, RNF-016

## 1. Objetivo
Permitir solicitar acesso, correção, exportação e eliminação cabível, com prazo e trilha, sem dar ao DPO acesso automático ao conteúdo clínico.

## 2. Escopo
- Inclui: abertura/consulta/decisão de pedido, prazo `privacy.subject_request_days`, fila por `privacy.dpo`, consulta de metadados de consentimentos/revogações, exportação legível por máquina e retenção obrigatória.
- NÃO inclui: tela (FE-008/038), eliminação de prontuário antes de RN-012, análise jurídica automatizada.

## 3. Contexto necessário
Ler `specs/shared/access-policy.md` (DPO/portal), `specs/shared/data-model.md` (`DataSubjectRequest`), `specs/shared/api-contracts.md` (solicitações), `specs/shared/parameters.md`, DRS §§3.1.5/4.4.5 e Q-09/Q-20.

## 4. Detalhamento
- Pedido tem solicitante, paciente próprio/dependente, tipo, data, vencimento, status, responsável, decisão/justificativa e eventos de auditoria. Sem DPO designado, fila acessível/alertada ao admin, restrita a esse fallback. `GET /v1/privacy/consents` requer `privacy.dpo` e dá somente metadados de versão, ato e data, com auditoria da consulta; não retorna anexo nem conteúdo clínico.
- Exportação gera arquivo estruturado por serviços autorizados para entrega ao titular; DPO decide fluxo e vê metadados, não recebe conteúdo clínico por papel. Eliminação apaga apenas dados sem guarda obrigatória e registra o motivo dos dados preservados; responder dentro da chave de prazo.
- Após revogação e bloqueio de portal, canal assistido para exercício de direitos exige definição jurídica/operacional P-01; não permitir que bloqueio apague a fila/pedido.

## 5. Critérios de aceite
- [ ] Dado paciente autenticado, quando abrir pedido próprio, então recebe ID, estado e vencimento calculado por `privacy.subject_request_days`.
- [ ] Dado identificador de outro paciente, quando abrir/consultar, então servidor nega sem revelar existência.
- [ ] Dado gestor sem `privacy.dpo`, quando consultar fila, então 403; com permissão vê metadados, mas não evolução/anexo. Admin sem grant só recebe fila quando não houver DPO designado.
- [ ] Dado DPO, quando filtrar consentimentos/revogações, então recebe somente metadados autorizados e a consulta gera auditoria; sem permissão, recebe 403.
- [ ] Dado pedido de eliminação de prontuário retido, quando resolver, então dado permanece e a justificativa aparece na resposta auditada.
- [ ] Dado pedido exportado, quando entregar, então formato é legível por máquina, acesso controlado e emissão auditada.

## 6. Testes esperados
Autorização titular/dependente/DPO, prazo, exportação, retenção, auditoria e DPO ausente. Lint.

## 7. Definition of Done
- [ ] Fila e exportação não concedem leitura clínica ao admin/DPO.
- [ ] Respostas distinguem dados eliminados/preservados e seguem prazo.
- [ ] Testes/lint passam, sem `tsc`; pendência P-01 visível para produção.

## 8. Suposições e pontos em aberto
Formato exato do pacote de exportação e canal assistido pós-revogação precisam de validação DPO/jurídico. Esta spec define contrato mínimo; não é parecer legal.
