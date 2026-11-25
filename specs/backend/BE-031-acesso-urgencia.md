# BE-031 - Acesso de urgência, expiração e revisão

- **Software:** back
- **Milestone:** M2 Prontuário
- **Status:** implementada e verificada localmente; integração da leitura de prontuário em BE-032 pendente
- **Depende de:** BE-030, BE-004, BE-006
- **Requisitos cobertos:** RF-023, RN-007, RNF-015

## 1. Objetivo
Conceder a profissional sem vínculo um acesso excepcional temporário, justificado, notificado e integralmente auditado.

## 2. Escopo
- Inclui: `EmergencyAccessGrant`, solicitação, expiração automática, evento destacado, aviso admin/DPO e revisão posterior.
- NÃO inclui: vínculo permanente, acesso por recepção/gestor/admin ou leitura clínica não auditada.

## 3. Contexto necessário
Ler `specs/shared/api-contracts.md#m2` (urgência), `specs/shared/data-model.md#m2`, `specs/shared/access-policy.md`, `specs/shared/parameters.md` (`emergency_access.duration_minutes`), DRS §3.3.8 e Q-16/Q-21.

## 4. Detalhamento
- Somente profissional autenticado pode solicitar; justificar antes de conceder. Grant guarda paciente, autor, prazo calculado pela chave e estado. Cada acesso clínico usa grant ID em AuditEvent; expiração/inativação revoga imediatamente, inclusive sessão aberta.
- BE-006 envia aviso essencial ao admin e ao detentor de `privacy.dpo`, sem conteúdo clínico; ausência de DPO gera alerta ao admin. Revisão por direção/admin/DPO registra resultado e hora, sem permitir editar grant ou trilha.
- Tela FE-028 apresenta responsabilidade e tempo; backend valida novamente em toda leitura. Regra de justificativa/expiração/auditoria nunca é configurável para desligar.

## 5. Critérios de aceite
- [x] Dada justificativa vazia ou papel não profissional, quando solicitar, então 400/403 e zero acesso.
- [ ] Dado grant válido, quando ler prontuário, então cada leitura registra grant/ator/origem e aviso é criado.
- [x] Dado prazo `emergency_access.duration_minutes` vencido, quando repetir leitura, então 404/negação auditada sem depender de botão de sair.
- [x] Dada revisão, quando registrar, então evento anterior continua imutável e resultado fica associado; admin/DPO não vê conteúdo clínico.

## 6. Testes esperados
Justificativa, papel, expiração com relógio, requisição simultânea ao vencimento, aviso/falha, auditoria reforçada e revisão; lint.

## 7. Definition of Done
- [ ] Exceção única ao vínculo, com prazo por chave e revogação automática.
- [x] Testes/lint passam; nenhum atalho para admin, sem `tsc`.

## 8. Suposições e pontos em aberto
Pessoa responsável pela revisão periódica e texto do aviso dependem da clínica/P-08; a fila e os eventos não podem ser omitidos enquanto isso.

## Evidência local —24/11/2026

Concessões/revisões append-only no PostgreSQL, textos cifrados, avisos admin/DPO na mesma transação via BE-006, fila/detalhe administrativos sem conteúdo clínico, revisão única/rejeição imediata e guard compartilhado de leitura implementados. A revisão não altera o prazo. Contrato P-57 concretiza outcomes/paginação/notas. O aceite de leitura de prontuário e a exceção integral ao vínculo continuam abertos até BE-032 consumir o guard em rotas clínicas reais.

22/22 integrações (10 BE-030,10 BE-031,2 BE-006),28/28 Node e lint231 aprovados. Evidência: `/tmp/vidaplena-be031-regression.log` (saída0). Testes cobrem prazo/concorrência, inativação/MFA/papel, auditoria, outbox atômica e retry, fila, revisão e mutações SQL proibidas. Teste inicial9/10 corrigido para ler `AuditEvent.metadataSafe`, sem alteração de política. Sem tsc/banco de desenvolvimento; produção segue dependente da validação clínica/jurídica já registrada.
