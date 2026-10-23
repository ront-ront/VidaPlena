# BE-015 - Backup, restauração e retenção operacional

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** BE-002, BE-014
- **Requisitos cobertos:** RNF-007, RNF-006, RN-012

## 1. Objetivo
Definir e automatizar a proteção/restauração do banco e arquivos da V1, com evidência de RPO/RTO e retenção clínica mínima.

## 2. Escopo
- Inclui: rotina de backup completo diário/incremental contínuo, criptografia, localidade distinta nacional, teste de restauração semestral, runbook e retenção sem exclusão prematura.
- NÃO inclui: implantação final em provedor não escolhido, expurgo de gravações (BE-047) ou garantia de SLA sem medição real.

## 3. Contexto necessário
Ler `specs/shared/parameters.md` (privacy/ops), `specs/shared/data-model.md` (retenção), `specs/backend/architecture.md`, DRS §§2.5 RN12/4.2.2–4.2.3 e Q-11.

## 4. Detalhamento
- Cobrir PostgreSQL, metadados de consentimento/auditoria e objetos FileStorage. Backups cifrados com chave segregada, armazenamento em localidade distinta da principal e território nacional para produção. Agenda de cópia e log de sucesso/falha alimentam alertas de BE-014.
- Runbook reproduz restauração isolada, valida integridade/contagens, mede perda e tempo contra `ops.rpo_minutes_max`/`ops.rto_hours_max`; simulação ao menos semestral. Janela de manutenção comunica 48 h antes e respeita limite RNF-006.
- Retenção clínica nunca abaixo de `privacy.clinical_retention_years`; recuperação não reativa conteúdo de gravação revogada. Prazo de rotação de backups com gravação revogada está pendente P-03 e deve ser resolvido antes de produção da gravação.

## 5. Critérios de aceite
- [ ] Dado backup completo+incrementais de ambiente de ensaio, quando restaurar isoladamente, então dados/arquivos íntegros e RPO/RTO medidos com chaves dos parâmetros.
- [ ] Dada falha de backup, quando job falhar, então alerta e registro técnico são emitidos.
- [ ] Dado prontuário dentro da retenção mínima, quando rotina de limpeza rodar, então não o exclui fisicamente.
- [ ] Dado conteúdo de gravação revogada em snapshot antigo, quando restaurar, então controle de revogação impede torná-lo acessível.

## 6. Testes esperados
Simulação documentada de backup/restauração em ambiente isolado, falha/alerta, integridade e bloqueio de conteúdo revogado. Medição semestral real é evidência operacional futura. Lint se scripts de aplicação forem alterados.

## 7. Definition of Done
- [ ] Procedimento executável, métricas e responsáveis documentados.
- [ ] Segredo de cifra separado do backup; retenção clínica preservada.
- [ ] Evidência local e limites de produção marcados; lint pertinente, sem `tsc`.

## 8. Suposições e pontos em aberto
Infraestrutura nacional e localidade secundária precisam de escolha da clínica/P-07. Política de rotação para gravação revogada é P-03; não declarar recuperação de desastres homologada sem ensaio no alvo.
