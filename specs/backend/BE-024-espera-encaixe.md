# BE-024 - Espera, oferta e encaixe fora da grade

- **Software:** back
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; carga formal e front permanecem nas specs próprias
- **Depende de:** BE-020, BE-023, BE-006
- **Requisitos cobertos:** RF-012, RN-001, RN-003

## 1. Objetivo
Manter fila cronológica de interesse, oferecer vagas liberadas sequencialmente e permitir encaixe justificado fora da grade sem qualquer sobreposição.

## 2. Escopo
- Inclui: entrada/saída da espera, preferências, hold/oferta/expiração, aceite transacional e encaixe por recepção/gestor.
- NÃO inclui: seleção visual (FE-017), canal SMS/WhatsApp ou encaixe em intervalo ocupado.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m1` (espera), `specs/shared/data-model.md#m1`, `specs/shared/parameters.md` (`waitlist.offer_ttl_minutes`), DRS §3.2.7, RN-001/003 e Q-06/Q-16/Q-18.

## 4. Detalhamento
- Fila elegível por especialidade/modalidade/faixas, ordenada `queuedAt,id`; cancelamento cria `SlotReservation.held` para primeiro elegível e envia oferta essencial pelo BE-006. Se expira/recusa, liberar e oferecer ao próximo; sem interessados, slot volta ao público. Revogação de dados impede notificação/aceite digital.
- Aceite verifica destinatário, consentimento, vínculo de responsável, oferta ativa e RN-003; converte hold em consulta confirmada pela barreira BE-020, sem criar duas reservas. Saída da fila cancela oferta própria ainda não aceita com auditoria.
- Encaixe é **fora da grade**, mas dentro de intervalo comprovadamente livre para profissional e sala, exige justificativa e ator recepção/gestor; segue RN-001 e marca `bookingSource=fit_in` para indicadores. Nenhum papel pode sobrepor consulta ativa.

## 5. Critérios de aceite
- [x] Dadas duas entradas compatíveis, quando liberar vaga, então a mais antiga recebe primeira oferta; após `waitlist.offer_ttl_minutes` sem aceite, a próxima é ofertada.
- [x] Dada oferta expirada ou de outro paciente, quando tentar aceitar, então 409/403/404 conforme a política de ocultação e nenhuma consulta é criada.
- [x] Dadas confirmações concorrentes da mesma oferta, quando executar, então exatamente uma cria consulta e hold não duplica.
- [x] Dado encaixe sem motivo, ator não permitido ou intervalo ocupado, quando tentar, então 400/403/409 sem reserva; fora da grade e livre, então marcação sinaliza encaixe.

## 6. Testes esperados
Ordem/TTL com relógio injetado, elegibilidade, canal/revogação, aceite concorrente, saída, sala e encaixe livre/ocupado; lint.

## 7. Definition of Done
- [x] Fila/oferta/hold/auditoria persistidos; key `waitlist.offer_ttl_minutes` usada.
- [x] Testes pertinentes/lint passam; sem sobreposição nem `tsc`.

## 8. Suposições e pontos em aberto
Default do TTL é provisório Q-16. A escolha de marcar uma oferta como recusada pode ser inferida de saída da fila; o comportamento deve ser fixado no contrato antes da implementação se houver controle separado.

## Evidência local — 05/11/2026

Arquivo original lido integralmente, da primeira à última das 38 linhas. P-29 detalha preferências/tipo de visita, identificação de duplicado, política de repetição por oportunidade, prazo efetivo limitado por RN-003 e aceite assistido. Migration `202611050024_waitlist` preserva histórico, impede duplicação ativa e valida entrada/oferta/reserva ao commit. Worker PostgreSQL consome as liberações de cancelamento/remarcação, oferece por ordem, expira/avança e sobrevive a reinício sem duplicar; API/DI/Zod/OpenAPI estão integrados. Sem conta digital ativa ou com suspensão de autoagendamento, a oferta sinaliza contato assistido e mantém o caminho da recepção. Revogação não tem exceção de envio.

Primeira bateria: 15/15 integrações HTTP/PostgreSQL; regressão completa nesse ponto 76/76 integrações, 25/25 Node, 2/2 Vitest e lint. Revisão eliminou transação aninhada na consulta de disponibilidade; a bateria com 12 inscrições simultâneas e catálogo passou 21/21 (16 de espera, cinco de catálogo). Regressão final, incluindo corrida de oportunidade ocupada antes do consumidor: 78/78 integrações, 25/25 Node, 2/2 Vitest e lint em 172 arquivos aprovados. A bateria de espera final tem 17/17 testes. Testes abrangem FIFO/TTL/retirada, aceite concorrente/idempotente com mesmo hold, expiração, representação/revogação, encaixe livre/ocupado/bloqueado/RBAC, falha de auditoria com rollback de criação/aceite, contatos assistidos, suspensão, mudança de duração e integridade/histórico no banco. Não há prova de desempenho de produção antes de BE-051.
