# FE-017 - Lista de espera e encaixe

- **Software:** front
- **Milestone:** M1 Agenda
- **Status:** implementada localmente; homologação manual de acessibilidade e parâmetros definitivos pendentes
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
- [x] Dada busca sem vaga, quando paciente entrar na espera, então preferência/data de entrada aparecem; ele pode sair sem apagar histórico.
- [x] Dada oferta vencida por `waitlist.offer_ttl_minutes`, quando tentar aceitar, então UI informa expiração e nenhuma consulta aparece.
- [x] Dado encaixe sem justificativa ou em intervalo ocupado, quando confirmar, então erro impede sucesso; encaixe livre fica identificado na agenda.
- [x] Dado paciente de outra conta, quando consultar oferta/posição, então API nega e UI não revela dados.

## 6. Testes esperados
Inscrição/saída, ordem/status, expiração, aceite concorrente, encaixe livre/ocupado, 360 px e permissão; lint.

## 7. Definition of Done
- [x] Parâmetro por chave, contrato e tokens/estados reutilizados.
- [x] Testes/lint passam; regra RN-001 só no servidor, sem `tsc`.

## 8. Suposições e pontos em aberto
Prazos definitivos da espera aguardam clínica Q-16; o UI usa o valor vigente retornado/contratado, sem literal fixo.

## Evidência local — 13/11/2026

Fonte original lida integralmente, da primeira à última das 38 linhas; DRS §3.2.7/RF-012 e Q-06/Q-16 conferidos. P-51 registra as decisões de interface. `/agenda/espera` conecta inscrição por faixas, sujeito próprio/dependente ou CPF assistido, posição/status, filtros/paginação, oferta, ciência de duplicidade, aceite e saída confirmada. A busca vazia FE-012 tem link para essa rota. Gestor recebe somente o painel de encaixe; profissional não acessa a tela. Recepção/admin consultam a fila conforme autorização da API, sem conteúdo clínico.

Prazo vem de `expiresAt`, relativo ao relógio de servidor P-48; nenhuma cópia do valor de `waitlist.offer_ttl_minutes` é fixada no front. Expiração local/409 não produzem confirmação. Encaixe usa identificação mínima P-50, motivo obrigatório, conversão Temporal no fuso da clínica com rejeição de horário ambíguo/inexistente e opções de sala P-49. Recepção pode trocar a sala livre; gestor mantém alocação automática. Online não consulta nem envia sala. RN-001 é revalidada no servidor; o recibo válido 201 e a projeção da agenda identificam Encaixe. Gate síncrono e nonce persistido impedem repetição acidental; resposta perdida orienta verificar o resultado antes de repetir.

**15/15 testes específicos e regressão completa 70/70 Firefox com APIs simuladas**, incluindo dependentes, retirada/histórico, duplicidade, prazo retornado diferente do padrão, expiração com página aberta, nova oferta após expiração anterior, conflitos, contato manual, papéis, 360 px/teclado, sala explícita, remoto, DST, paginação e duplo evento de aceite. **156/156 integrações HTTP/PostgreSQL backend** passaram, incluindo FIFO, aceite concorrente, representação/revogação e invariantes reais de encaixe. Cliente HTTP 6/6, nonce 3/3, lint backend220/front86 e build Next aprovados. Captura mobile inspecionada. Logs `/tmp/vidaplena-fe017-{full-browser,backend-full,api,nonce,lint-final,build-final}.log`.

Testes de navegador simulam API; a barreira transacional é comprovada pelas integrações backend, sem alegar ensaio de carga BE-051 ou homologação com leitor de tela. Nenhum comando `tsc`, commit, staging ou push. Pausa solicitada pelo usuário após esta spec; FE-018–020 não iniciadas.
