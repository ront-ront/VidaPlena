# Implementação M2 —24/11/2026

Objetivo integral: implementar BE-030–043 eFE-021–029/040/041 (25 specs), uma por vez, com commits por entregável validado. Repositório inicialmente limpo em `db415e5` (M1 já commitada pelo usuário). Não iniciar M3. Não executar tsc; verificação estática por lint.

## Decisões recebidas

P-06: proposta provisória de acesso aprovada; P-11: entrada cega aprovada; P-13: testes simples em desenvolvimento solicitados, sem promessa de catálogo clínico real. Respostas registradas em `04-open-questions.md`; parâmetros/política/contrato atualizados antes do código.

## Sequência e commits

1. BE-030 vínculos, sincronização/reconciliação, guard.
2. BE-031 urgência; BE-032 leitura.
3. BE-033 entrada cega/histórico.
4. BE-034 catálogos locais versionados dev.
5. BE-035 rascunhos; BE-036 finalização/adendo.
6. BE-037 alertas; BE-038 assinatura/catálogo.
7. BE-039 prescrição; BE-040/041 exames/resultados.
8. BE-042 documentos; BE-043 publicação/projeção própria.
9. FE-021–029/040/041, seguindo dependências topológicas.

Cada spec deve ser testada e registrada na matriz antes da próxima. Commits por spec ou grupo coeso já validado; nenhuma cobertura antecipada. BE-030 fundação commitada em `2e9f6b3`; continuidade em BE-031 e demais specs pendentes.

## BE-030 — fundação verificada

Migration e sincronização/reconciliação CLI/startup implementadas, guard por paciente/fase e concessões individuais cifradas/auditadas, paginação SQL30+1, schemas HTTP/OpenAPI e configuração Zod. Casos de evolução própria ainda dependem de BE-035/036; nenhuma rota de prontuário criada antecipadamente.

Resultado:89/89 integrações de consumidores (sessão68409), revisão posterior10/10 em `/tmp/vidaplena-be030-audit-final-integration.log` (sessão72700),28/28 Node,2/2 Vitest e lint223. Primeiras falhas foram ambiente: porta do container mudou de32768 para32769 ao reiniciar; migração da fixture exige cwd apps/backend. Bateria inicial6/7 corrigiu expectativa MFA: sessão sem MFA é401 conforme contrato já existente. Nenhuma regra foi enfraquecida. Testes isolados criam/removem sua própria base `_test`; banco dev intocado.

Leituras: constituição48, overview47, ordem150, BE-03039, BE-03138, schema807 linhas originais e booking-store477 linhas originais percorridos no disco. Contratos M2/acesso/valores usados diretamente. Nenhum tsc. Próxima spec BE-031; objetivo completo M2 permanece ativo.

## BE-031 — urgência e revisão verificadas

Novo guard AuthorizeClinical resolve urgência vigente ou CareLink no mesmo escopo transacional, com conta/perfil/papel/MFA frescos. Concessão + auditoria + outbox admin/DPO atômicas; ausência de DPO alerta admin, fila paginada e revisão única imutável sem leitura clínica administrativa. Rejeição encerra o grant, aprovação preserva prazo. Schema/migration e schemas Zod/OpenAPI, prazo configurável `emergency_access.duration_minutes`, justificativa/notas cifradas e notificações sem paciente/conteúdo. Detalhes P-57 no contrato compartilhado antes do código.

22/22 integrações em `/tmp/vidaplena-be031-regression.log` (sessão17481, saída0),28/28 Node (`/tmp/vidaplena-be031-node.log`, sessão16542), lint231 e Prisma validate/generate aprovados. Inicial9/10 falhou só por teste referenciar metadata em vez de metadataSafe; corrigido e regressão passou. Uso real do guard por dados clínicos fica BE-032, sem aceitar cobertura antecipada. Próxima spec BE-032, objetivo integral25 specs mantido.

## BE-032 — leitura e encontros verificados

BE-031 commitada em `0bb8534`. BE-032 lê header/timeline com vínculo/urgência por paciente, escopo pré restrito, recordNumber sem PII e primeira visita. União SQL da agenda M1 completed e índice cifrado append-only, cursor estável/páginas30, origem importada identificada. Endpoint explícito abre encontro/estado in_service/histórico/vínculo em uma transação idempotente, sem alterar reserva. P-58 registrado antes do código. Alertas reais só BE-037; conteúdos fonte nas próximas specs. Autoria própria fora do vínculo ainda BE-035/036.

31/31 regressão BE-030/031/032/006 (`/tmp/vidaplena-be032-regression.log`, sessão37990, saída0), revisão final10/10 com índice cifrado (`/tmp/vidaplena-be032-final-integration.log`, sessão93959, saída0); conjuntos sobrepostos.28/28 Node (`/tmp/vidaplena-be032-node.log`, sessão63741), lint238, Prisma validate/generate e diff aprovados. Massa300 em10 páginas sem duplicação. Falhas iniciais: fixture precisava reservar profissional junto com consulta; fixture corrigida sem afrouxar banco. Origem `clinical` não pertencia ao CHECK M1; código corrigido para `clinic`. Teste de rollback passou a exigir a falha de auditoria específica. IDs inexistentes agora não causam falha de FK na negativa (resourceId preserva alvo).

Leituras completas: BE-03238 linhas, cenário36, constituição48, overview47; adapter clinical-record-store262 e use case206 após atualização revisados no disco. Objetivo integral25 specs permanece ativo;22 sem código, mais integrações explicitamente parciais. Próxima BE-033.
