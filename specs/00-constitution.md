# Constituição das especificações VidaPlena

## 1. Autoridade e escopo

1. O DRS `docs/DRS_VidaPlena_Connected_Care.docx.md` define RF, RNF e RN. As respostas do usuário de 23/10/2026 em `04-open-questions.md` prevalecem nas divergências explicitadas. Não alterar o DRS silenciosamente.
2. `docs/architecture.md` é ponto de partida forte. `backend/architecture.md` registra adoções e desvios justificados A-01–A-10.
3. `apps/frontend/AGENTS.md` e `apps/frontend/docs/VidaPlena_Design_System.md` definem a interface. `frontend/design-system.md` e `frontend/screens-map.md` extraem as regras para implementação. Telas não desenhadas na fonte são propostas técnicas identificadas como tal.
4. Decisões técnicas de API, banco, rotas e nomes de campo necessárias para implementar RF são propostas deste conjunto de specs, rastreadas ao requisito. Onde a clínica/jurídico ainda deve decidir, marcar **pendente** ou **suposição**, nunca afirmar aprovação inexistente.
5. Escopo desta documentação: plataforma web de agenda, prontuário, teleconsulta e gestão. Fora da V1: ERP, faturamento, estoque, internação, pagamentos, integração operacional FHIR/TISS/laboratórios, migração massiva e OCR, SMS/WhatsApp operacional, DICOM e equipamentos de sala.

## 2. Stack verificada e organização

- Yarn 1 workspaces/Turbo. Backend Express 5 + TypeScript + Prisma 7/PostgreSQL 17; Redis 7 disponível no Compose. Frontend Next.js 16 App Router + React 19 + Tailwind CSS 4 + Shadcn/Base UI + Lucide. Estes são fatos dos manifests em 23/10/2026, não compromisso de usar cada biblioteca em toda spec.
- Backend com entidades e regras puras, use cases e portas internas, adaptadores concretos em infraestrutura, composition root na borda. Frontend com rotas App Router, componentes reutilizáveis e cliente de API centralizado; componentes não chamam `fetch` diretamente.
- O schema Prisma será criado do zero por decisão Q-23. Migrations são versionadas. Nunca considerar arquivos gerados como fonte de verdade.
- REST/JSON é a interface de negócio; WebSocket serve apenas à sinalização da teleconsulta na V1. Os contratos ficam em `shared/api-contracts.md`.

## 3. Regras transversais

- Uma spec implementável por vez; cumprir somente seu escopo e dependências já concluídas. Não juntar funcionalidades de outro ID “por conveniência”.
- Toda operação sobre dados pessoais/clínicos valida autenticação, papel, recurso, consentimento quando aplicável e vínculo assistencial no servidor. Identificadores arbitrários não ampliam permissões.
- Auditar acessos, alterações, exportações e falhas de autorização conforme `shared/access-policy.md`; logs técnicos não carregam conteúdo clínico, senhas, tokens ou mídia.
- Evolução finalizada, documento emitido e histórico importado são imutáveis; correção por adendo/retificação com original preservado. Não excluir fisicamente prontuário no período de RN-012.
- Reservas de profissional e sala não se sobrepõem, inclusive em encaixe; a garantia é transacional no banco. Respostas de conflito não deixam gravação parcial.
- Contratos de API, entidades, regras e parâmetros são definidos uma única vez em `shared/`. BE/FE citam seções e não copiam estruturas divergentes.
- Chaves e valores provisórios ficam em `shared/parameters.md`; critérios de aceite e testes das specs citam as chaves. Requisitos mensuráveis mantêm metas verificáveis e contexto de medição.
- Mensagens ao usuário em pt-BR, acionáveis, sem erros técnicos internos. Estados loading, vazio, erro, disabled, hover, focus e sucesso são considerados onde aplicáveis.

## 4. Segurança, validade e produção

- DevSignatureProvider calcula hash e evidência técnica, mas **não produz assinatura ICP-Brasil nem documento juridicamente válido**. DevMalwareScanner não faz varredura real. Ambos são recusados por configuração em produção.
- A V1 WebRTC P2P usa DTLS-SRTP. RNF-014 permanece parcialmente atendido quanto à garantia fim a fim definida no DRS; nenhuma spec deve declarar conformidade plena.
- LGPD, política de menor, níveis de assinatura, gravação/expurgo e mensagens essenciais têm validações pendentes em `04-open-questions.md`. Specs registram portões; não permitem ignorá-los para implantação clínica.
- Hospedagem nacional, backup, restauração, observabilidade, disponibilidade e desempenho requerem evidência de ambiente real. Documentação ou teste local não equivale a homologação de produção.

## 5. Contratos e convenções de spec

- IDs: RF-001…032; RNF-001…025; RN-001…012; UI-001…016; BE-001…054; FE-001…041. FE-039 cobre cadastro presencial; FE-040, upload de resultado; FE-041, tipos documentais. A matriz mapeia requisito → spec e estado total/parcial/pendente.
- Cada arquivo BE/FE usa as oito seções do template do pedido: Objetivo, Escopo, Contexto necessário, Detalhamento, Critérios de aceite, Testes esperados, Definition of Done, Suposições e pontos em aberto; metadados de software, milestone, status, dependências e requisitos.
- Critérios: Dado/Quando/Então ou checklist objetivo com atores, dados, erro e persistência observável. Um valor sem fonte deve vir de parâmetro identificado ou ficar pendente.
- “Status: pendente” significa que a spec não foi implementada. “Cobertura planejada” na matriz não deve ser confundida com código entregue. Requisitos parciais explicitam a parte faltante.
- A cada lote de M0–M4, atualizar `02-traceability-matrix.md` e `03-implementation-order.md`, conferir dependências. Os lotes restantes foram autorizados expressamente pelo usuário em 23/10/2026.

## 6. Verificação e comandos

- Lint existente: `yarn lint` na raiz, ou workspace específico. Build existente: `yarn workspace vida-plena-frontend build`; não existe build/test script de backend nos manifests examinados.
- **Nunca executar `tsc` para testes; usar somente lint para verificação estática.** Testes funcionais/integração/e2e pertinentes são descritos nas specs e só usam scripts/ferramentas que forem adicionados pela spec responsável.
- Esta tarefa de Fase 3 cria documentação em `specs/` e este `AGENTS.md`; não altera código-fonte. Não executar lint sem alteração de código como prova de conformidade das specs.
