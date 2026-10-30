# BE-004 - Escrita imutável da trilha de auditoria

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada (verificação local de imutabilidade e rollback)
- **Depende de:** BE-002, BE-003
- **Requisitos cobertos:** RF-032, RNF-015

## 1. Objetivo
Criar a trilha append-only usada desde a primeira operação sensível. A consulta/exportação administrativa completa fica em BE-050.

## 2. Escopo
- Inclui: modelo `AuditEvent`, porta `AuditWriter`, adapter persistente, contexto de ator/requestId/origem e retenção mínima.
- NÃO inclui: tela/endpoint de pesquisa, conteúdo clínico no log, edição/exclusão por API.

## 3. Contexto necessário
Ler `specs/shared/data-model.md` (`AuditEvent`), `specs/shared/access-policy.md`, `specs/shared/api-contracts.md` (“Eventos internos M0”), DRS §§3.5.5/4.4.4.

## 4. Detalhamento
- Persistir ator, perfil/permissão, data/hora, ação, tipo/ID do recurso, paciente quando aplicável, origem, requestId e base de autorização, com metadados permitidos. Nunca guardar senha, token, payload clínico ou arquivo.
- Eventos de acesso, inclusão, alteração, exportação, falha de autorização e autenticação usam a mesma porta; cada use case posterior declara eventos específicos. Falha ao auditar mutação sensível não permite sucesso silencioso; integrar à mesma unidade de trabalho transacional quando possível.
- Não expor UPDATE/DELETE de auditoria a papel algum, inclusive admin; preservar `privacy.audit_retention_years` mínimo. Consulta da trilha também gera evento quando BE-050 for criado.

## 5. Critérios de aceite
- [ ] Dada alteração sensível concluída, quando consultar armazenamento de teste, então evento contém ator, ação, recurso, hora, origem e requestId.
- [ ] Dada falha de gravação da auditoria em mutação transacional, quando confirmar, então operação sensível não retorna sucesso parcial.
- [ ] Dado admin, quando tentar editar/apagar evento por API, então não existe rota/capacidade para fazê-lo.
- [ ] Dado payload com senha ou evolução, quando gerar evento, então metadados persistidos não contêm esse conteúdo.

## 6. Testes esperados
Integração de escrita com rollback, imutabilidade por API e sanitização de metadados; teste de retenção/configuração. Lint do backend.

## 7. Definition of Done
- [ ] Migration, porta e adapter de escrita auditável; sem endpoint de exclusão.
- [ ] Eventos críticos verificáveis e sanitizados; testes/lint passam.
- [ ] BE-050 continua responsável pela pesquisa/exportação.

## 8. Suposições e pontos em aberto
WORM físico/armazenamento externo não está selecionado; imutabilidade por aplicação/conta de banco e evidência operacional devem ser detalhadas antes de declarar RNF-015 integral em produção.
