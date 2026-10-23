# FE-034 - Controles e aviso de gravação/revogação

- **Software:** front
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** FE-031, FE-032, BE-054
- **Requisitos cobertos:** RF-027, RN-011

## 1. Objetivo
Controlar MediaRecorder no cliente sob aceite específico e interromper captura imediatamente na revogação.

## 2. Escopo
- Inclui pedido de consentimento, indicador de gravação, iniciar/parar, upload e revogar. NÃO inclui servidor de mídia, transcrição ou publicação ao paciente.

## 3. Contexto necessário
Ler DRS §3.4.4, Q-11/Q-12, shared/api-contracts.md#m3 (recording), shared/parameters.md (recording.*, file.recording_*), frontend/design-system.md e P-03.

## 4. Detalhamento
Layout proposto Q-14: profissional solicita gravação; paciente/responsável vê termo separado e ação Aceitar/Recusar; ambos veem aviso textual e ícone enquanto MediaRecorder captura. Só profissional que atendeu pode iniciar e enviar WebM; cliente divide/paralisa conforme file.recording_max_minutes e file.recording_max_mb. Revogação envia comando, para tracks/MediaRecorder local imediatamente, descarta buffer não enviado e limpa prévias, confirma bloqueio lógico no servidor; se offline, parar localmente e repetir revogação até confirmação, nunca retomar automaticamente. Evolução escrita FE-022 permanece. Estados de permissão negada, upload falho, revogado e exclusão pendente sem oferecer download.

## 5. Critérios de aceite
- [ ] Dado aceite ausente, quando profissional clicar Gravar, então MediaRecorder não inicia.
- [ ] Dada recusa/revogação, quando evento chegar, então captura para e buffer local é descartado.
- [ ] Dado upload em curso na revogação, quando servidor receber, então arquivo é rejeitado ou tornado inacessível.
- [ ] Dado consentimento ativo e arquivo válido, quando parar, então só profissional que atendeu pode consultar.
- [ ] Dada evolução assinada, quando revogar gravação, então evolução continua.

## 6. Testes esperados
Consentimento, limite por chave, parada imediata/offline, corrida upload/revogação, acesso e limpeza local; lint.

## 7. Definition of Done
- [ ] Testes/lint passam, sem tsc; gravação é material auxiliar e acesso do paciente não é habilitado.

## 8. Suposições e pontos em aberto
Prazos de expurgo/backup pendem P-03; paciente leitor P-09.
