# BE-035 - Rascunho e salvamento periódico da evolução

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
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
- [ ] Dado rascunho salvo, quando sessão cair e usuário autorizado voltar, então última versão persistida é recuperada integralmente.
- [ ] Dadas duas edições com mesma versão, quando confirmar, então apenas uma avança e outra recebe 409 sem sobrescrever silenciosamente.
- [ ] Dado autor diferente/sem vínculo, quando editar, então 403/404 e nenhuma mudança.
- [ ] Dada evolução finalizada, quando PATCH draft for chamado, então 409 e conteúdo permanece intocado.

## 6. Testes esperados
Criação, versionamento concorrente, recuperação, CID válido/inválido, autorização, status final e auditoria; lint.

## 7. Definition of Done
- [ ] Porta/repository e endpoints de draft seguem contrato único; sem update de finalizada.
- [ ] Testes/lint passam; intervalo RNF-008 verificado com FE-022, sem `tsc`.

## 8. Suposições e pontos em aberto
Retenção específica de rascunho abandonado e resolução de conflitos entre dispositivos não foram definidas; não apagar automaticamente antes de política clínica aprovada.
