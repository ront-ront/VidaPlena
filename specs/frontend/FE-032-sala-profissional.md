# FE-032 - Sala de vídeo e prontuário do profissional

- **Software:** front
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** FE-021, FE-030, BE-045
- **Requisitos cobertos:** RF-025, RN-007, RNF-011, RNF-023

## 1. Objetivo
Permitir ao profissional conduzir vídeo e acessar prontuário do paciente vinculado na mesma jornada.

## 2. Escopo
- Inclui sala, painel clínico autorizado e controles de chamada. NÃO inclui arquivo/gravação (FE-033/034) nem nova evolução fora FE-022.

## 3. Contexto necessário
Ler DRS §3.4.2, RN-007, Design System §§18/32, shared/access-policy.md, shared/api-contracts.md#m3 e frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14: vídeo com self-view/controle lateral e painel FE-021 com identificação, alertas e timeline; em tablet painéis alternam sem perder chamada. Entrada exige profissional da consulta e vínculo clínico ativo; a API revalida leitura do prontuário, grava auditoria com linkId. Sinalização segue VideoSessionProvider; nunca registrar SDP/ICE em UI de auditoria. Estados de paciente aguardando, conexão instável, áudio prioritário, painel negado, expiração e encerramento. Qualidade RNF-011 é alvo mensurado BE-052.

## 5. Critérios de aceite
- [ ] Dado profissional de outra consulta, quando entrar, então 403 e nenhuma mídia clínica.
- [ ] Dado vínculo expirado mas sessão ativa, quando abrir prontuário, então API nega leitura.
- [ ] Dado painel clínico negado, quando chamada continuar, então dado anterior não permanece.
- [ ] Dada perda de banda, quando adaptar, então áudio é priorizado e estado aparece.
- [ ] Dado dispositivo móvel/tablet, quando alternar painéis, então chamada permanece.

## 6. Testes esperados
Isolamento de sessão/vínculo, estados, adaptação, responsividade e navegadores RNF-023; lint.

## 7. Definition of Done
- [ ] Sem duplicar editor FE-022; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Campos entre especialidades P-06; conectividade P-10.
