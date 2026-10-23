# FE-037 - Pesquisa e exportação de auditoria

- **Software:** front
- **Milestone:** M4 Gestão
- **Status:** pendente
- **Depende de:** FE-003, BE-050
- **Requisitos cobertos:** RF-032, RNF-015

## 1. Objetivo
Dar a admin e detentor de privacy.dpo pesquisa cronológica dos eventos relevantes e exportação sem edição.

## 2. Escopo
- Inclui filtros, tabela, destaque urgência/permissão e exportação. NÃO inclui conteúdo clínico ou alteração de eventos.

## 3. Contexto necessário
Ler DRS §3.5.5/§4.4.4, Q-20, shared/api-contracts.md#m4 (audit), shared/access-policy.md, frontend/design-system.md.

## 4. Detalhamento
Layout proposto Q-14 em /admin/auditoria: filtros período/ator/paciente/evento, tabela data/hora/ator/ação/recurso/origem, destaque textual+ícone para urgência e mudança de permissão, paginação cursor, exportar com motivo e status job. Admin e privacy.dpo podem entrar conforme contrato; gestor sem permissão não. DPO jamais recebe botão para abrir evolução/anexo/gravação. Loading, vazio, 403, erro de exportação e sucesso; filtro paciente por ID autorizado sem conteúdo clínico. Consulta/exportação auditadas no servidor.

## 5. Critérios de aceite
- [ ] Dado usuário sem permissão, quando abrir, então 403 e tabela limpa.
- [ ] Dado DPO, quando listar, então só metadados aparecem.
- [ ] Dado acesso urgente, quando filtrar, então destaque textual aparece.
- [ ] Dada exportação sem motivo, quando solicitar, então erro.
- [ ] Dada consulta, quando concluir, então evento de consulta é gravado.
- [ ] Dado qualquer perfil, quando procurar editar/apagar, então nenhuma ação existe.

## 6. Testes esperados
Autorização, filtros/paginação, destaque acessível, exportação e auditoria de leitura; lint.

## 7. Definition of Done
- [ ] Sem edição de trilha nem links clínicos; testes/lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Designação formal DPO P-08.
