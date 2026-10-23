# FE-029 - Entrada e conferência de histórico importado

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-033
- **Requisitos cobertos:** RF-016, RF-022, RNF-005

## 1. Objetivo
Dar entrada identificada a histórico manual legado e permitir conferência clínica, sem confundi-lo com evolução assinada.

## 2. Escopo
- Inclui metadados, arquivo, prévia, conferência pelo profissional e adendo de correção. NÃO inclui migração em massa/OCR ou edição do original.

## 3. Contexto necessário
Ler DRS §2.6/§3.3.1/§4.2.1, Q-19, specs/shared/api-contracts.md#m2 (imported-history), specs/shared/access-policy.md e P-11 em specs/04-open-questions.md.

## 4. Detalhamento
Layout proposto Q-14 em /importacoes/historico: identificação do paciente, origem/data/autor anterior/importador, anexo, resumo de conferência, indicador Histórico importado e ação Registrar. Admin/gestor só podem executar o fluxo após P-11 definir conteúdo permitido; sem isso a ação clínica permanece bloqueada. Profissional vinculado vê item e marca Conferido por mim, com data; correção por adendo justificado. Loading, vazio, erro de arquivo/autorização e sucesso.

## 5. Critérios de aceite
- [ ] Dada P-11 sem decisão, quando admin tentar enviar conteúdo clínico, então interface não permite gravação.
- [ ] Dado item importado, quando profissional o abrir, então origem/importador e natureza não assinada aparecem.
- [ ] Dado correção, quando salvar, então adendo é exibido junto e original permanece.
- [ ] Dado paciente importado sem consentimento, quando abrir portal, então acesso digital é negado..

## 6. Testes esperados
Bloqueio P-11, importado imutável, conferência, adendo, permissão, arquivo e estados; lint.

## 7. Definition of Done
- [ ] Fluxo segue contrato BE-033 e não concede leitura clínica por papel administrativo; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Bloqueada para conteúdo até resolução P-11; data de corte/fonte real em P-07.
