# FE-026 - Emissão e consulta de documentos clínicos

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-042
- **Requisitos cobertos:** RF-021, RN-009

## 1. Objetivo
Permitir ao profissional criar atestado, declaração, relatório ou encaminhamento e consultar o documento emitido com seu nível real de assinatura.

## 2. Escopo
- Inclui formulário por tipo, rascunho, emissão, anulação e download. NÃO inclui prescrição/pedido de exame (FE-024/025) nem configuração do catálogo (FE-041).

## 3. Contexto necessário
Ler DRS §3.3.6, Q-10, specs/shared/api-contracts.md#m2 (documents), specs/shared/data-model.md#m2, specs/frontend/design-system.md e specs/frontend/screens-map.md.

## 4. Detalhamento
Layout proposto Q-14 em /prontuarios/[patientId]/documentos: header clínico FE-021, seletor de tipo, campos do modelo, prévia, ação salvar/emitir, lista de versões e estado de assinatura. Mostrar nível exigido recebido do catálogo; emissão por DevSignatureProvider mostra selo “sem validade jurídica” e nunca aparência de documento ICP-Brasil. Anulação exige motivo e não altera original; download passa por endpoint autenticado/auditado. Loading, vazio, erro de validação/provider e sucesso com foco acessível; texto e ícone além de cor.

## 5. Critérios de aceite
- [ ] Dado tipo que exige qualificada, quando só houver provider dev, então a prévia e emissão ficam marcadas sem validade jurídica.
- [ ] Dado provider indisponível, quando emitir, então rascunho persiste e não há documento emitido.
- [ ] Dado documento emitido, quando anular com motivo, então original segue consultável como anulado e novo evento é auditado.
- [ ] Dado usuário sem vínculo, quando acessar URL direta, então nenhum conteúdo é mostrado..

## 6. Testes esperados
Validar formulário por tipo, rascunho, estado dev, falha de assinatura, anulação/versionamento, autorização de download e acessibilidade; lint.

## 7. Definition of Done
- [ ] Contrato e nível do catálogo respeitados; critérios/testes e lint pertinentes passam, sem tsc; sem emissão real presumida.

## 8. Suposições e pontos em aberto
P-02 exige validação jurídica dos níveis e provider real antes de produção.
