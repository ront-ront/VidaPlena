# FE-007 - Autocadastro, dependentes e consentimento inicial

- **Software:** front
- **Milestone:** M0 Fundação
- **Status:** pendente
- **Depende de:** FE-002, FE-004, BE-010, BE-011
- **Requisitos cobertos:** RF-001, RF-004, RNF-003, RNF-019

## 1. Objetivo
Oferecer cadastro curto e claro para paciente adulto ou responsável por menor, com termo versionado e aceite explícito antes da conclusão digital.

## 2. Escopo
- Inclui: formulário de identidade/contato, escolha adulto/dependente, relação de responsável, senha quando pertinente, termo e estados de validação.
- NÃO inclui: cadastro assistido da recepção como tela de agenda, manutenção posterior de perfil (FE-008) ou política jurídica final de menor.

## 3. Contexto necessário
Ler `specs/frontend/screens-map.md` (`/cadastro`), `specs/frontend/design-system.md`, `specs/shared/api-contracts.md` (registro), `specs/shared/access-policy.md`, DRS §§3.1.1/3.1.4, Q-05 e P-01.

## 4. Detalhamento
- Layout proposto Q-14: cabeçalho da marca, etapas compactas identificadas, campos nome/data/CPF/celular/e-mail, senha/confirmar em autocadastro adulto; modo dependente exige responsável autenticado, nome/parentesco e termo aplicável. Labels persistentes, erro por campo sem perder valores.
- Mostrar versão vigente e texto completo do termo em área legível, checkbox/ação de aceite separados da navegação; não pré-marcar. Recusa explica limite do serviço digital e opção presencial. Enviar registro+aceite no mesmo contrato transacional; CPF duplicado oferece recuperação de acesso, não nova conta.
- 360 px sem rolagem horizontal do viewport, WCAG 2.1 AA, teclado/leitor de tela, loading/conflito/sucesso. Não afirmar documento de menor aprovado juridicamente antes P-01.

## 5. Critérios de aceite
- [ ] Dado termo não aceito, quando tentar concluir, então cadastro digital não é enviado/concluído.
- [ ] Dado CPF duplicado, quando backend responder 409, então formulário conserva dados e oferece recuperação.
- [ ] Dado responsável autenticado, quando cadastrar dependente, então relação/parentesco e consentimento são enviados; outro usuário não vê o dependente.
- [ ] Dado 360 px e navegação por teclado/leitor, quando percorrer formulário/termo, então todos os campos/erros são compreensíveis e acionáveis.

## 6. Testes esperados
Fluxos adulto/dependente, recusa, CPF duplicado, validação/senha e acessibilidade/360 px com API contratual. Lint.

## 7. Definition of Done
- [ ] Layout proposto identificado e fiel aos tokens; cadastro/aceite atômicos via contrato.
- [ ] Acessibilidade e estados verificados; lint passa, sem `tsc`.
- [ ] P-01 visível como portão jurídico de menor.

## 8. Suposições e pontos em aberto
Exceções de sigilo e transição na maioridade aguardam DPO/jurídico. Termo por responsável presencial fica em BE-011/FE administrativo futuro, não nesta tela.
