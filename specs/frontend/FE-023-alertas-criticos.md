# FE-023 - Alertas clínicos e condições críticas

- **Software:** front
- **Milestone:** M2 Prontuário
- **Status:** pendente
- **Depende de:** FE-021, BE-037
- **Requisitos cobertos:** RF-018, UI-010, UI-012

## 1. Objetivo
Exibir e manter alergias/condições críticas com destaque constante, autoria, confirmação e histórico de desativação.

## 2. Escopo
- Inclui: seção de alertas no prontuário, formulário por tipo, estado relatado/confirmado e desativação justificada.
- NÃO inclui: verificador de prescrição (BE-039/FE-024) ou acesso administrativo a alerta clínico.

## 3. Contexto necessário
Ler Design System §§18.1/21/32, `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m2` (alerts), DRS §3.3.3 e RN-007.

## 4. Detalhamento
- Header FE-021 mantém alerta crítico textual/ícone visível; seção detalhada lista tipo, termo, confirmação, autor e data. Formulário de criação usa labels persistentes, opção Relatado/Confirmado e substância quando conhecida. Evitar vermelho como único sinal; usar status semântico e hierarquia.
- Desativar abre diálogo com motivo obrigatório e explica que histórico será mantido. Lista inclui ativo/inativo com trilha, não remove visualmente o passado sem acesso. Falha de API conserva formulário; loading/vazio/erro/sucesso são explícitos.
- Ação de prescrever navega FE-024, que recebe alerta da API; não calcular compatibilidade só no cliente.

## 5. Critérios de aceite
- [ ] Dado alerta ativo, quando abrir qualquer atendimento autorizado, então header o mostra com texto/ícone e dados de autoria.
- [ ] Dado relato ainda não confirmado, quando exibir, então rótulo impede confusão com alerta validado.
- [ ] Dada desativação sem motivo, quando tentar, então formulário bloqueia envio; após sucesso, histórico ainda mostra evento anterior.
- [ ] Dado leitor de tela/escala de cinza, quando ler alerta, então severidade/estado continuam compreensíveis.

## 6. Testes esperados
Header, CRUD sem delete, relato/confirmado, motivo, autorização, contraste/teclado e estados; lint.

## 7. Definition of Done
- [ ] UI preserva informação crítica sem depender de cor/hover e usa FE-002.
- [ ] Testes/lint passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Vocabulário/associação de substância com medicamentos dependem P-13; alerta textual sem código continua visível.
