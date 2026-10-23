# BE-044 - Consentimento específico de teleconsulta

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-011, BE-021, BE-004
- **Requisitos cobertos:** RF-024, RN-010

## 1. Objetivo
Registrar termo de teleconsulta versionado por atendimento online, distinto do aceite de dados e da gravação.

## 2. Escopo
- Inclui aceite/recusa/revogação por titular ou responsável e auditoria. NÃO inclui sessão de vídeo ou gravação.

## 3. Contexto necessário
Ler DRS §3.4.1, RN-010, Q-05/Q-12, shared/data-model.md#m3, shared/api-contracts.md#m3 (terms/consent), shared/access-policy.md e backend/architecture.md.

## 4. Detalhamento
Modelar TeleconsultConsent append-only com consulta, paciente, ator, GuardianLink, versão e data; validar consulta online confirmada e representação legal. GET terms devolve versão vigente; POST consent guarda aceite ou recusa e invalida aceite de versão antiga. Sem aceite vigente, BE-045 não abre sessão. Recusa gera estado que FE-030 oferece conversão/remarcação presencial pelo fluxo M1; nenhuma alteração automática de modalidade sem nova reserva. Revogação durante sessão sinaliza encerramento. Auditar evento sem texto sensível de atendimento.

## 5. Critérios de aceite
- [ ] Dada consulta presencial, quando enviar aceite, então 409 e nenhuma sessão é habilitada.
- [ ] Dado responsável não vinculado, quando aceitar por menor, então 403.
- [ ] Dada recusa ou versão substituída, quando abrir vídeo, então 403/409.
- [ ] Dado aceite válido, quando consultar estado, então versão, autor e data são rastreáveis.
- [ ] Dada revogação, quando houver sessão, então seu encerramento é solicitado.

## 6. Testes esperados
Unitário de versão/representação, integração de endpoints, auditoria e recusa; lint.

## 7. Definition of Done
- [ ] Migração de schema acompanha entidade; contrato compartilhado e testes/lint passam, sem tsc; não implantar vídeo aqui.

## 8. Suposições e pontos em aberto
Texto e publicação do termo dependem da governança de consentimentos P-12.
