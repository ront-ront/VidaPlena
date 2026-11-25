# BE-037 - Alergias, condições críticas e alertas

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** implementada/verificada localmente no escopo de alertas/header; associação à prescrição BE-039 integrada
- **Depende de:** BE-032, BE-004
- **Requisitos cobertos:** RF-018, RN-007

## 1. Objetivo
Registrar alergias e condições críticas com autoria/verificação, exibi-las em todo atendimento e fornecer alerta para prescrição.

## 2. Escopo
- Inclui: `ClinicalAlert`/eventos, criação/leitura/desativação justificada, distinção relato/confirmação e consulta por BE-039.
- NÃO inclui: prescrição (BE-039), exclusão de histórico de alerta ou acesso clínico por recepção.

## 3. Contexto necessário
Ler `specs/shared/data-model.md#m2`, `specs/shared/api-contracts.md#m2` (alerts), `specs/shared/access-policy.md`, DRS §3.3.3 e Design System §18.1.

## 4. Detalhamento
- Profissional com vínculo de atendimento registra tipo (alergia, condição, medicamento contínuo, outro), termo, substância quando houver, estado `reported/confirmed`, autor/data. Alertas ativos aparecem no cabeçalho permanente RF-016 e em consultas posteriores, com texto/ícone além de cor.
- Desativação exige justificativa e cria `ClinicalAlertEvent`; evento original permanece. Prescrição consulta alergias ativas e exige ciência explícita para item relacionado; normalização de substância usa catálogo P-13, sem inferir ausência de alergia por falha de mapeamento.
- Leitura/mutação auditadas com vínculo; API não entrega alerta clínico a recepção/gestor/admin/DPO por papel.

## 5. Critérios de aceite
- [x] Dado alerta registrado, quando outro atendimento autorizado abrir prontuário, então alerta aparece com autor/data e estado de verificação.
- [x] Dado alerta relatado e não confirmado, quando mostrar, então rótulo “relatado” impede aparência de confirmação clínica.
- [x] Dada remoção sem justificativa, quando tentar, então 400; com motivo, estado inativo aparece no histórico sem DELETE.
- [x] Dado usuário sem vínculo, quando consultar alerta, então 404 e negativa auditada.

## 6. Testes esperados
Tipos, relato/confirmação, desativação, histórico, autorização, exibição via RF-016 e associação de alergia com BE-039; lint.

## 7. Definition of Done
- [x] Alertas versionados/auditados e disponíveis no header clínico.
- [x] Testes/lint passam; conteúdo clínico isolado, sem `tsc`.

## 8. Suposições e pontos em aberto
Vocabulário de substâncias/medicamentos exige fonte P-13. Alertas sem código estruturado devem continuar visíveis, mas não podem ser declarados “sem interação” automaticamente.

## Evidência local —25/11/2026

ClinicalAlert/ClinicalAlertEvent append-only, payload/justificativas cifrados, transições confirm/deactivate com versão/locks, autoria/data preservadas e auditoria transacional. Header usa todos os ativos, inclusive pré-consulta, sem histórico/justificativas; lista paginada aplica paciente/estado antes do limite. Sem vínculo nega, urgência só lê; nenhum acesso por papel administrativo/DPO. Criação requer evento inicial no commit do banco; UPDATE/DELETE/TRUNCATE são bloqueados.

10/10 integrações específicas aprovadas (`/tmp/vidaplena-be037-final-integration.log`), incluindo novo atendimento, pós-consulta somente leitura, concorrência e rollback de auditoria;28/28 Node,2/2 Vitest e lint285 aprovados. Associação com medicamento/ciência na prescrição integra BE-039 (ver nota de integração abaixo); substanceCode opaco não atesta mapeamento nem ausência de alergia, conforme P-13/P-63. Nenhum tsc ou alteração em banco dev.

Regressão BE-030–037:82/82 aprovadas (`/tmp/vidaplena-be037-regression.log`, sessão42101 saída0); revisão específica10/10 inclui um caso adicional de novo atendimento e prova de evento inicial obrigatório. Conjuntos sobrepostos, não somar como92 testes distintos.

**Integração BE-039:** alergia estruturada, textual e item manual conferidos antes da emissão, ciência com versão/autor em transação e alerta novo entre preview/issue testados;14/14 específicos e110/110 regressão aprovados. FE-023/024 ainda pendentes, P-13 clínico/terminológico permanece.
