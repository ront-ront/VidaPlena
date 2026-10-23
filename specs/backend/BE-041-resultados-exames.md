# BE-041 - Anexo de resultados e aviso ao profissional

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** BE-040, BE-013, BE-006
- **Requisitos cobertos:** RF-020, RN-012

## 1. Objetivo
Receber resultado de exame por paciente/recepção, vinculá-lo ao pedido ou marcar origem externa e avisar profissional solicitante.

## 2. Escopo
- Inclui: `ExamResult`, upload validado, associação/externo, aviso, acesso restrito, retenção e auditoria.
- NÃO inclui: laboratório integrado, leitura clínica pela recepção ou diagnóstico automático.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m2` (exam-results), `specs/shared/data-model.md#m2`, `specs/shared/parameters.md` (Arquivos), `specs/shared/access-policy.md`, DRS §3.3.5 e Q-17.

## 4. Detalhamento
- Multipart pelo BE-013 valida tipo real, tamanho `file.result_max_mb`, quantidade `file.max_per_record`, cifra e armazena antes de associar; rollback/compensação limpa órfão. Paciente/responsável envia apenas próprio/dependente. Recepção faz upload assistido **sem leitura posterior do conteúdo**; endpoint de download revalida vínculo/permissão atual e audita cada acesso.
- Se `orderId` existir, conferir mesmo paciente e ligar ao solicitante; sem pedido, marcar `origin=external` no histórico. Evento BE-006 informa profissional sem anexar dado clínico ao aviso. Arquivo integra prontuário e segue RN-012, mas não é publicado ao paciente por mera presença: BE-043 controla projeção.
- Pedido pendente perde status de pendente após resultado válido, sem apagar registro de alerta anterior.

## 5. Critérios de aceite
- [ ] Dado arquivo acima de `file.result_max_mb`, tipo inválido ou extensão falsificada, quando enviar, então 422 e nenhum resultado acessível.
- [ ] Dado `orderId` de outro paciente, quando enviar, então 403/404 e nenhum vínculo indevido.
- [ ] Dada recepção que enviou resultado, quando tentar baixar conteúdo depois, então acesso negado e auditado.
- [ ] Dado resultado sem pedido, quando consultar histórico autorizado, então “origem externa” aparece; com pedido, profissional solicitante recebe aviso seguro.

## 6. Testes esperados
Arquivo falso/tamanho, associação/externo, IDOR, acesso cego da recepção, notificação e auditoria de download/retention; lint.

## 7. Definition of Done
- [ ] Usa FileStorage M0 sem rota estática, origem explícita e aviso mínimo.
- [ ] Testes/lint passam; prontuário preservado, sem `tsc`.

## 8. Suposições e pontos em aberto
Limites finais de arquivo e suporte DICOM permanecem P-09. A política de publicação de resultados ao paciente segue Q-03/BE-043.
