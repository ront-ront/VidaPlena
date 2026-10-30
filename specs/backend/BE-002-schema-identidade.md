# BE-002 - Schema Prisma inicial e migrations de identidade

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada (verificada em PostgreSQL isolado)
- **Depende de:** BE-001
- **Requisitos cobertos:** RF-001, RF-029, RNF-012

## 1. Objetivo
Criar do zero o modelo persistido mínimo de identidade, paciente, responsável, papéis e sessões, com migrations reprodutíveis. Nenhum arquivo Prisma gerado anterior define o contrato.

## 2. Escopo
- Inclui: entidades M0 de `shared/data-model.md`, constraints, índices e migration inicial; seed de dados de referência sem conta admin (BE-007).
- NÃO inclui: casos de uso de cadastro/login, tabelas de agenda/clínica e dados reais.

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `specs/shared/data-model.md` (“M0”), `specs/shared/access-policy.md`, `specs/backend/architecture.md` e Q-05/Q-20/Q-23 em `specs/04-open-questions.md`.

## 4. Detalhamento
- Definir `User`, `Role`, `Permission`, atribuições, `PatientProfile`, `GuardianLink`, `Invitation`, `OneTimeToken`, `Session`, `PasswordHistory` e estruturas de suporte M0 no schema Prisma, em migration versionada. Se auditoria/consentimento/arquivos forem criados por BE-004/011/013, usar migrations separadas dessas specs; aqui criar somente chaves de referência necessárias.
- E-mail normalizado único por conta e CPF normalizado único por paciente. FKs impedem vínculo órfão; contas inativas permanecem. Índices para busca por CPF/e-mail/status; hash/tokens não armazenados em claro.
- Repository adapters Prisma ficam em `infrastructure/persistence/prisma`, com portas internas; migrations não carregam regra de negócio no controller.

## 5. Critérios de aceite
- [ ] Dado banco vazio, quando aplicar migrations, então tabelas/índices surgem e aplicação sobe sem dados de paciente reais.
- [ ] Dado CPF ou e-mail normalizado duplicado, quando gravar, então constraint impede duplicidade mesmo com requisições concorrentes.
- [ ] Dado responsável com dois dependentes, quando consultar relações, então ambos persistem sem compartilhar acesso com outro usuário.
- [ ] Dada conta inativa com histórico, quando consultar FK/auditoria, então a conta continua referenciável; exclusão física não é fluxo da aplicação.

## 6. Testes esperados
Migração em banco de teste vazio, constraints únicas/FK e leitura das relações; não usar artefatos gerados antigos como fixture. Lint do backend.

## 7. Definition of Done
- [ ] Schema novo, migration e adapters limitados a identidade M0.
- [ ] Integridade validada em teste pertinente; contratos de `data-model.md` respeitados.
- [ ] Lint passa; nenhum `tsc` foi usado para testes.

## 8. Suposições e pontos em aberto
Reuso de e-mail de conta inativa e quantidade de senhas anteriores (P-05) não estão decididos; schema admite histórico sem fixar a política.
