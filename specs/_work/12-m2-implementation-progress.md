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

Cada spec deve ser testada e registrada na matriz antes da próxima. Commits por spec ou grupo coeso já validado; nenhuma cobertura antecipada. Próximo trabalho BE-030 em implementação; demais pendentes.

## BE-030 — fundação verificada

Migration e sincronização/reconciliação CLI/startup implementadas, guard por paciente/fase e concessões individuais cifradas/auditadas, paginação SQL30+1, schemas HTTP/OpenAPI e configuração Zod. Casos de evolução própria ainda dependem de BE-035/036; nenhuma rota de prontuário criada antecipadamente.

Resultado:89/89 integrações de consumidores (sessão68409), revisão posterior10/10 em `/tmp/vidaplena-be030-audit-final-integration.log` (sessão72700),28/28 Node,2/2 Vitest e lint223. Primeiras falhas foram ambiente: porta do container mudou de32768 para32769 ao reiniciar; migração da fixture exige cwd apps/backend. Bateria inicial6/7 corrigiu expectativa MFA: sessão sem MFA é401 conforme contrato já existente. Nenhuma regra foi enfraquecida. Testes isolados criam/removem sua própria base `_test`; banco dev intocado.

Leituras: constituição48, overview47, ordem150, BE-03039, BE-03138, schema807 linhas originais e booking-store477 linhas originais percorridos no disco. Contratos M2/acesso/valores usados diretamente. Nenhum tsc. Próxima spec BE-031; objetivo completo M2 permanece ativo.
