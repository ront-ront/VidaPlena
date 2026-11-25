# BE-035 - Rascunho e salvamento periódico da evolução

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** backend implementado e verificado localmente; temporizador/UX de autosave integra FE-022
- **Depende de:** BE-032, BE-034
- **Requisitos cobertos:** RF-017, RNF-008

## 1. Objetivo
Persistir evolução em rascunho com versionamento para recuperação após falha de rede/sessão, sem alterar finalizadas.

## 2. Escopo
- Inclui: migration draft, criação, patch com versão esperada, leitura de recuperação e validação de campos/CID.
- NÃO inclui: finalização/adendo (BE-036), UI de editor (FE-022) ou publicação ao paciente.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2` (`ClinicalEvolution`), `specs/shared/api-contracts.md#m2` (evolução), DRS §3.3.2/§4.2.4 e RN-008/Q-04.

## 4. Detalhamento
- Um rascunho pertence a encontro/paciente/autor; registrar queixa, história, exame, hipótese, conduta e códigos CID-10 estruturados. Só autor em atendimento autorizado edita. `expectedDraftVersion` evita overwrite concorrente; 409 devolve estado seguro para resolução no front.
- PATCH idempotente de autosave persiste conteúdo e `savedAt`; FE-022 programa envio em até 30 s, mas backend não presume conexão contínua. Reabrir sessão recupera última versão persistida integralmente; acesso expirado não amplia vínculo.
- Status `draft` não é documento clínico final nem publicado; audit trail de alterações relevantes preserva autoria sem despejar texto em log técnico.

## 5. Critérios de aceite
- [x] Dado rascunho salvo, quando sessão cair e usuário autorizado voltar, então última versão persistida é recuperada integralmente.
- [x] Dadas duas edições com mesma versão, quando confirmar, então apenas uma avança e outra recebe 409 sem sobrescrever silenciosamente.
- [x] Dado autor diferente/sem vínculo, quando editar, então 403/404 e nenhuma mudança.
- [x] Dada evolução finalizada, quando PATCH draft for chamado, então 409 e conteúdo permanece intocado.

## 6. Testes esperados
Criação, versionamento concorrente, recuperação, CID válido/inválido, autorização, status final e auditoria; lint.

## 7. Definition of Done
- [x] Porta/repository e endpoints de draft seguem contrato único; sem update de finalizada.
- [x] Testes backend/lint passam, sem `tsc`; verificação do intervalo de autosave RNF-008 permanece para FE-022.

## 8. Suposições e pontos em aberto
Retenção específica de rascunho abandonado e resolução de conflitos entre dispositivos não foram definidas; não apagar automaticamente antes de política clínica aprovada.

## Evidência local —25/11/2026

Payload cifrado, uma evolução por encontro/autor, CRUD de draft/recuperação, snapshots CID na mesma transação, versão otimista e comandos idempotentes por nonce/HMAC. Guard de escrita exige vínculo da consulta do encontro, autoria e atendimento corrente; nova consulta não reabre edição de encontro expirado. Finalizada recusa replay/PATCH e SQL não permite UPDATE/DELETE. Nenhum texto entra em logs/auditoria/409. Conflito traz só metadados seguros.

12/12 específicos e42/42 regressão BE-030/032/034/035 (`/tmp/vidaplena-be035-regression.log`, sessão63540, saída0),28/28 Node (`/tmp/vidaplena-be035-node.log`, sessão9283), lint266 e Prisma validate/generate/diff aprovados. Conjuntos sobrepostos. Testes incluem nonce concorrente entre recursos (um resultado, zero parcial), sessão nova, CID histórico após mudança do catálogo, IDOR, urgência sem draft, rollback de auditoria e constraints. Finalizada foi fixture para testar a proteção; endpoint de finalizar/adendo só BE-036. Guard de início BE-032 também foi restringido ao vínculo da consulta. Nenhum tsc/banco dev.
