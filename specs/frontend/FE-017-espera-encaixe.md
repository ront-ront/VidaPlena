# FE-017 - Lista de espera e encaixe

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** pendente
- **Depende de:** FE-012, FE-015, BE-024
- **Requisitos cobertos:** RF-012, RN-001

## 1. Objetivo
Dar ao paciente caminho de espera quando não há horários e à recepção controle de ofertas/encaixes justificados fora da grade.

## 2. Escopo
- Inclui: inscrição/saída, status de oferta/TTL, aceite e painel operacional de encaixe.
- NÃO inclui: sobreposição de consulta, reserva direta fora de BE-020 ou canal externo não ativo.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (espera), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md#m1` (waitlist/fit-ins), `specs/shared/parameters.md` (`waitlist.offer_ttl_minutes`), DRS §3.2.7 e Q-06/Q-16.

## 4. Detalhamento
- Layout proposto Q-14: paciente chega pela busca vazia FE-012, informa faixa de datas/horas e acompanha posição/status em área própria; oferta mostra horário, prazo calculado pela chave e ação Aceitar/Sair. Oferta expirada não apresenta confirmação falsa; 409 conduz a nova busca/espera.
- Em `/agenda/espera`, recepção vê fila por especialidade/ordem, oferta ativa, tempo restante e encaixe. Encaixe exige profissional, intervalo fora da grade, sala livre se presencial e justificativa antes da confirmação; marcação exibe badge “Encaixe”. Gestor pode autorizar conforme Q-06; ninguém vê conteúdo clínico.
- Estados loading, lista vazia, oferta expirada, erro de canal/slot e sucesso; 360 px para paciente, teclado/leitor de tela e texto de status além de cor.

## 5. Critérios de aceite
- [ ] Dada busca sem vaga, quando paciente entrar na espera, então preferência/data de entrada aparecem; ele pode sair sem apagar histórico.
- [ ] Dada oferta vencida por `waitlist.offer_ttl_minutes`, quando tentar aceitar, então UI informa expiração e nenhuma consulta aparece.
- [ ] Dado encaixe sem justificativa ou em intervalo ocupado, quando confirmar, então erro impede sucesso; encaixe livre fica identificado na agenda.
- [ ] Dado paciente de outra conta, quando consultar oferta/posição, então API nega e UI não revela dados.

## 6. Testes esperados
Inscrição/saída, ordem/status, expiração, aceite concorrente, encaixe livre/ocupado, 360 px e permissão; lint.

## 7. Definition of Done
- [ ] Parâmetro por chave, contrato e tokens/estados reutilizados.
- [ ] Testes/lint passam; regra RN-001 só no servidor, sem `tsc`.

## 8. Suposições e pontos em aberto
Prazos definitivos da espera aguardam clínica Q-16; o UI usa o valor vigente retornado/contratado, sem literal fixo.
