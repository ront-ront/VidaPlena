# FE-031 - Sala de espera e vídeo do paciente

- **Software:** front
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** FE-030, BE-045
- **Requisitos cobertos:** RF-025, RNF-008, RNF-018, RNF-019, RNF-023

## 1. Objetivo
Oferecer sala de espera e chamada 1:1 ao paciente com estado de conexão e recuperação de interrupção.

## 2. Escopo
- Inclui espera, WebRTC P2P, controles áudio/vídeo, aviso de conexão e saída. NÃO inclui gravação/arquivos (FE-033/034).

## 3. Contexto necessário
Ler DRS §3.4.2/§4.2.4/§4.5/§4.7.1, Q-12, shared/api-contracts.md#m3 (WebSocket), frontend/design-system.md e frontend/screens-map.md.

## 4. Detalhamento
Layout proposto Q-14 em /teleconsultas/[id]/sala: cabeçalho da consulta, status de espera, vídeo remoto dominante, self-view menor, barra de microfone/câmera/sair, estado textual de rede e instruções. VideoSessionProvider no cliente cria RTCPeerConnection, WebSocket só sinaliza; mídia usa DTLS-SRTP. Reconexão por até 60 s conforme RNF-008 preserva sessão se autorizada, depois informa falha. Responsivo em 360 px/tablet sem extensão; testar Chrome/Edge/Firefox/Safari versões exigidas RNF-023. Aviso explícito de gravação somente quando FE-034 registrar aceite. Loading, profissional ausente, offline, reconectando, erro definitivo e chamada encerrada.

## 5. Critérios de aceite
- [ ] Dado paciente antes do profissional, quando entrar, então espera aparece sem vídeo de outro atendimento.
- [ ] Dada queda curta, quando rede voltar dentro de RNF-008, então reconecta sem duplicar sessão.
- [ ] Dada sessão encerrada, quando reutilizar ticket, então acesso é negado.
- [ ] Dado viewport móvel, quando usar controles, então todos têm label e foco alcançável.
- [ ] Dado consentimento revogado, quando receber evento, então mídia para.

## 6. Testes esperados
Fluxos espera/conexão/reconexão, isolamento, navegador/teclado/mobile e revogação; lint.

## 7. Definition of Done
- [ ] Testes/lint passam, sem tsc; qualidade de vídeo é medida BE-052.

## 8. Suposições e pontos em aberto
Fallback de conectividade P-10; RNF-014 permanece parcial P-04.
