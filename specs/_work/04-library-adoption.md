# Adoção de bibliotecas na implementação M0

**Decisão solicitada pelo usuário em 29/10/2026.** Referência examinada: [`BarberHubAPI`](https://github.com/Yan-CarlosIF/BarberHubAPI), commit da branch `main` baixado para `/tmp/vidaplena-barberhub-reference`. Foram lidos `package.json`, `docs/architecture.md` (171 linhas), configuração de ambiente, container, app Express, schema de login, controller, serviço, teste HTTP e configuração de testes. O arquivo grande `docs/openapi.ts` foi examinado por amostra para identificar o padrão, sem alegar leitura integral.

## Decisão por finalidade

| Finalidade | Escolha para VidaPlena | Justificativa e limite |
| --- | --- | --- |
| Validação de ambiente e contratos HTTP | Zod 4 | Já aplicado ao ambiente. Os próximos endpoints passam a usar schemas de entrada compartilhados com a documentação. Erros mantêm o envelope definido em `shared/api-contracts.md` e não expõem valores submetidos. |
| Injeção de dependências | TSyringe e `reflect-metadata` | Container montado no composition root, com registros explícitos de portas e factories. Uma instância isolada por app/teste; regras de domínio não importam o container. Evita registro global e metadata/decorators no domínio. |
| Documentação executável da API | `zod-openapi` e Scalar | OpenAPI 3.1 gerado dos schemas Zod e publicado em rota documental; apenas endpoints efetivamente implementados. `specs/shared/api-contracts.md` permanece a fonte de regras e o OpenAPI deve ser testado contra as rotas. Scalar é UI da documentação. Não instalar Swagger UI duplicado. |
| Testes HTTP e de comportamento | Vitest e Supertest quando forem introduzidos | Preferidos para novas suites de rota e integração, com banco de testes isolado. Os testes Node já existentes continuam válidos até migração controlada; não duplicar suites sem razão. |
| Autenticação | `jose` JWT, `otpauth` TOTP, `bcryptjs` bcrypt | Bibliotecas já escolhidas na BE-008/007. A migração para `jsonwebtoken`/`bcrypt` nativo não acrescentaria requisito; avaliar bcrypt nativo se medição justificar. |
| Persistência | Prisma/PostgreSQL | Mantém schema do zero e migrations por spec. |

**Critério de escolha:** uso atual verificado em documentação oficial e adequação ao requisito. Popularidade genérica não é critério suficiente para trocar framework, autenticação ou banco. A referência BarberHubAPI orienta a organização modular e o uso de schemas, container e documentação, sem copiar políticas de autenticação incompatíveis com RBAC/DPO, consentimento e vínculo assistencial do VidaPlena.

**Próximo passo técnico:** aplicar container e schemas aos endpoints M0 já implementados, gerar o OpenAPI a partir desses schemas, e concluir BE-008. Continuar BE-009 em diante apenas após os testes e atualização da matriz.
