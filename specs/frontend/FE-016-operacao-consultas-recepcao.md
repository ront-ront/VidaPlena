# FE-016 - Agendar e alterar consulta pela recepção

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; ensaio com usuários/leitor de tela pendente
- **Depende de:** FE-015, BE-021, BE-022, BE-023
- **Requisitos cobertos:** RF-007, RF-009, RF-010, RNF-002

## 1. Objetivo
Permitir à recepção confirmar, remarcar e cancelar consultas sem abandonar o contexto do dia e com decisão visível sobre sala e impacto.

## 2. Escopo
- Inclui: painéis/diálogos acionados na agenda, seleção de paciente/horário/sala, motivo e confirmações.
- NÃO inclui: cadastro presencial (FE-039), lista de espera (FE-017), autoatendimento do paciente (FE-013/014).

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (Agenda), `specs/frontend/design-system.md`, Design System §§17/31, `specs/shared/api-contracts.md#m1` (appointments/rooms/availability), DRS §§3.2.2–3.2.5 e Q-06/Q-07.

## 4. Detalhamento
- Abrir a partir do slot/ação da FE-015 em até dois cliques, sem reload. Painel de agendamento tem paciente/dependente, especialidade, profissional, tipo, modalidade, horário e **sala sugerida** para presencial; recepção pode trocar por outra sala livre, mas não prossegue sem sala. Modalidade remota oculta sala. Confirmar duplicidade de especialidade explicitamente.
- Reagendar mostra original e novo lado a lado; conflito mantém original visível. Cancelar mostra política/origem e motivo; clínica/profissional são destacados na comunicação. Ações fora de RN-004 exigem ator/motivo de recepção. Após 201/200, atualizar grade e manter data/filtros/foco.
- Loading bloqueia repetição; 409 `SLOT_UNAVAILABLE` oferece horários próximos; consentimento/suspensão/paciente inexistente têm orientação em pt-BR. Em mobile, painel vira Sheet acessível e grade permanece scroll próprio.

## 5. Critérios de aceite
- [x] Dado presencial, quando escolher horário, então sala livre é sugerida; troca só aceita outra livre, e ausência de sala impede confirmar.
- [x] Dado conflito concorrente, quando API responder 409, então painel explica indisponibilidade, oferece alternativas e nenhuma consulta é mostrada como confirmada.
- [x] Dado reagendamento falho, quando fechar/voltar, então consulta original permanece no slot antigo.
- [x] Dado cancelamento pela clínica, quando concluir, então grade/histórico mostram origem e aviso foi agendado pelo backend.
- [x] Dada qualquer ação comum, quando partir da agenda, então é acessível em até dois cliques e sem reload integral.

## 6. Testes esperados
Sala auto/troca, duplicidade, três operações, conflito, prazo/motivo, filtro/foco e teclado; ensaio RNF-002/004 com FE-015.

## 7. Definition of Done
- [x] Chama serviços FE-004 e contratos M1, sem regra de colisão só no front.
- [x] Testes/lint passam; nenhuma tela clínica acessada, sem `tsc`.

## 8. Suposições e pontos em aberto
O desenho exato do painel é proposta Q-14 aplicada ao layout explícito da agenda; não há escolha de sala pelo profissional.

## Evidência local — 13/11/2026

Painel acessível da recepção na agenda: CPF próprio do paciente/dependente, busca de slots, sugestão/troca de sala por P-45, modalidade remota sem sala, duplicidade explícita, três operações, origem/motivo e confirmação201/200. Remarcação exibe original/novo lado a lado; conflito não altera original. Nonce inclui ator/operação/payload, e resposta perdida orienta conferir agenda. Origem/prazo vêm de P-46. Data/filtros preservados e foco restaurado somente após nova leitura, com fallback em Atualizar agenda. Cadastro/consentimento continuam FE-039; encaixe/check-in ficam FE-017/018.

Regressão Firefox com APIs simuladas **54/54** (10 casos FE-016+44 anteriores), mais **1/1** posterior de fechamento após conflito (11 casos específicos aprovados, não somar como execução55/55). ClienteHTTP6/6, nonce3/3, lint backend219/frontend79 e build Next aprovados. Backend integral **152/152** após P-45/P-46. Primeiras execuções14/15 e7/8 revelaram foco aplicado antes de substituir a grade; corrigido estado de atualização e finalFocus gerenciado pelo fluxo. Captura360px inspecionada. Dois cliques/sem reload foram automatizados; ensaio de treinamento/RNF-004 e leitor de tela manual permanecem pendentes. Arquivo original39 linhas e guia Next use-client123 linhas lidos integralmente. Sem tsc/commit.
