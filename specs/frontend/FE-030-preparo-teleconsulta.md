# FE-030 - Termo, preparo e teste de dispositivos

- **Software:** front
- **Milestone:** M3 Teleconsulta
- **Status:** pendente
- **Depende de:** FE-014, BE-044, BE-045
- **Requisitos cobertos:** RF-024, RF-025, RNF-025

## 1. Objetivo
Obter consentimento específico e testar câmera, microfone e banda antes da confirmação e novamente ao entrar.

## 2. Escopo
- Inclui termo versionado, aceite/recusa, permissões locais, teste e alternativa presencial. NÃO inclui vídeo em sala (FE-031/032).

## 3. Contexto necessário
Ler DRS §3.4.1–2/§4.7.3, Q-12, shared/api-contracts.md#m3 (terms/sessions), shared/parameters.md e frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14 em /teleconsultas/[id]/preparo: termo em seção legível com versão e aceite explícito por titular/responsável; cards de câmera/mic/rede com status textual, botão Testar novamente e navegação. Ao habilitar M3, o mesmo componente de pré-teste é inserido na confirmação online de FE-013 e reaberto na entrada; RNF-025 pede pelo menos 2 Mbps nos dois sentidos, mas método de medição é P-10. Sem câmera/mic/permissão/rede suficiente, mostrar orientação acionável e rota para solicitar presencial; não mudar modalidade automaticamente sem BE-020. Loading, bloqueio, erro do browser e sucesso.

## 5. Critérios de aceite
- [ ] Dado termo recusado, quando avançar, então vídeo não abre e opção presencial é exibida.
- [ ] Dado responsável sem vínculo, quando consentir, então 403.
- [ ] Dado permissão de câmera negada, quando testar, então status e instrução aparecem.
- [ ] Dado teste de confirmação antigo, quando entrar, então teste é reexecutado.
- [ ] Dado banda abaixo do mínimo RNF-025, quando avaliar, então alerta impede entrar como se estivesse apto.

## 6. Testes esperados
Consentimento/versão, pré-teste repetido, permissões, banda/fallback e acessibilidade; lint.

## 7. Definition of Done
- [ ] Não afirmar medição exata sem método P-10; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
P-10 define STUN/TURN e medição; termo depende P-12.
