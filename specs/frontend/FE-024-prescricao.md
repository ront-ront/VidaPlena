# FE-024 - Prescrição e assinatura de desenvolvimento

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, FE-023, BE-039
- **Requisitos cobertos:** RF-019, RN-009

## 1. Objetivo
Permitir prescrição estruturada no atendimento, mostrando alergias e o nível jurídico real da assinatura/arquivo emitido.

## 2. Escopo
- Inclui: formulário de medicamento/posologia, busca/reuso, ciência de alergia, draft, emitir/anular e selo dev.
- NÃO inclui: prescrição válida com ICP-Brasil sem provider, dispensação ou fluxo de controlados ainda não aprovado.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (prescrição), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m2` (medications/documents), DRS §3.3.4, Q-10 e P-02/P-13.

## 4. Detalhamento
- Layout proposto Q-14 em `/prontuarios/[patientId]/prescricao`: cabeçalho do paciente/atendimento FE-021, busca local de medicamento, linhas de dose/via/frequência/quantidade/orientações, botão Reusar como novo draft, painel de alergias e ação Emitir. Unidades e labels sempre visíveis; erros por campo não limpam linhas válidas.
- Alerta de alergia interrompe emissão até ciência explícita registrada no servidor; conteúdo ainda é draft. Provider indisponível deixa draft e explica próximo passo. Em dev, resultado `issued_dev` mostra selo **“sem validade jurídica”** em lista, prévia e download; não usar aparência de receita válida.
- Documento emitido tem código de verificação, data/autoria, status/anulação; correção inicia novo draft e anula anterior com motivo. Loading/erro/sucesso, tablet/teclado e contraste clínico.

## 5. Critérios de aceite
- [ ] Dada alergia associada, quando profissional tentar emitir sem ciência, então UI exige confirmação e API não emite.
- [ ] Dado provider exigido ausente, quando emitir, então documento fica draft e mensagem não declara validade.
- [ ] Dado `issued_dev`, quando visualizar/baixar, então selo sem validade aparece; documento anulado mantém histórico/código.
- [ ] Dada prescrição anterior reutilizada, quando editar cópia, então original permanece imutável.

## 6. Testes esperados
Busca, campos, reuso, alerta/ciência, provider ausente, selo dev/anulação, teclado/tablet e contrato; lint.

## 7. Definition of Done
- [ ] Nível de assinatura e status vêm do contrato, não texto hardcoded de validade.
- [ ] Testes/lint passam; P-02/P-13 visíveis, sem `tsc`.

## 8. Suposições e pontos em aberto
Fonte de medicamentos/controlados P-13 e lista final de assinatura P-02 bloqueiam uso clínico válido; esta tela acadêmica não promete prescrição utilizável em produção.
