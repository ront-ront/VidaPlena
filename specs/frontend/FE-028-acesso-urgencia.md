# FE-028 - Solicitação de acesso de urgência

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-031
- **Requisitos cobertos:** RF-023, RNF-015

## 1. Objetivo
Permitir que profissional solicite acesso excepcional justificado e veja prazo/escopo enquanto o vínculo de urgência estiver ativo.

## 2. Escopo
- Inclui formulário, confirmação, indicador de expiração e encerramento. NÃO inclui autorização permanente ou acesso por recepção.

## 3. Contexto necessário
Ler DRS §3.3.8/§4.4.4, Q-21, specs/shared/access-policy.md, specs/shared/api-contracts.md#m2 (emergency), specs/shared/parameters.md (emergency_access.duration_minutes).

## 4. Detalhamento
Layout proposto Q-14 em /prontuarios/acesso-urgente: identificação mínima do paciente, justificativa obrigatória, aviso de auditoria/notificação e prazo lido da configuração, botão explícito Solicitar. Após concessão, faixa persistente com base de acesso, expiração, ação encerrar e ida ao prontuário FE-021. Loading, 403, expirada e falha de notificação com estados distinguíveis; teclado/foco.

## 5. Critérios de aceite
- [ ] Dado ausência de vínculo e justificativa vazia, quando solicitar, então erro de campo e nenhuma concessão.
- [ ] Dada justificativa válida, quando conceder, então duração segue emergency_access.duration_minutes, responsável é notificado e auditoria reforçada registra evento.
- [ ] Dado acesso expirado, quando navegar no prontuário, então conteúdo é limpo e leitura negada.
- [ ] Dado recepcionista, quando abrir rota, então 403..

## 6. Testes esperados
Validação, concessão/expiração, notificação, auditoria e negação por papel; lint.

## 7. Definition of Done
- [ ] Sem caminho de urgência sem justificativa; critérios/testes e lint passam, sem tsc.

## 8. Suposições e pontos em aberto
Prazo é provisório Q-16; revisão operacional da concessão segue BE-031.
