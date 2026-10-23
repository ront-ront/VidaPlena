# BE-045 - Sessão, autorização e sinalização WebSocket

- **Software:** back
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** BE-044, BE-030, BE-006
- **Requisitos cobertos:** RF-025, RN-010, RNF-011, RNF-014

## 1. Objetivo
Criar sessão 1:1 online com sinalização WebSocket protegida atrás de VideoSessionProvider, sem processar mídia.

## 2. Escopo
- Inclui autorização, ticket curto, participantes, sinalização, estados e expiração. NÃO inclui gravação, transcrição, SFU ou mídia no backend.

## 3. Contexto necessário
Ler DRS §3.4.2/§4.3.3/§4.4.3, Q-12, shared/api-contracts.md#m3 (sessions/WebSocket), shared/data-model.md#m3, backend/architecture.md e P-10.

## 4. Detalhamento
VideoSessionProvider isola adaptador P2P; POST sessions valida consulta online, consentimento, vínculo/GuardianLink, pré-teste e cria uma sessão ativa. Ticket de WebSocket de uso único tem escopo por sessão/participante. join/offer/answer/ICE/leave usam seq e validação de tamanho/taxa; sinalizador não armazena SDP/ICE nem passa mídia. Encerramento/revogação fecha conexões. Estado de desconexão e reconexão respeita RNF-008; áudio prioritário e 720p/30fps são metas do cliente/BE-052, nunca garantia por criar socket. Logs sem SDP/ICE; auditam participantes e eventos de ciclo.

## 5. Critérios de aceite
- [ ] Dada consulta sem consentimento, quando criar sessão, então 403.
- [ ] Dado ticket de outro usuário/sessão ou reutilizado, quando conectar, então conexão é recusada.
- [ ] Dado candidato ICE válido, quando sinalizar, então somente o outro participante da mesma sessão recebe.
- [ ] Dada revogação/encerramento, quando enviar evento, então é recusado.
- [ ] Dado WebSocket ativo, quando observar tráfego servidor, então não há fluxo de mídia.

## 6. Testes esperados
Integração WebSocket com isolamento, replay/ticket, limites, desconexão/reconexão, auditoria sem payload e lint.

## 7. Definition of Done
- [ ] Migração e portas/adaptadores nas camadas corretas; testes/lint passam, sem tsc; RNF-014 permanece parcial.

## 8. Suposições e pontos em aberto
STUN/TURN/fallback e aferição de banda dependem P-10; E2E pleno P-04.
