# BE-010 - Cadastro de paciente, responsável e dependentes

- **Software:** back
- **Milestone:** M0 Fundação
- **Status:** implementada localmente (cadastro digital e assistido publicado com aceite transacional em BE-011)
- **Depende de:** BE-002, BE-003, BE-006
- **Requisitos cobertos:** RF-001, RNF-016

## 1. Objetivo
Criar perfis únicos de paciente e vínculos de responsável legal para autocadastro e cadastro assistido. Preparar transação conjunta com consentimento de BE-011.

## 2. Escopo
- Inclui: CPF único, dados obrigatórios/formatos, conta adulta ou paciente sem login, GuardianLink e convite de ativação assistida.
- NÃO inclui: aceite/revogação do termo (BE-011), sessão/login, histórico clínico ou importação CSV (BE-028).

## 3. Contexto necessário
Ler `specs/shared/data-model.md` (`PatientProfile`/`GuardianLink`), `specs/shared/api-contracts.md` (cadastro), `specs/shared/access-policy.md`, DRS §3.1.1 e Q-05.

## 4. Detalhamento
- Validar nome, nascimento, CPF, telefone, e-mail; normalizar CPF e barrar duplicidade inclusive concorrente. Autocadastro adulto cria conta e perfil; responsável autenticado pode criar dependente e relação individual. Recepção cadastra paciente menor com responsável identificado e evidência de aceite presencial via BE-011.
- Cadastro assistido adulto cria perfil sem senha e envia link de uso único para definir acesso quando houver e-mail, como interpretação segura de “credencial provisória” do DRS. Sem e-mail, perfil administrativo existe, mas portal não é habilitado.
- **Não publicar endpoint de registro completo sem BE-011:** BE-010 fornece porta/use case de preparação de paciente; BE-011 fecha cadastro+consentimento em transação. Isso evita criar paciente digital “consentido” sem evidência.

## 5. Critérios de aceite
- [x] Dado CPF válido novo, quando preparar cadastro, então cria um único PatientProfile; CPF duplicado retorna 409 sem duplicação.
- [x] Dado responsável com dois dependentes, quando listar, então vê ambos; outro usuário não os vê.
- [x] Dado menor sem responsável, quando tentar cadastro digital, então validação impede conclusão.
- [ ] Dado cadastro pela recepção, quando ativar portal, então senha não é enviada em claro e consentimento vigente é exigido.

## 6. Testes esperados
Validação/normalização CPF e contatos, concorrência de CPF, vínculos múltiplos, IDOR por dependente e transação preparada para BE-011. Lint.

## 7. Definition of Done
- [x] Schema/porta/use case limitados a cadastro/vínculo; sem endpoint público incompleto.
- [x] BE-011 identificado como fechamento obrigatório; testes/lint passam, sem `tsc`.
- [x] Nenhuma conta de menor ganha acesso sem política/consentimento.

## 8. Suposições e pontos em aberto
Documentos de prova de responsabilidade e exceções de sigilo do menor dependem de validação P-01. Idade legal/critério de menor não é hardcoded sem fonte normativa aprovada.
