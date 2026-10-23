# FE-039 - Cadastro presencial de paciente e consentimento assinado

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-003, FE-004, BE-010, BE-011, BE-013
- **Requisitos cobertos:** RF-001, RF-004

## 1. Objetivo
Permitir à recepção cadastrar paciente atendido presencialmente, vincular responsável legal quando menor e registrar o consentimento com termo assinado. Este fluxo é separado do autocadastro digital de FE-007.

## 2. Escopo
- Inclui: formulário assistido de cadastro e registro presencial de nova versão do termo para paciente existente, vínculo do responsável, captura dos dados do consentinte e upload obrigatório do termo assinado.
- NÃO inclui: prontuário, agendamento (FE-016), criação de senha em claro ou verificação jurídica final do termo.

## 3. Contexto necessário
Ler `specs/00-constitution.md`, `specs/frontend/screens-map.md` (`/recepcao/pacientes/novo`), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md` (`POST /v1/patients`), `specs/shared/parameters.md` (Arquivos), DRS §§3.1.1/3.1.4 e Q-05/Q-17.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho de cadastro presencial; seção de dados do paciente; seção de responsável, obrigatória para menor; seção do termo vigente com nome e parentesco do consentinte, status de aceite e seletor de arquivo assinado conforme `file.attachment_formats`; resumo de confirmação. Labels persistentes, ajuda contextual e erros ligados aos campos.
- Enviar `multipart/form-data` pelo serviço FE-004, com `data` JSON e `signedTerm` binário conforme contrato. Para paciente já cadastrado e nova versão, usar a mesma seção de termo em `/recepcao/pacientes/[id]/consentimento`, sem recriar PatientProfile. Exibir limite por `file.attachment_max_mb`, prévia de nome/tipo/tamanho e progresso. Sem arquivo aceito, não habilitar conclusão. CPF duplicado e arquivo recusado preservam demais dados; nenhum segredo ou conteúdo do termo entra em log do navegador.
- Após sucesso, mostrar identificador, responsável vinculado, versão registrada e situação de acesso digital. Cadastro assistido adulto recebe convite de definição de senha por e-mail se houver canal; menor usa a conta do responsável. Recepção nunca visualiza conteúdo clínico.

## 5. Critérios de aceite
- [ ] Dado paciente menor sem responsável identificado, quando tentar concluir, então formulário impede envio e indica o campo faltante.
- [ ] Dado termo sem arquivo assinado, quando tentar concluir, então nenhum cadastro/aceite é enviado; arquivo inválido ou acima de `file.attachment_max_mb` mostra erro e preserva os demais campos.
- [ ] Dado cadastro válido com termo assinado, quando confirmar, então resposta exibe paciente, versão e evidência vinculada; recarregar mostra consentimento sem perder nome/parentesco/data.
- [ ] Dado paciente existente e termo novo, quando a recepção anexar aceite presencial, então só um novo ConsentEvent é criado e o cadastro anterior permanece.
- [ ] Dado CPF duplicado ou falha no upload, quando API responder erro, então não há sucesso parcial e a recepção pode corrigir sem redigitar campos válidos.
- [ ] Dado usuário sem papel de recepção/admin, quando abrir rota ou forçar requisição, então API nega e a tela não revela dados do formulário alheio.

## 6. Testes esperados
Fluxos adulto/menor, anexo ausente/inválido/excessivo, CPF duplicado, sucesso transacional, teclado/leitor de tela e autorização com API contratual. Lint do frontend.

## 7. Definition of Done
- [ ] Fluxo usa o contrato único e parâmetros por chave, sem alterar FE-007.
- [ ] Evidência presencial e ator/consentinte identificados; estados e acessibilidade conferidos.
- [ ] Testes pertinentes e `yarn workspace vida-plena-frontend lint` passam; sem `tsc`.

## 8. Suposições e pontos em aberto
Versão/publicador do termo e regras legais de representação estão em P-01/P-12. A verificação de autenticidade do documento físico é procedimento da clínica, não prova automática por upload.
