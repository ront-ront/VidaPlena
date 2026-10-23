# FE-040 - Envio de resultados pelo paciente e recepção

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-003, FE-004, FE-027, BE-041
- **Requisitos cobertos:** RF-020, RNF-021

## 1. Objetivo
Permitir envio de resultado externo pelo próprio paciente/responsável ou por recepção sem conceder leitura clínica à recepção.

## 2. Escopo
- Inclui seleção de pedido/paciente, arquivo, validação e recibo. NÃO inclui análise clínica, leitura do conteúdo pela recepção ou DICOM.

## 3. Contexto necessário
Ler DRS §3.3.5, Q-17, specs/shared/api-contracts.md#m2 (exam-results), specs/shared/parameters.md (file.result_formats, file.result_max_mb, file.max_per_record), specs/shared/access-policy.md.

## 4. Detalhamento
Layout proposto Q-14 em /meu-historico/exames/enviar e /recepcao/exames/enviar: identificação autorizada, pedido opcional quando resultado externo, nome/origem/data, seletor de arquivo e aviso de privacidade. Recepção vê só metadados, protocolo e estado, nunca prévia ou download. Paciente só vê resultados publicados via FE-027. Progresso, erro de tipo/tamanho/conteúdo falso, falha de rede e sucesso com protocolo. BE-013 valida conteúdo real; aviso ao profissional via BE-041.

## 5. Critérios de aceite
- [ ] Dado PDF/JPG/PNG permitido dentro de file.result_max_mb, quando enviar, então recibo registra arquivo e profissional é avisado.
- [ ] Dado extensão falsificada ou tamanho excedido, quando enviar, então arquivo é recusado sem registro clínico.
- [ ] Dada recepção, quando abrir protocolo, então metadados aparecem, mas conteúdo/download é negado.
- [ ] Dado consentimento revogado, quando paciente tentar envio no portal, então acesso é bloqueado..

## 6. Testes esperados
Upload válido/inválido, falsificação, limite por chave, revogação, autorização da recepção e aviso; lint.

## 7. Definition of Done
- [ ] Sem leitura clínica pela recepção; critérios/testes e lint passam, sem tsc.

## 8. Suposições e pontos em aberto
DICOM e limites finais são P-09.
