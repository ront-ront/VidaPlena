**INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DO CEARÁ**

**Campus Aracati**

Bacharelado em Ciência da Computação

Disciplina: APS

**DOCUMENTO DE REQUISITOS DE SOFTWARE**

**Clínica VidaPlena**

Plataforma de Agendamento Online, Prontuário Eletrônico e Teleconsulta

para a Clínica VidaPlena

*“Cuidado que cabe na sua rotina”*

**Equipe do projeto**

Ronaldo — Product Owner

Bruno — UX Design

Yan — Desenvolvimento Backend

Arthur — Desenvolvimento Frontend

Joao — Qualidade e Testes (QA)

**Versão 1.0 — Setembro de 2026**

Aracati — CE

2026

**Sumário**

[**1. Introdução 4**](#1-introdução)

[1.1 Visão geral deste documento 4](#11-visão-geral-deste-documento)

[1.2 Convenções, termos e abreviações 4](#12-convenções-termos-e-abreviações)

[1.3 Referências 5](#13-referências)

[**2. Capítulo 1 — Descrição geral do sistema 6**](#2-capítulo-1--descrição-geral-do-sistema)

[2.1 Abrangência e sistemas relacionados 6](#21-abrangência-e-sistemas-relacionados)

[2.2 Descrição dos usuários 7](#22-descrição-dos-usuários)

[2.2.1 Paciente 7](#221-paciente)

[2.2.2 Recepcionista 7](#222-recepcionista)

[2.2.3 Profissional de saúde 7](#223-profissional-de-saúde)

[2.2.4 Gestor da clínica 8](#224-gestor-da-clínica)

[2.2.5 Administrador do sistema 8](#225-administrador-do-sistema)

[2.3 Mapeamento de stakeholders 8](#23-mapeamento-de-stakeholders)

[2.4 Técnicas de elicitação 9](#24-técnicas-de-elicitação)

[2.5 Regras de negócio 9](#25-regras-de-negócio)

[2.6 Premissas e restrições 10](#26-premissas-e-restrições)

[**3. Capítulo 2 — Requisitos funcionais (casos de uso) 11**](#3-capítulo-2--requisitos-funcionais-casos-de-uso)

[3.1 Acesso e identidade 11](#31-acesso-e-identidade)

[3.1.1 \[RF001\] Cadastrar paciente (P) 11](#311-rf001-cadastrar-paciente-p)

[3.1.2 \[RF002\] Realizar login (P) 12](#312-rf002-realizar-login-p)

[3.1.3 \[RF003\] Recuperar senha (P) 12](#313-rf003-recuperar-senha-p)

[3.1.4 \[RF004\] Registrar consentimento de tratamento de dados (P) 13](#314-rf004-registrar-consentimento-de-tratamento-de-dados-p)

[3.1.5 \[RF005\] Manter dados do próprio cadastro (P) 13](#315-rf005-manter-dados-do-próprio-cadastro-p)

[3.2 Agendamento 14](#32-agendamento)

[3.2.1 \[RF006\] Consultar disponibilidade de horários (P) 14](#321-rf006-consultar-disponibilidade-de-horários-p)

[3.2.2 \[RF007\] Agendar consulta (P) 15](#322-rf007-agendar-consulta-p)

[3.2.3 \[RF008\] Impedir dupla reserva de horário (P) 16](#323-rf008-impedir-dupla-reserva-de-horário-p)

[3.2.4 \[RF009\] Reagendar consulta (P) 16](#324-rf009-reagendar-consulta-p)

[3.2.5 \[RF010\] Cancelar consulta (P) 17](#325-rf010-cancelar-consulta-p)

[3.2.6 \[RF011\] Gerenciar grade de horários do profissional (P) 17](#326-rf011-gerenciar-grade-de-horários-do-profissional-p)

[3.2.7 \[RF012\] Gerenciar lista de espera e encaixe (V) 18](#327-rf012-gerenciar-lista-de-espera-e-encaixe-v)

[3.2.8 \[RF013\] Enviar lembrete automático de consulta (P) 18](#328-rf013-enviar-lembrete-automático-de-consulta-p)

[3.2.9 \[RF014\] Registrar chegada do paciente (check-in) (P) 19](#329-rf014-registrar-chegada-do-paciente-check-in-p)

[3.2.10 \[RF015\] Registrar ausência (no-show) (P) 20](#3210-rf015-registrar-ausência-no-show-p)

[3.3 Prontuário eletrônico 20](#33-prontuário-eletrônico)

[3.3.1 \[RF016\] Abrir prontuário do paciente (P) 20](#331-rf016-abrir-prontuário-do-paciente-p)

[3.3.2 \[RF017\] Registrar evolução clínica (P) 21](#332-rf017-registrar-evolução-clínica-p)

[3.3.3 \[RF018\] Registrar alergias e condições críticas (P) 21](#333-rf018-registrar-alergias-e-condições-críticas-p)

[3.3.4 \[RF019\] Emitir prescrição eletrônica (P) 22](#334-rf019-emitir-prescrição-eletrônica-p)

[3.3.5 \[RF020\] Solicitar exames e registrar resultados (P) 23](#335-rf020-solicitar-exames-e-registrar-resultados-p)

[3.3.6 \[RF021\] Emitir atestados e documentos clínicos (V) 23](#336-rf021-emitir-atestados-e-documentos-clínicos-v)

[3.3.7 \[RF022\] Consultar histórico clínico unificado (P) 24](#337-rf022-consultar-histórico-clínico-unificado-p)

[3.3.8 \[RF023\] Acessar prontuário em situação de urgência (P) 24](#338-rf023-acessar-prontuário-em-situação-de-urgência-p)

[3.4 Teleconsulta 25](#34-teleconsulta)

[3.4.1 \[RF024\] Registrar consentimento de teleconsulta (P) 25](#341-rf024-registrar-consentimento-de-teleconsulta-p)

[3.4.2 \[RF025\] Realizar teleconsulta por vídeo (P) 25](#342-rf025-realizar-teleconsulta-por-vídeo-p)

[3.4.3 \[RF026\] Compartilhar documentos durante a teleconsulta (V) 26](#343-rf026-compartilhar-documentos-durante-a-teleconsulta-v)

[3.4.4 \[RF027\] Gravar teleconsulta mediante consentimento (V) 27](#344-rf027-gravar-teleconsulta-mediante-consentimento-v)

[3.5 Administração e gestão 27](#35-administração-e-gestão)

[3.5.1 \[RF028\] Gerenciar profissionais e especialidades (P) 27](#351-rf028-gerenciar-profissionais-e-especialidades-p)

[3.5.2 \[RF029\] Gerenciar usuários e perfis de acesso (P) 28](#352-rf029-gerenciar-usuários-e-perfis-de-acesso-p)

[3.5.3 \[RF030\] Visualizar painel gerencial de indicadores (V) 28](#353-rf030-visualizar-painel-gerencial-de-indicadores-v)

[3.5.4 \[RF031\] Emitir relatórios operacionais (V) 29](#354-rf031-emitir-relatórios-operacionais-v)

[3.5.5 \[RF032\] Consultar trilha de auditoria (P) 29](#355-rf032-consultar-trilha-de-auditoria-p)

[**4. Capítulo 3 — Requisitos não funcionais 31**](#4-capítulo-3--requisitos-não-funcionais)

[4.1 Usabilidade 31](#41-usabilidade)

[4.1.1 \[NF001\] Agendamento em poucas etapas (P) 31](#411-nf001-agendamento-em-poucas-etapas-p)

[4.1.2 \[NF002\] Eficiência operacional na recepção (V) 31](#412-nf002-eficiência-operacional-na-recepção-v)

[4.1.3 \[NF003\] Acessibilidade digital (P) 31](#413-nf003-acessibilidade-digital-p)

[4.1.4 \[NF004\] Facilidade de aprendizado (P) 31](#414-nf004-facilidade-de-aprendizado-p)

[4.2 Confiabilidade 32](#42-confiabilidade)

[4.2.1 \[NF005\] Integridade e imutabilidade do registro clínico (P) 32](#421-nf005-integridade-e-imutabilidade-do-registro-clínico-p)

[4.2.2 \[NF006\] Disponibilidade do sistema (P) 32](#422-nf006-disponibilidade-do-sistema-p)

[4.2.3 \[NF007\] Backup e recuperação de desastres (P) 32](#423-nf007-backup-e-recuperação-de-desastres-p)

[4.2.4 \[NF008\] Tolerância a falhas durante o atendimento (V) 32](#424-nf008-tolerância-a-falhas-durante-o-atendimento-v)

[4.3 Desempenho 32](#43-desempenho)

[4.3.1 \[NF009\] Tempo de resposta das operações (P) 32](#431-nf009-tempo-de-resposta-das-operações-p)

[4.3.2 \[NF010\] Capacidade de carga e crescimento (P) 33](#432-nf010-capacidade-de-carga-e-crescimento-p)

[4.3.3 \[NF011\] Qualidade da transmissão da teleconsulta (P) 33](#433-nf011-qualidade-da-transmissão-da-teleconsulta-p)

[4.4 Segurança 33](#44-segurança)

[4.4.1 \[NF012\] Controle de acesso baseado em perfil (P) 33](#441-nf012-controle-de-acesso-baseado-em-perfil-p)

[4.4.2 \[NF013\] Autenticação e proteção de credenciais (P) 33](#442-nf013-autenticação-e-proteção-de-credenciais-p)

[4.4.3 \[NF014\] Criptografia de dados em trânsito e em repouso (P) 33](#443-nf014-criptografia-de-dados-em-trânsito-e-em-repouso-p)

[4.4.4 \[NF015\] Trilha de auditoria completa (P) 34](#444-nf015-trilha-de-auditoria-completa-p)

[4.4.5 \[NF016\] Conformidade com a LGPD (P) 34](#445-nf016-conformidade-com-a-lgpd-p)

[4.4.6 \[NF017\] Conformidade com normas do setor de saúde (V) 34](#446-nf017-conformidade-com-normas-do-setor-de-saúde-v)

[4.5 Distribuição 34](#45-distribuição)

[4.5.1 \[NF018\] Acesso via navegador sem instalação (P) 34](#451-nf018-acesso-via-navegador-sem-instalação-p)

[4.5.2 \[NF019\] Uso em dispositivos móveis (P) 34](#452-nf019-uso-em-dispositivos-móveis-p)

[4.6 Padrões 35](#46-padrões)

[4.6.1 \[NF020\] Consistência de interface (V) 35](#461-nf020-consistência-de-interface-v)

[4.6.2 \[NF021\] Clareza nas mensagens do sistema (P) 35](#462-nf021-clareza-nas-mensagens-do-sistema-p)

[4.6.3 \[NF022\] Padrões de terminologia e interoperabilidade (V) 35](#463-nf022-padrões-de-terminologia-e-interoperabilidade-v)

[4.7 Hardware e software 35](#47-hardware-e-software)

[4.7.1 \[NF023\] Compatibilidade com navegadores modernos (V) 35](#471-nf023-compatibilidade-com-navegadores-modernos-v)

[4.7.2 \[NF024\] Infraestrutura de hospedagem (P) 35](#472-nf024-infraestrutura-de-hospedagem-p)

[4.7.3 \[NF025\] Requisitos mínimos do usuário para teleconsulta (P) 36](#473-nf025-requisitos-mínimos-do-usuário-para-teleconsulta-p)

[**5. Capítulo 4 — Gerenciamento de requisitos 37**](#5-capítulo-4--gerenciamento-de-requisitos)

[5.1 Matriz de rastreabilidade 37](#51-matriz-de-rastreabilidade)

[5.2 Priorização e roadmap de entregas 38](#52-priorização-e-roadmap-de-entregas)

[5.3 Controle de mudanças e versionamento 38](#53-controle-de-mudanças-e-versionamento)

# **1. Introdução**

Este documento especifica o sistema **VidaPlena Connected Care**, reunindo as informações necessárias ao planejamento, desenvolvimento, teste, homologação e validação da solução contratada pela Clínica VidaPlena.

A VidaPlena é uma clínica médica de médio porte que realiza cerca de **200 atendimentos por dia** distribuídos em **8 especialidades**. Apesar do crescimento da operação, a clínica ainda agenda consultas exclusivamente por telefone, controla a agenda em planilhas eletrônicas, mantém o prontuário em papel e realiza teleconsultas por aplicativos de mensagem pessoais. Esse cenário produz três problemas recorrentes: dupla reserva de horários, lentidão e insegurança no acesso ao histórico clínico e fragmentação da experiência do paciente.

O VidaPlena Connected Care propõe substituir esse conjunto de ferramentas desconectadas por uma plataforma web única, que integra **agendamento online**, **prontuário eletrônico** e **teleconsulta segura**, além de oferecer um **painel gerencial** com indicadores de ocupação e absenteísmo. Em termos práticos, o sistema cobre o ciclo completo do paciente: agendar, lembrar, atender e registrar.

Trata-se de um sistema que manipula dados pessoais sensíveis de saúde. Por essa razão, requisitos de segurança, sigilo, rastreabilidade e conformidade legal não são tratados aqui como aspectos acessórios, mas como condições de aceitação do produto.

Este documento foi redigido para ser compreendido tanto pela equipe técnica quanto pelos profissionais da clínica, pela direção e por avaliadores acadêmicos, descrevendo não apenas o que o sistema faz, mas como esse funcionamento será percebido por quem o utiliza.

## **1.1 Visão geral deste documento**

Esta introdução apresenta os objetivos do documento, o contexto do sistema e as convenções adotadas. As demais seções estão organizadas da seguinte forma:

- **Capítulo 1 — Descrição geral do sistema:** apresenta o objetivo do VidaPlena Connected Care, seu escopo, sua abrangência, os perfis de usuário, os stakeholders, as técnicas de elicitação empregadas, as regras de negócio e as restrições do projeto.

- **Capítulo 2 — Requisitos funcionais (casos de uso):** descreve o que o sistema deverá fazer na prática, detalhando os fluxos de uso por pacientes, recepção, profissionais de saúde e gestão.
- **Capítulo 3 — Requisitos não funcionais:** apresenta as características de qualidade do sistema, como usabilidade, confiabilidade, desempenho, segurança, distribuição, padrões e requisitos de ambiente.
- **Capítulo 4 — Gerenciamento de requisitos:** apresenta a matriz de rastreabilidade, a priorização das entregas por sprint e o processo de controle de mudanças.

## **1.2 Convenções, termos e abreviações**

Para facilitar a leitura deste documento, foram adotadas as convenções abaixo:

- **\[RFxxx]** identifica um requisito funcional, ou seja, uma ação que o sistema deverá executar.
- **\[NFxxx]** identifica um requisito não funcional, ou seja, uma característica de qualidade ou restrição do sistema.
- **\[RNxx]** identifica uma regra de negócio da clínica que condiciona o comportamento do sistema.
- **(P)** indica requisito **permanente**, derivado da natureza do domínio e com baixa probabilidade de mudança ao longo do projeto.
- **(V)** indica requisito **volátil**, sujeito a alteração conforme decisões de negócio, feedback dos usuários ou mudanças regulatórias.
- A **prioridade** de cada requisito é classificada em: **Essencial** (sem ele o sistema não entra em operação), **Importante** (sua ausência degrada significativamente o valor entregue, mas não impede a operação) e **Desejável** (agrega valor e pode ser postergado para versões futuras).
- **Paciente** representa a pessoa atendida pela clínica, que agenda consultas e acompanha seu histórico.
- **Recepcionista** representa o profissional administrativo responsável pela agenda, pelo atendimento telefônico e presencial e pelo check-in.
- **Profissional de saúde** (ou médico) representa quem realiza o atendimento clínico, presencial ou remoto, e registra o prontuário.
- **Gestor da clínica** representa a direção, responsável pelas configurações de negócio e pelo acompanhamento de indicadores.
- **Administrador do sistema** representa o responsável técnico pela operação da plataforma, por usuários, permissões e auditoria.
- **Prontuário eletrônico do paciente (PEP)** é o registro clínico digital, unificado e cronológico dos atendimentos.
- **Teleconsulta** é o atendimento clínico realizado a distância por videoconferência, nos termos da regulamentação do Conselho Federal de Medicina.
- **No-show** é a ausência do paciente a uma consulta agendada sem cancelamento prévio.
- **LGPD** — Lei nº 13.709/2018, Lei Geral de Proteção de Dados Pessoais.
- **CFM** — Conselho Federal de Medicina. **SBIS** — Sociedade Brasileira de Informática em Saúde.
- **RBAC** — controle de acesso baseado em papéis (Role-Based Access Control).
- **RPO / RTO** — perda máxima de dados tolerada e tempo máximo de restabelecimento após um desastre.

## **1.3 Referências**

- Modelo de Documento de Requisitos utilizado na disciplina de Engenharia de Software.
- SOMMERVILLE, Ian. \*Engenharia de Software*.
- PRESSMAN, Roger. \*Engenharia de Software: Uma Abordagem Profissional*.
- BRASIL. Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais (LGPD).
- CONSELHO FEDERAL DE MEDICINA. Resolução CFM nº 1.821/2007 — digitalização e guarda de prontuários.
- CONSELHO FEDERAL DE MEDICINA. Resolução CFM nº 2.314/2022 — normas para a telemedicina.
- SBIS/CFM. Manual de Certificação para Sistemas de Registro Eletrônico em Saúde (níveis de garantia de segurança).
- W3C. \*Web Content Accessibility Guidelines (WCAG) 2.1*.
- HL7 INTERNATIONAL. \*Fast Healthcare Interoperability Resources (FHIR) R4*.
- Apresentação institucional **VidaPlena Connected Care** e enunciado do cenário SP1 — Clínica VidaPlena.

# **2. Capítulo 1 — Descrição geral do sistema**

O **VidaPlena Connected Care** é uma plataforma web de gestão do cuidado ambulatorial criada para digitalizar e integrar os três processos críticos da Clínica VidaPlena: a marcação de consultas, o registro clínico e o atendimento remoto.

Na prática, o sistema foi concebido para resolver um problema concreto e mensurável. Hoje, a agenda vive em uma planilha manipulada simultaneamente por mais de uma recepcionista, o que produz dupla reserva; o histórico do paciente vive em pastas de papel, o que faz o profissional gastar minutos de consulta procurando informação; e a teleconsulta acontece em um aplicativo pessoal, fora de qualquer registro institucional, o que cria risco jurídico e perda de informação clínica.

Ao centralizar esses fluxos em um único ambiente, a plataforma permitirá que:

- o paciente agende, reagende ou cancele sua consulta pela internet, a qualquer hora, sem depender da fila telefônica;
- o sistema impeça automaticamente conflitos de horário, eliminando a dupla reserva na origem;
- a recepção acompanhe a agenda do dia, confirme presenças e gerencie encaixes a partir de uma visão única;
- o profissional de saúde abra o prontuário completo do paciente em segundos, registre a evolução clínica, prescreva e solicite exames de forma digital e assinada;
- a teleconsulta ocorra dentro da própria plataforma, vinculada ao agendamento e ao prontuário, com consentimento registrado;
- a gestão acompanhe indicadores de ocupação, absenteísmo e produtividade por especialidade;
- toda ação sobre dados de saúde fique registrada em trilha de auditoria, atendendo à LGPD e às normas do CFM.

O objetivo de negócio é direto: reduzir a dupla reserva a zero, reduzir o absenteísmo por meio de lembretes automáticos, eliminar o prontuário em papel e aumentar a capacidade de atendimento da clínica sem aumentar proporcionalmente o esforço administrativo.

## **2.1 Abrangência e sistemas relacionados**

O VidaPlena Connected Care será um sistema web responsivo, acessado por navegador, sem necessidade de instalação local para o uso comum dos usuários, tanto em computadores da clínica quanto em dispositivos móveis dos pacientes.

Em sua primeira versão, o sistema abrangerá os seguintes processos:

- cadastro e autenticação de pacientes, recepcionistas, profissionais de saúde, gestores e administradores;
- registro do consentimento de tratamento de dados pessoais e sensíveis;
- publicação e manutenção da grade de horários por profissional e por especialidade;
- agendamento, reagendamento e cancelamento de consultas presenciais e remotas;
- bloqueio automático de conflitos de agenda e controle de sala e recursos;
- lista de espera e encaixe de pacientes;
- envio de lembretes automáticos de consulta;
- check-in na recepção e registro de ausências;
- prontuário eletrônico com evolução clínica, alergias, prescrição, solicitação de exames e anexos;
- emissão de documentos clínicos com assinatura digital;
- teleconsulta por vídeo integrada ao agendamento e ao prontuário;
- painel gerencial com indicadores operacionais e relatórios;
- administração de usuários, perfis, permissões e trilha de auditoria.

Não fazem parte do escopo desta versão: gestão financeira e faturamento de convênios, controle de estoque e farmácia, gestão de internação ou de leitos, folha de pagamento e demais funções de um ERP hospitalar. A plataforma também não substitui o atendimento presencial, funcionando como complemento a ele.

Quanto a sistemas relacionados, o VidaPlena Connected Care dependerá de um **serviço de envio de notificações** (e-mail e mensagens) e de uma **infraestrutura de videoconferência baseada em WebRTC**. Está previsto o uso de **certificado digital ICP-Brasil** para assinatura de prescrições e atestados. Em versões futuras, poderá integrar-se a operadoras de planos de saúde pelo padrão TISS, a laboratórios para recebimento automático de resultados de exames, a gateways de pagamento e a sistemas de terceiros por meio de interfaces baseadas em HL7 FHIR.

## **2.2 Descrição dos usuários**

O sistema foi pensado para atender cinco perfis principais de usuário: paciente, recepcionista, profissional de saúde, gestor da clínica e administrador do sistema.

Todos acessam a plataforma por meio de autenticação individual. Cada perfil visualiza apenas as funcionalidades e os dados compatíveis com sua função, princípio que é especialmente rigoroso neste domínio: o acesso a informações clínicas é restrito a quem participa do cuidado daquele paciente.

### **2.2.1 Paciente**

O paciente é o usuário final do serviço prestado pela clínica e o principal beneficiário da digitalização. Ele utilizará a plataforma para localizar especialidades e profissionais, consultar horários disponíveis, agendar, reagendar ou cancelar consultas, receber lembretes, entrar na sala de teleconsulta e acompanhar seus documentos e orientações.

O perfil de pacientes da VidaPlena é heterogêneo em idade e familiaridade com tecnologia. Por isso, o ambiente do paciente deve ser simples, com linguagem não técnica, poucas etapas e funcionamento adequado em telefones celulares de configuração modesta. O paciente nunca edita conteúdo clínico: seu acesso ao histórico é de leitura.

### **2.2.2 Recepcionista**

A recepcionista é a usuária mais intensiva do sistema no dia a dia. É ela quem hoje absorve o custo do processo manual, apagando incêndios gerados por conflitos de agenda.

Na nova plataforma, utilizará o sistema como painel operacional: visualizará a agenda do dia por profissional, realizará agendamentos para pacientes que continuarem ligando por telefone, fará reagendamentos e cancelamentos, registrará a chegada dos pacientes, gerenciará a lista de espera e os encaixes e registrará ausências. Não tem acesso ao conteúdo clínico do prontuário, apenas aos dados administrativos do atendimento.

### **2.2.3 Profissional de saúde**

O profissional de saúde é o usuário que produz e consome a informação clínica. Utilizará o sistema para visualizar sua agenda, abrir o prontuário do paciente, consultar o histórico de atendimentos anteriores, registrar anamnese e evolução, registrar alergias e condições críticas, emitir prescrições e atestados assinados digitalmente, solicitar exames e conduzir teleconsultas.

O tempo de consulta é curto e o custo de uma interface lenta ou confusa é alto. O sistema deve, portanto, priorizar leitura rápida do histórico, poucos cliques para registrar e recursos que reduzam digitação, como modelos de texto e reaproveitamento de informações de atendimentos anteriores. O profissional também é responsável legal pelo conteúdo que registra, o que exige identificação inequívoca do autor em cada registro.

### **2.2.4 Gestor da clínica**

O gestor é o responsável pela operação e pelos resultados da clínica. Utilizará o sistema para cadastrar e manter especialidades e profissionais, definir a duração padrão das consultas, configurar políticas de agendamento e acompanhar indicadores de ocupação, absenteísmo, tempo de espera e volume de atendimentos por especialidade.

Seu interesse principal é enxergar a operação com dados, e não por percepção. Os relatórios a que tem acesso devem apresentar informações agregadas, sem exposição desnecessária de conteúdo clínico identificável.

### **2.2.5 Administrador do sistema**

O administrador é o responsável técnico pela plataforma. Gerencia contas de usuário, atribui e revoga perfis de acesso, bloqueia contas, acompanha a trilha de auditoria, monitora a disponibilidade e o desempenho do sistema e coordena os procedimentos de backup e recuperação.

Embora possua o maior nível de privilégio administrativo, o administrador não deve ter acesso irrestrito ao conteúdo clínico dos prontuários: suas ações sobre dados sensíveis são limitadas e integralmente auditadas.

## **2.3 Mapeamento de stakeholders**

- **Paciente (usuário direto principal):** busca acesso simples e rápido à marcação de consultas, previsibilidade de horário, atendimento remoto quando conveniente e clareza sobre orientações e documentos recebidos. É o stakeholder cuja experiência define o sucesso percebido do produto.
- **Recepcionista (usuário direto operacional):** necessita de uma agenda confiável, livre de conflitos, com visão única do dia e operações rápidas para atender quem liga enquanto atende quem está no balcão. É a principal fonte de requisitos sobre casos de exceção do agendamento.
- **Profissional de saúde (usuário direto clínico):** necessita de acesso imediato e completo ao histórico, registro clínico ágil e juridicamente válido e teleconsulta estável. Tem baixa tolerância a sistemas que aumentem o tempo de registro.
- **Gestor / diretoria da clínica (patrocinador do projeto):** financia a solução e cobra resultado. Seus critérios são redução de dupla reserva e de absenteísmo, aumento da taxa de ocupação e melhoria da reputação da clínica.
- **Equipe de desenvolvimento e manutenção (TI):** responsável por construir, testar, implantar e evoluir o sistema. Necessita de requisitos claros, verificáveis e estáveis, e de uma arquitetura que suporte crescimento e manutenção.
- **Encarregado de proteção de dados (DPO) e assessoria jurídica:** zelam pela conformidade com a LGPD e com as resoluções do CFM. Definem requisitos de consentimento, retenção, auditoria e resposta a solicitações de titulares.
- **Conselhos profissionais e órgãos reguladores (stakeholders indiretos):** não usam o sistema, mas impõem restrições obrigatórias sobre validade do prontuário digital, assinatura de documentos e prática da telemedicina.
- **Operadoras de planos de saúde e laboratórios parceiros (stakeholders futuros):** tornam-se relevantes nas versões seguintes, quando entrarem em escopo a integração TISS e o recebimento automatizado de resultados de exames.

## **2.4 Técnicas de elicitação**

A especificação apresentada neste documento foi construída a partir da combinação das técnicas descritas a seguir, escolhidas pela natureza do domínio e pela diversidade dos perfis envolvidos.

- **Entrevista semiestruturada com profissionais de saúde e com a direção:** conduzida individualmente com médicos de diferentes especialidades e com o gestor da clínica, com perguntas abertas como “o que você precisa saber sobre o paciente nos primeiros trinta segundos da consulta?”. Permitiu identificar requisitos não evidentes, como a necessidade de destacar alergias e condições críticas no topo do prontuário e a exigência de adendo em vez de edição livre do registro clínico.
- **Observação direta do processo atual (etnografia):** acompanhamento de um turno completo na recepção, com registro do fluxo de chamadas, das interrupções e dos pontos em que a planilha é editada. Foi essa técnica que evidenciou a origem real da dupla reserva — duas atendentes editando a mesma planilha em paralelo — e a necessidade de bloqueio no momento da confirmação, e não apenas de aviso posterior.
- **Análise de documentos e artefatos existentes:** exame das planilhas de agenda, das fichas de prontuário em papel, dos modelos de atestado e dos históricos de conversas de teleconsulta. Forneceu o vocabulário do domínio, os campos efetivamente utilizados e as estruturas de dados que o sistema precisa espelhar.
- **Questionário online com pacientes (survey):** aplicado a uma amostra ampla, com perguntas fechadas e escalas de Likert, para priorizar funcionalidades como lembrete automático, cancelamento pelo próprio paciente, teleconsulta e acesso a documentos. Confirmou o lembrete de 24 horas como o recurso de maior impacto percebido.
- **Prototipação e validação com usuários:** apresentação de protótipos navegáveis de baixa e média fidelidade à recepção e aos médicos, em ciclos curtos. Foi a técnica que originou a meta de agendamento em até quatro cliques e o formato do painel de agenda do dia.
- **Workshop de requisitos com stakeholders (JAD):** reunião conjunta entre direção, recepção, corpo clínico e equipe de desenvolvimento para negociar escopo, resolver conflitos entre perfis e definir a fronteira do que o sistema não é, consolidando as premissas e restrições da seção 2.6.

## **2.5 Regras de negócio**

As regras de negócio a seguir traduzem políticas da clínica e exigências regulatórias que condicionam o comportamento do sistema. São referenciadas pelos casos de uso do Capítulo 2.

| **ID** | **Descrição da regra** |
| --- | --- |
| **RN01** | Um mesmo profissional não pode ter dois atendimentos confirmados com sobreposição de horário; a mesma restrição vale para a sala ou o recurso físico alocado ao atendimento presencial. |
| **RN02** | A duração padrão do atendimento é definida por especialidade e por tipo de consulta (primeira consulta ou retorno), sendo configurável pelo gestor da clínica. |
| **RN03** | A agenda online disponibiliza ao paciente apenas horários com, no mínimo, duas horas de antecedência em relação ao momento da consulta. |
| **RN04** | O paciente pode cancelar ou reagendar pela plataforma até quatro horas antes do horário marcado; após esse prazo, a operação exige intermediação da recepção. |
| **RN05** | Um lembrete automático é enviado ao paciente 24 horas antes do atendimento; a ausência sem cancelamento prévio é registrada como no-show no histórico do paciente. |
| **RN06** | Três ausências não justificadas em um período de doze meses suspendem o autoagendamento online do paciente, que passa a agendar apenas pela recepção. |
| **RN07** | O conteúdo clínico do prontuário só pode ser acessado por profissionais de saúde vinculados a um atendimento do paciente, ou mediante acesso de urgência justificado e auditado. |
| **RN08** | Um registro de evolução clínica pode ser corrigido pelo próprio autor em até 24 horas; após esse prazo, alterações são feitas exclusivamente por adendo, preservando-se integralmente o conteúdo original e sua autoria. |
| **RN09** | Prescrições e atestados somente têm validade após assinatura digital com certificado ICP-Brasil do profissional responsável. |
| **RN10** | A teleconsulta só pode ser iniciada após o aceite registrado do termo de consentimento específico pelo paciente. |
| **RN11** | A gravação da teleconsulta é opcional e depende de consentimento explícito e registrado do paciente, podendo ser revogado. |
| **RN12** | Os registros do prontuário eletrônico devem ser preservados por, no mínimo, vinte anos contados do último atendimento, sem possibilidade de exclusão física durante esse período. |

## **2.6 Premissas e restrições**

**Premissas assumidas para o projeto:**

- a clínica dispõe de conexão de internet estável e de computadores compatíveis com navegadores modernos em todos os consultórios e na recepção;
- os profissionais de saúde possuem, ou obterão, certificado digital ICP-Brasil para assinatura de documentos;
- a direção designará um responsável pelo tratamento de dados pessoais (encarregado/DPO);
- a base histórica em papel será digitalizada de forma progressiva, e não como pré-condição para a entrada em operação do sistema.

**Restrições impostas ao projeto:**

- o sistema deve ser entregue de forma incremental em quatro sprints, conforme o roadmap da seção 5.2;
- os dados devem ser hospedados em infraestrutura localizada em território nacional;
- a solução deve observar as Resoluções CFM nº 1.821/2007 e nº 2.314/2022 e a Lei nº 13.709/2018 (LGPD);
- a operação da clínica não pode ser interrompida durante a implantação, exigindo período de operação assistida com convivência controlada entre o processo atual e o novo sistema;
- o sistema não substitui o atendimento presencial nem se propõe a ser um ERP hospitalar.

# **3. Capítulo 2 — Requisitos funcionais (casos de uso)**

Esta seção apresenta os requisitos funcionais do VidaPlena Connected Care. Cada requisito descreve uma funcionalidade concreta do sistema, explicando não apenas o que ele faz, mas também como esse funcionamento será percebido por quem utiliza a plataforma, incluindo os desvios previstos e o tratamento de exceções.

Os requisitos estão agrupados em cinco módulos: acesso e identidade, agendamento, prontuário eletrônico, teleconsulta e administração e gestão.

## **3.1 Acesso e identidade**

Esta subseção agrupa os casos de uso relacionados ao primeiro contato do usuário com o sistema: criação de conta, entrada na plataforma, recuperação de acesso e registro do consentimento para tratamento de dados pessoais.

### **3.1.1 \[RF001] Cadastrar paciente (P)**

Este caso de uso descreve como um paciente passa a existir no sistema, seja por autocadastro pela internet, seja por cadastro realizado pela recepção durante um atendimento telefônico ou presencial.

**Ator:** Paciente, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** devem ser informados nome completo, data de nascimento, CPF, telefone celular, e-mail e, no caso do autocadastro, senha e confirmação de senha. O CPF informado não pode pertencer a um cadastro já existente.

**Saídas e pós-condições:** o paciente passa a possuir um registro único na base da clínica, apto a ser vinculado a agendamentos e a um prontuário.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O usuário acessa a página inicial do sistema e escolhe a opção de criar cadastro.

2\. O sistema apresenta o formulário com os dados pessoais e de contato necessários.

3\. O usuário preenche os dados solicitados.

4\. O sistema valida o formato do CPF, da data de nascimento, do telefone e do e-mail.

5\. O sistema verifica se já existe um paciente com o mesmo CPF.

6\. O sistema apresenta o termo de consentimento de tratamento de dados pessoais e de saúde (RF004).

7\. O usuário registra seu aceite.

8\. O sistema cria o cadastro do paciente e confirma a conclusão da operação.

**Fluxos secundários (alternativos e de exceção):**

- Se o CPF já estiver cadastrado, o sistema informa a existência do registro e oferece a recuperação de acesso em vez de criar uma duplicidade.
- Se algum dado obrigatório estiver ausente ou em formato inválido, o sistema indica precisamente qual campo precisa de correção, sem descartar o que já foi preenchido.
- Se a senha e sua confirmação não coincidirem, ou se a senha não atender à política mínima de complexidade, o sistema solicita correção.
- Se o termo de consentimento não for aceito, o cadastro não é concluído e o sistema informa que o aceite é condição para a prestação do serviço digital.
- No cadastro realizado pela recepção, o sistema gera credencial provisória e envia ao paciente instruções para definição de senha no primeiro acesso.

### **3.1.2 \[RF002] Realizar login (P)**

Este caso de uso descreve como qualquer usuário entra no sistema e é direcionado ao ambiente correspondente ao seu perfil.

**Ator:** Paciente, Recepcionista, Profissional de saúde, Gestor, Administrador

**Prioridade:** Essencial

**Entradas e pré-condições:** o usuário deve possuir conta ativa e informar credenciais válidas. Usuários internos da clínica devem dispor do segundo fator de autenticação configurado.

**Saídas e pós-condições:** o usuário é autenticado, tem sua sessão iniciada e é direcionado ao painel compatível com seu perfil; a tentativa de acesso é registrada na trilha de auditoria.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O usuário acessa a tela de login.

2\. O sistema solicita identificação e senha.

3\. O usuário informa suas credenciais.

4\. O sistema verifica as credenciais informadas.

5\. Tratando-se de usuário interno da clínica, o sistema solicita o segundo fator de autenticação.

6\. O usuário informa o código do segundo fator.

7\. O sistema identifica o perfil do usuário e as permissões associadas.

8\. O sistema libera o acesso, abre o painel correspondente e registra o evento de autenticação.

**Fluxos secundários (alternativos e de exceção):**

- Se as credenciais estiverem incorretas, o sistema informa falha de autenticação sem revelar qual dos dois campos está errado.
- Após cinco tentativas malsucedidas consecutivas, o sistema bloqueia temporariamente a conta e notifica o usuário e o administrador.
- Se a conta estiver inativa, bloqueada ou suspensa, o sistema informa que o acesso não está disponível e orienta o contato com a clínica.
- Se o segundo fator não for validado, o acesso não é concedido e a tentativa é registrada.
- Se a senha estiver expirada pela política de segurança, o sistema conduz o usuário à redefinição antes de liberar o acesso.

### **3.1.3 \[RF003] Recuperar senha (P)**

Este caso de uso descreve o processo de recuperação de acesso quando o usuário esquece sua senha.

**Ator:** Paciente, Recepcionista, Profissional de saúde, Gestor, Administrador

**Prioridade:** Importante

**Entradas e pré-condições:** o usuário deve informar um e-mail ou CPF vinculado a uma conta existente.

**Saídas e pós-condições:** o usuário redefine sua senha e volta a acessar a plataforma; todas as sessões ativas anteriores são encerradas.

**Fluxo de eventos principal:**

1\. O usuário seleciona a opção de recuperação de acesso.

2\. O sistema solicita o e-mail ou o CPF cadastrado.

3\. O usuário informa o dado solicitado.

4\. O sistema verifica a existência da conta e envia um link de redefinição com prazo de validade ao canal cadastrado.

5\. O usuário acessa o link e define uma nova senha.

6\. O sistema valida a nova senha contra a política de complexidade, atualiza a credencial e encerra as sessões ativas.

7\. O sistema confirma a conclusão e registra o evento na trilha de auditoria.

**Fluxos secundários (alternativos e de exceção):**

- Se o dado informado não corresponder a nenhuma conta, o sistema exibe a mesma mensagem genérica de envio, evitando confirmar a existência de cadastros a terceiros.
- Se o link de redefinição estiver expirado ou já utilizado, o sistema informa a invalidade e permite nova solicitação.
- Se a nova senha for igual a uma das últimas utilizadas, o sistema solicita outra.

### **3.1.4 \[RF004] Registrar consentimento de tratamento de dados (P)**

Este caso de uso descreve o registro, a consulta e a revogação do consentimento do paciente para o tratamento de seus dados pessoais e de saúde, exigência da Lei Geral de Proteção de Dados para dados sensíveis.

**Ator:** Paciente, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** deve existir um cadastro de paciente e uma versão vigente do termo de consentimento publicada pela clínica.

**Saídas e pós-condições:** o aceite ou a revogação ficam registrados com data, hora, versão do termo e origem da manifestação, de forma auditável.

**Regras de negócio associadas:** RN07, RN11, RN12

**Fluxo de eventos principal:**

1\. O sistema apresenta ao paciente a versão vigente do termo, em linguagem clara, indicando finalidades e prazos de guarda.

2\. O paciente lê o termo e manifesta seu aceite.

3\. O sistema registra o aceite com identificação do paciente, data, hora e versão do documento.

4\. O sistema disponibiliza ao paciente, em sua área pessoal, o histórico de consentimentos e a opção de revogação.

**Fluxos secundários (alternativos e de exceção):**

- Se o paciente recusar o termo, o sistema registra a recusa e limita o uso dos serviços digitais, mantendo a possibilidade de atendimento presencial pelos meios convencionais.
- Se a clínica publicar uma nova versão do termo, o sistema solicita novo aceite no acesso seguinte, sem apagar os registros anteriores.
- Se o paciente revogar o consentimento, o sistema registra a revogação e interrompe os tratamentos dela dependentes, preservando os dados cuja guarda é obrigatória por determinação legal, conforme RN12.

### **3.1.5 \[RF005] Manter dados do próprio cadastro (P)**

Este caso de uso descreve como o usuário mantém atualizados seus dados pessoais e de contato e exerce seus direitos de acesso e portabilidade previstos na LGPD.

**Ator:** Paciente, Recepcionista, Profissional de saúde, Gestor, Administrador

**Prioridade:** Importante

**Entradas e pré-condições:** o usuário deve estar autenticado.

**Saídas e pós-condições:** os dados cadastrais são atualizados e a alteração fica registrada na trilha de auditoria.

**Fluxo de eventos principal:**

1\. O usuário acessa a área de dados pessoais.

2\. O sistema exibe as informações atuais e indica quais campos podem ser alterados diretamente.

3\. O usuário altera os dados desejados e confirma.

4\. O sistema valida o formato das informações e grava a alteração.

5\. O sistema confirma a atualização e registra o evento.

**Fluxos secundários (alternativos e de exceção):**

- Se o usuário alterar e-mail ou telefone, o sistema exige confirmação pelo novo canal antes de torná-lo oficial para notificações.
- Campos de identificação legal, como CPF e data de nascimento, só podem ser corrigidos mediante solicitação à clínica, com registro do responsável pela correção.
- O paciente pode solicitar, pela mesma área, a exportação de seus dados em formato legível e a exclusão dos dados não sujeitos à guarda obrigatória.

## **3.2 Agendamento**

Esta subseção concentra os casos de uso do módulo que substitui a planilha e o atendimento exclusivamente telefônico. É aqui que se resolve o problema mais visível da clínica: a dupla reserva de horários.

### **3.2.1 \[RF006] Consultar disponibilidade de horários (P)**

Este caso de uso descreve como o usuário localiza horários livres para atendimento, filtrando por especialidade, profissional, modalidade e período.

**Ator:** Paciente, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** devem existir profissionais ativos com grade de horários publicada (RF011).

**Saídas e pós-condições:** o sistema apresenta a lista de horários efetivamente disponíveis, já descontados os atendimentos confirmados e os bloqueios.

**Regras de negócio associadas:** RN02, RN03

**Fluxo de eventos principal:**

1\. O usuário acessa a área de agendamento.

2\. O sistema apresenta os filtros de especialidade, profissional, modalidade (presencial ou teleconsulta) e período desejado.

3\. O usuário seleciona os critérios de busca.

4\. O sistema consulta a grade dos profissionais que atendem aos critérios.

5\. O sistema remove da lista os horários já ocupados, bloqueados ou fora da antecedência mínima definida em RN03.

6\. O sistema exibe os horários disponíveis organizados por dia e por profissional.

**Fluxos secundários (alternativos e de exceção):**

- Se não houver horário disponível no período pesquisado, o sistema informa a indisponibilidade, sugere a data livre mais próxima e oferece a inclusão em lista de espera (RF012).
- Se o paciente não selecionar profissional específico, o sistema apresenta os horários de todos os profissionais da especialidade escolhida.
- Se um horário for ocupado por outro usuário enquanto a lista está aberta, ele deixa de ser oferecido na atualização seguinte da tela.

### **3.2.2 \[RF007] Agendar consulta (P)**

Este caso de uso descreve a marcação de um atendimento, presencial ou remoto, realizada pelo próprio paciente pela internet ou pela recepção em nome dele.

**Ator:** Paciente, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** o paciente deve estar cadastrado e com consentimento vigente; deve haver horário disponível conforme RF006.

**Saídas e pós-condições:** o atendimento é confirmado, o horário deixa de estar disponível para qualquer outro usuário, o paciente recebe a confirmação e o compromisso passa a constar da agenda do profissional.

**Regras de negócio associadas:** RN01, RN02, RN03, RN06

**Fluxo de eventos principal:**

1\. O usuário localiza o horário desejado por meio de RF006.

2\. O usuário seleciona o horário e informa o tipo de atendimento (primeira consulta ou retorno) e a modalidade.

3\. O sistema calcula a duração do atendimento conforme a especialidade e o tipo, de acordo com RN02.

4\. O sistema verifica novamente, no momento da confirmação, se o horário e o recurso continuam livres, aplicando RF008.

5\. O usuário confirma a marcação.

6\. O sistema registra o agendamento, reserva o horário e, na modalidade remota, gera o acesso à sala virtual.

7\. O sistema envia a confirmação ao paciente pelos canais cadastrados e programa o lembrete previsto em RN05.

**Fluxos secundários (alternativos e de exceção):**

- Se o horário tiver sido ocupado entre a consulta e a confirmação, o sistema informa a indisponibilidade, não efetiva a marcação e reapresenta as opções próximas.
- Se o paciente já possuir consulta futura marcada na mesma especialidade, o sistema alerta sobre a duplicidade e solicita confirmação explícita antes de prosseguir.
- Se o autoagendamento do paciente estiver suspenso por ausências reiteradas, conforme RN06, o sistema impede a marcação online e orienta o contato com a recepção.
- Se a marcação for para paciente menor de idade ou legalmente representado, o sistema exige a identificação do responsável.
- Se a modalidade for teleconsulta e a especialidade não a admitir, o sistema informa a restrição e oferece apenas horários presenciais.

### **3.2.3 \[RF008] Impedir dupla reserva de horário (P)**

Este caso de uso descreve o mecanismo de controle de concorrência que impede que dois atendimentos sejam confirmados para o mesmo profissional, no mesmo intervalo, ou para a mesma sala. É a resposta direta ao principal problema operacional relatado pela clínica.

**Ator:** Sistema (acionado por RF007, RF009 e RF012)

**Prioridade:** Essencial

**Entradas e pré-condições:** uma solicitação de confirmação de agendamento ou reagendamento em processamento.

**Saídas e pós-condições:** apenas uma solicitação concorrente é efetivada; as demais são recusadas com mensagem explicativa e sem qualquer registro parcial.

**Regras de negócio associadas:** RN01, RN02

**Fluxo de eventos principal:**

1\. O sistema recebe a solicitação de confirmação de um horário.

2\. O sistema bloqueia o intervalo pretendido para o profissional e, no atendimento presencial, também a sala alocada.

3\. O sistema verifica se existe atendimento ativo com sobreposição total ou parcial ao intervalo solicitado.

4\. Não havendo conflito, o sistema efetiva a reserva de forma atômica e libera o bloqueio.

5\. O sistema devolve a confirmação ao caso de uso solicitante.

**Fluxos secundários (alternativos e de exceção):**

- Se houver conflito, o sistema recusa a operação, informa que o horário deixou de estar disponível e não grava registro algum.
- Se duas solicitações disputarem o mesmo horário simultaneamente, apenas a primeira a obter o bloqueio é efetivada; a segunda é recusada com a mesma mensagem.
- Se a confirmação não for concluída no tempo limite da transação, o sistema libera o bloqueio e devolve o horário à disponibilidade.
- A recepção pode registrar um encaixe em intervalo já ocupado apenas por meio de RF012, com justificativa e registro do responsável.

### **3.2.4 \[RF009] Reagendar consulta (P)**

Este caso de uso descreve a transferência de um atendimento já marcado para outro horário, outro profissional ou outra modalidade.

**Ator:** Paciente, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** deve existir atendimento futuro ativo; o paciente só pode reagendar diretamente dentro do prazo previsto em RN04.

**Saídas e pós-condições:** o horário anterior é liberado, o novo horário é reservado e ambas as partes são notificadas.

**Regras de negócio associadas:** RN01, RN03, RN04

**Fluxo de eventos principal:**

1\. O usuário acessa a lista de atendimentos futuros e seleciona o que deseja alterar.

2\. O sistema exibe os dados do atendimento e a opção de reagendamento.

3\. O usuário escolhe o novo horário entre os disponíveis.

4\. O sistema aplica RF008 sobre o novo horário.

5\. O sistema libera o horário anterior, registra o novo e mantém o vínculo com o atendimento original para efeito de histórico.

6\. O sistema notifica paciente e profissional e reprograma o lembrete.

**Fluxos secundários (alternativos e de exceção):**

- Se o prazo de RN04 já tiver sido ultrapassado, o sistema impede o reagendamento pelo paciente e orienta o contato com a recepção, que pode realizá-lo com registro de justificativa.
- Se o novo horário for ocupado durante a operação, o sistema mantém o agendamento original intacto e informa a indisponibilidade.
- Se o reagendamento partir da clínica, por ausência do profissional, o sistema destaca a origem da alteração na notificação ao paciente e oferece as opções disponíveis mais próximas.

### **3.2.5 \[RF010] Cancelar consulta (P)**

Este caso de uso descreve o cancelamento de um atendimento marcado, com a consequente liberação do horário para outros pacientes.

**Ator:** Paciente, Recepcionista, Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** deve existir atendimento futuro ativo.

**Saídas e pós-condições:** o atendimento passa à situação de cancelado, o horário retorna à disponibilidade e a lista de espera é acionada.

**Regras de negócio associadas:** RN04, RN05

**Fluxo de eventos principal:**

1\. O usuário seleciona o atendimento a cancelar.

2\. O sistema apresenta os dados do atendimento e solicita confirmação, informando a política de cancelamento.

3\. O usuário confirma o cancelamento e, quando aplicável, informa o motivo.

4\. O sistema altera a situação do atendimento, preservando o registro para fins de histórico e indicadores.

5\. O sistema libera o horário e notifica os envolvidos.

6\. O sistema verifica a lista de espera e oferece o horário aos pacientes aptos, conforme RF012.

**Fluxos secundários (alternativos e de exceção):**

- Se o cancelamento ocorrer fora do prazo de RN04, o sistema exige intermediação da recepção e registra o responsável pela operação.
- Se o cancelamento partir do profissional ou da clínica, o sistema comunica o paciente de forma destacada e oferece reagendamento imediato.
- O sistema nunca exclui fisicamente o agendamento cancelado, mantendo-o para apuração de indicadores.

### **3.2.6 \[RF011] Gerenciar grade de horários do profissional (P)**

Este caso de uso descreve a definição da disponibilidade de cada profissional: dias e faixas de atendimento, duração das consultas, modalidades aceitas, férias, feriados e bloqueios pontuais.

**Ator:** Gestor, Profissional de saúde, Recepcionista

**Prioridade:** Essencial

**Entradas e pré-condições:** o profissional deve estar cadastrado e ativo (RF028).

**Saídas e pós-condições:** a grade passa a alimentar a consulta de disponibilidade e o agendamento.

**Regras de negócio associadas:** RN01, RN02

**Fluxo de eventos principal:**

1\. O usuário acessa a agenda do profissional.

2\. O sistema exibe a grade atual, com faixas de atendimento e bloqueios vigentes.

3\. O usuário define ou altera dias, horários de início e fim, intervalos, duração padrão e modalidades aceitas.

4\. O sistema valida a consistência da configuração.

5\. O sistema publica a grade e atualiza a disponibilidade oferecida ao público.

**Fluxos secundários (alternativos e de exceção):**

- Se a alteração reduzir a disponibilidade em faixas que já possuem atendimentos confirmados, o sistema lista os atendimentos afetados e exige decisão explícita sobre reagendamento ou cancelamento antes de aplicar a mudança.
- Se houver sobreposição entre faixas configuradas, o sistema aponta o conflito e não publica a grade.
- Bloqueios de emergência, como ausência no mesmo dia, podem ser registrados imediatamente, disparando a comunicação automática aos pacientes afetados.

### **3.2.7 \[RF012] Gerenciar lista de espera e encaixe (V)**

Este caso de uso descreve o registro de pacientes interessados em horários mais próximos e o aproveitamento automático de vagas liberadas por cancelamento.

**Ator:** Paciente, Recepcionista

**Prioridade:** Desejável

**Entradas e pré-condições:** o paciente deve estar cadastrado; a especialidade pesquisada deve estar sem disponibilidade no período desejado.

**Saídas e pós-condições:** o paciente é incluído na lista de espera e, havendo vaga, recebe oferta do horário liberado.

**Regras de negócio associadas:** RN01, RN03

**Fluxo de eventos principal:**

1\. O sistema oferece a inclusão em lista de espera quando não há horário disponível.

2\. O paciente informa as faixas de data e horário em que teria disponibilidade.

3\. O sistema registra a solicitação com data e hora de entrada na fila.

4\. Ao ser liberado um horário compatível, o sistema notifica os pacientes da fila por ordem de chegada.

5\. O primeiro paciente a confirmar tem o horário reservado por meio de RF008.

**Fluxos secundários (alternativos e de exceção):**

- Se ninguém confirmar dentro do prazo estipulado, o horário retorna à disponibilidade pública.
- Se a recepção realizar um encaixe fora da grade, o sistema exige justificativa, registra o responsável e sinaliza o atendimento como encaixe nos indicadores.
- O paciente pode sair da lista de espera a qualquer momento por sua área pessoal.

### **3.2.8 \[RF013] Enviar lembrete automático de consulta (P)**

Este caso de uso descreve o envio automático de avisos ao paciente antes do atendimento, medida destinada à redução do absenteísmo.

**Ator:** Sistema

**Prioridade:** Importante

**Entradas e pré-condições:** deve existir atendimento confirmado e canal de contato válido no cadastro do paciente.

**Saídas e pós-condições:** o lembrete é enviado, o envio é registrado e a eventual resposta do paciente atualiza a situação do atendimento.

**Regras de negócio associadas:** RN05

**Fluxo de eventos principal:**

1\. O sistema identifica os atendimentos que ocorrerão nas próximas 24 horas.

2\. O sistema compõe a mensagem com data, hora, profissional, modalidade e endereço ou link de acesso.

3\. O sistema envia o lembrete pelos canais cadastrados.

4\. O sistema registra a data e a hora do envio.

5\. Havendo confirmação de presença pelo paciente, o sistema atualiza a situação do atendimento.

**Fluxos secundários (alternativos e de exceção):**

- Se o envio falhar, o sistema registra a falha, tenta novamente em intervalo definido e sinaliza o caso na agenda da recepção para contato telefônico.
- Se o paciente responder informando que não poderá comparecer, o sistema conduz ao cancelamento (RF010) e aciona a lista de espera.
- Se o paciente tiver optado por não receber comunicações, o sistema respeita a preferência e registra a ausência de envio.

### **3.2.9 \[RF014] Registrar chegada do paciente (check-in) (P)**

Este caso de uso descreve o registro da presença do paciente na clínica e a organização da fila de atendimento do consultório.

**Ator:** Recepcionista

**Prioridade:** Importante

**Entradas e pré-condições:** deve existir atendimento confirmado para o dia.

**Saídas e pós-condições:** o atendimento passa à situação de aguardando atendimento e aparece na fila do profissional.

**Fluxo de eventos principal:**

1\. A recepcionista localiza o paciente na agenda do dia.

2\. O sistema exibe os dados do atendimento e eventuais pendências cadastrais.

3\. A recepcionista confirma a chegada.

4\. O sistema registra o horário da chegada e altera a situação do atendimento.

5\. O sistema apresenta o paciente na fila do profissional, ordenada por horário previsto.

**Fluxos secundários (alternativos e de exceção):**

- Se o paciente chegar com atraso superior ao tolerado, o sistema sinaliza a situação e permite decisão sobre encaixe ou reagendamento.
- Se houver dados cadastrais desatualizados, o sistema sinaliza a pendência para atualização no balcão.
- Se o paciente chegar sem agendamento, a recepção pode registrar demanda espontânea, que fica sujeita à disponibilidade e ao encaixe.

### **3.2.10 \[RF015] Registrar ausência (no-show) (P)**

Este caso de uso descreve o registro da não comparência do paciente a um atendimento confirmado e seus efeitos sobre indicadores e política de autoagendamento.

**Ator:** Recepcionista, Sistema

**Prioridade:** Importante

**Entradas e pré-condições:** atendimento confirmado cujo horário já transcorreu sem check-in nem cancelamento.

**Saídas e pós-condições:** a ausência é registrada no histórico do paciente e computada nos indicadores de absenteísmo.

**Regras de negócio associadas:** RN05, RN06

**Fluxo de eventos principal:**

1\. O sistema identifica atendimentos encerrados sem registro de presença.

2\. O sistema apresenta a lista à recepção para conferência.

3\. A recepcionista confirma as ausências ou corrige eventuais registros não efetuados.

4\. O sistema grava a ausência no histórico do paciente.

5\. O sistema atualiza o indicador de absenteísmo e verifica a aplicação de RN06.

**Fluxos secundários (alternativos e de exceção):**

- Se o paciente apresentar justificativa posteriormente, a recepção pode registrá-la, mantendo o histórico da alteração e do responsável.
- Se a ausência tiver sido causada por falha da clínica, o registro é classificado de forma distinta e não é computado contra o paciente.
- Ao atingir o limite previsto em RN06, o sistema suspende o autoagendamento online do paciente e notifica a recepção.

## **3.3 Prontuário eletrônico**

Esta subseção reúne os casos de uso que substituem o prontuário em papel. Os requisitos aqui descritos são os mais sensíveis do sistema, pois envolvem sigilo profissional, validade legal do registro e responsabilidade técnica do autor.

### **3.3.1 \[RF016] Abrir prontuário do paciente (P)**

Este caso de uso descreve o acesso do profissional de saúde ao prontuário eletrônico do paciente no momento do atendimento.

**Ator:** Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** o profissional deve estar autenticado e vinculado a um atendimento do paciente, conforme RN07.

**Saídas e pós-condições:** o prontuário é aberto em modo de leitura e edição da evolução corrente; o acesso é registrado na trilha de auditoria.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O profissional seleciona o paciente na fila de atendimento ou na agenda.

2\. O sistema verifica o vínculo do profissional com o atendimento.

3\. O sistema carrega o prontuário e apresenta, em destaque permanente, alergias e condições críticas registradas (RF018).

4\. O sistema apresenta a linha do tempo dos atendimentos anteriores, com resumo de cada um.

5\. O sistema registra o acesso com identificação do profissional, do paciente, da data e da hora.

**Fluxos secundários (alternativos e de exceção):**

- Se o profissional não tiver vínculo com o paciente, o sistema nega o acesso e oferece o procedimento de acesso de urgência (RF023).
- Se o paciente não possuir atendimentos anteriores, o sistema apresenta o prontuário vazio e sinaliza tratar-se de primeira consulta.
- Se houver documentos digitalizados do período anterior à implantação, o sistema os apresenta em seção específica, identificados como registro histórico importado.

### **3.3.2 \[RF017] Registrar evolução clínica (P)**

Este caso de uso descreve o registro da anamnese, do exame físico, das hipóteses diagnósticas e da conduta adotada durante o atendimento.

**Ator:** Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** prontuário aberto por meio de RF016, com atendimento em andamento.

**Saídas e pós-condições:** a evolução é gravada, vinculada ao atendimento e ao autor, passando a integrar o histórico do paciente de forma permanente.

**Regras de negócio associadas:** RN08, RN12

**Fluxo de eventos principal:**

1\. O profissional registra queixa, história clínica, exame físico, hipótese diagnóstica e conduta.

2\. O sistema permite associar códigos de diagnóstico da classificação vigente.

3\. O sistema grava rascunhos automaticamente durante a digitação, evitando perda por falha de conexão.

4\. O profissional finaliza a evolução.

5\. O sistema registra o conteúdo com identificação do autor, data e hora, e encerra o registro para edição livre.

**Fluxos secundários (alternativos e de exceção):**

- Se o profissional precisar corrigir o registro dentro do prazo previsto em RN08, o sistema permite a alteração e mantém o registro da correção.
- Após o prazo, o sistema só admite adendo, preservando integralmente o conteúdo original, sua autoria e sua data.
- Se a sessão expirar com conteúdo não finalizado, o sistema preserva o rascunho e o recupera no acesso seguinte.
- O sistema nunca permite exclusão de evolução finalizada, conforme RN12.

### **3.3.3 \[RF018] Registrar alergias e condições críticas (P)**

Este caso de uso descreve o registro das informações de segurança do paciente que devem ser visíveis em qualquer atendimento, independentemente da especialidade.

**Ator:** Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** prontuário aberto por meio de RF016.

**Saídas e pós-condições:** a informação passa a ser exibida em destaque permanente no prontuário e considerada na prescrição.

**Regras de negócio associadas:** RN07, RN08

**Fluxo de eventos principal:**

1\. O profissional acessa a área de alertas clínicos do paciente.

2\. O sistema exibe as informações já registradas, com autor e data.

3\. O profissional registra alergia, condição crônica, uso contínuo de medicamento ou outra informação crítica.

4\. O sistema grava o alerta vinculado ao autor e passa a exibi-lo em destaque em todos os atendimentos subsequentes.

**Fluxos secundários (alternativos e de exceção):**

- Se houver prescrição em andamento contendo substância registrada como alergênica, o sistema emite alerta ao profissional antes da finalização.
- A remoção de um alerta exige justificativa registrada e não apaga o histórico da informação anterior.
- Informações relatadas pelo paciente e ainda não confirmadas clinicamente são apresentadas com essa distinção explícita.

### **3.3.4 \[RF019] Emitir prescrição eletrônica (P)**

Este caso de uso descreve a emissão de receita em meio digital, assinada com certificado digital do profissional e disponibilizada ao paciente pela plataforma.

**Ator:** Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** atendimento em andamento e certificado digital válido do profissional.

**Saídas e pós-condições:** a prescrição é assinada, arquivada no prontuário e disponibilizada ao paciente com código de verificação de autenticidade.

**Regras de negócio associadas:** RN09, RN12

**Fluxo de eventos principal:**

1\. O profissional seleciona a opção de prescrever durante o atendimento.

2\. O sistema apresenta o formulário de prescrição, com busca de medicamentos e possibilidade de reaproveitar prescrições anteriores.

3\. O profissional informa medicamentos, posologia, quantidade e orientações.

4\. O sistema verifica alertas de alergia registrados em RF018.

5\. O profissional finaliza e assina a prescrição com seu certificado digital.

6\. O sistema arquiva o documento assinado no prontuário e o disponibiliza ao paciente com código de verificação.

**Fluxos secundários (alternativos e de exceção):**

- Se o certificado digital estiver ausente, expirado ou indisponível, o sistema impede a emissão definitiva e mantém o documento como rascunho não válido, conforme RN09.
- Se houver alerta de alergia relacionado a item prescrito, o sistema exige confirmação explícita do profissional, registrando a ciência do alerta.
- Prescrições de medicamentos sujeitos a controle especial seguem o fluxo previsto na regulamentação aplicável, sinalizado pelo sistema.
- Documentos assinados não podem ser alterados; correções exigem emissão de novo documento com anulação registrada do anterior.

### **3.3.5 \[RF020] Solicitar exames e registrar resultados (P)**

Este caso de uso descreve a solicitação de exames complementares e a incorporação de seus resultados ao prontuário do paciente.

**Ator:** Profissional de saúde, Recepcionista, Paciente

**Prioridade:** Importante

**Entradas e pré-condições:** atendimento em andamento para a solicitação; arquivo de resultado em formato aceito para o anexo.

**Saídas e pós-condições:** a solicitação é registrada e assinada, e os resultados anexados passam a integrar o histórico clínico.

**Regras de negócio associadas:** RN09, RN12

**Fluxo de eventos principal:**

1\. O profissional seleciona os exames a solicitar e registra a indicação clínica.

2\. O sistema gera o pedido e o submete à assinatura digital do profissional.

3\. O sistema disponibiliza o pedido ao paciente e o arquiva no prontuário.

4\. Recebido o resultado, o paciente ou a recepção anexa o arquivo ao atendimento correspondente.

5\. O sistema valida o arquivo, vincula-o ao pedido original e notifica o profissional solicitante.

**Fluxos secundários (alternativos e de exceção):**

- Se o arquivo exceder o tamanho permitido ou estiver em formato não aceito, o sistema informa a restrição e não conclui o anexo.
- Se não houver pedido correspondente, o resultado é anexado ao histórico geral do paciente com indicação de origem externa.
- Resultados pendentes além do prazo previsto são sinalizados na agenda do profissional.

### **3.3.6 \[RF021] Emitir atestados e documentos clínicos (V)**

Este caso de uso descreve a emissão de atestados, declarações de comparecimento, relatórios e encaminhamentos, com assinatura digital e verificação de autenticidade.

**Ator:** Profissional de saúde

**Prioridade:** Importante

**Entradas e pré-condições:** atendimento em andamento ou concluído e certificado digital válido.

**Saídas e pós-condições:** o documento é assinado, arquivado no prontuário e disponibilizado ao paciente.

**Regras de negócio associadas:** RN09, RN12

**Fluxo de eventos principal:**

1\. O profissional seleciona o tipo de documento a emitir.

2\. O sistema apresenta o modelo correspondente, já preenchido com os dados do paciente e do atendimento.

3\. O profissional complementa o conteúdo necessário.

4\. O profissional assina digitalmente o documento.

5\. O sistema arquiva o documento e o disponibiliza ao paciente com código de verificação.

**Fluxos secundários (alternativos e de exceção):**

- Se o certificado não estiver disponível, o documento permanece como rascunho sem validade.
- Documentos emitidos não podem ser editados; correções exigem nova emissão com registro de anulação do documento anterior.
- O sistema oferece verificação pública da autenticidade do documento a partir do código impresso, sem expor conteúdo clínico.

### **3.3.7 \[RF022] Consultar histórico clínico unificado (P)**

Este caso de uso descreve a consulta cronológica e integrada de tudo o que já foi registrado sobre o paciente, independentemente da especialidade ou da modalidade do atendimento.

**Ator:** Profissional de saúde, Paciente

**Prioridade:** Essencial

**Entradas e pré-condições:** usuário autenticado com permissão sobre o paciente, conforme RN07.

**Saídas e pós-condições:** o histórico é apresentado de forma organizada e filtrável; o acesso é registrado em auditoria.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O usuário acessa o histórico do paciente.

2\. O sistema apresenta a linha do tempo dos atendimentos, com especialidade, profissional, modalidade e data.

3\. O usuário aplica filtros por período, especialidade ou tipo de registro.

4\. O sistema exibe evoluções, prescrições, pedidos, resultados de exames e documentos emitidos.

5\. O sistema registra a consulta na trilha de auditoria.

**Fluxos secundários (alternativos e de exceção):**

- O paciente visualiza seus documentos, orientações e resultados, mas não o conteúdo de anotações clínicas de uso interno do profissional.
- Se o volume de registros for extenso, o sistema carrega a linha do tempo por blocos, preservando o tempo de resposta.
- Registros importados do acervo em papel aparecem identificados como tais, com data de digitalização.

### **3.3.8 \[RF023] Acessar prontuário em situação de urgência (P)**

Este caso de uso descreve o acesso excepcional ao prontuário por profissional não vinculado ao atendimento, em situação de urgência, com registro reforçado e revisão posterior obrigatória.

**Ator:** Profissional de saúde

**Prioridade:** Importante

**Entradas e pré-condições:** profissional de saúde autenticado, sem vínculo com o paciente, diante de situação de urgência.

**Saídas e pós-condições:** o acesso é concedido de forma temporária e integralmente registrado, com notificação ao responsável pela segurança da informação.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O profissional solicita acesso ao prontuário de paciente ao qual não está vinculado.

2\. O sistema informa que se trata de acesso excepcional e sujeito a auditoria.

3\. O profissional registra a justificativa da urgência e confirma.

4\. O sistema concede acesso temporário e limitado ao período da urgência.

5\. O sistema registra o evento de forma destacada e notifica o administrador e o encarregado de dados.

**Fluxos secundários (alternativos e de exceção):**

- Se a justificativa não for informada, o acesso não é concedido.
- Encerrado o prazo do acesso temporário, o sistema o revoga automaticamente.
- Acessos de urgência integram relatório periódico de revisão pela direção da clínica.

## **3.4 Teleconsulta**

Esta subseção descreve os casos de uso que trazem o atendimento remoto para dentro da plataforma, substituindo o uso de aplicativos de mensagem pessoais e assegurando vínculo com o agendamento, registro no prontuário e consentimento formal.

### **3.4.1 \[RF024] Registrar consentimento de teleconsulta (P)**

Este caso de uso descreve o aceite, pelo paciente, do termo específico de atendimento a distância, condição regulatória para a realização da teleconsulta.

**Ator:** Paciente

**Prioridade:** Essencial

**Entradas e pré-condições:** atendimento agendado na modalidade remota.

**Saídas e pós-condições:** o consentimento é registrado com data, hora e versão do termo, liberando o início da teleconsulta.

**Regras de negócio associadas:** RN10, RN11

**Fluxo de eventos principal:**

1\. O sistema apresenta o termo de consentimento de teleconsulta ao paciente antes do horário do atendimento.

2\. O paciente lê o termo, que esclarece limitações, hipóteses de encaminhamento presencial e tratamento de dados.

3\. O paciente registra seu aceite.

4\. O sistema grava o consentimento e habilita o acesso à sala virtual.

**Fluxos secundários (alternativos e de exceção):**

- Se o paciente não aceitar o termo, a teleconsulta não é iniciada e o sistema oferece a conversão do atendimento para a modalidade presencial.
- Se o aceite não tiver sido registrado até o horário previsto, o sistema o solicita na entrada da sala virtual.
- A recusa é registrada no histórico do paciente, sem prejuízo do atendimento presencial.

### **3.4.2 \[RF025] Realizar teleconsulta por vídeo (P)**

Este caso de uso descreve a condução do atendimento remoto em sala virtual da própria plataforma, com áudio e vídeo, vinculada ao agendamento e ao prontuário do paciente.

**Ator:** Paciente, Profissional de saúde

**Prioridade:** Essencial

**Entradas e pré-condições:** atendimento remoto confirmado, consentimento registrado por RF024 e dispositivos com câmera, microfone e conexão adequada.

**Saídas e pós-condições:** o atendimento é realizado, sua duração é registrada e o profissional conclui o registro clínico correspondente.

**Regras de negócio associadas:** RN01, RN10, RN11

**Fluxo de eventos principal:**

1\. O paciente acessa o link da sala virtual a partir da confirmação ou do lembrete.

2\. O sistema executa a verificação de câmera, microfone e conexão antes da entrada.

3\. O sistema coloca o paciente em sala de espera virtual e sinaliza sua presença ao profissional.

4\. O profissional inicia o atendimento e a sessão de vídeo é estabelecida.

5\. O sistema apresenta o prontuário do paciente ao profissional na mesma tela do atendimento.

6\. O profissional conduz o atendimento, registra a evolução (RF017) e emite documentos quando necessário.

7\. O profissional encerra a sessão e o sistema registra início, término e duração do atendimento.

**Fluxos secundários (alternativos e de exceção):**

- Se a verificação prévia identificar ausência de câmera, microfone ou banda suficiente, o sistema orienta o paciente e oferece alternativas antes do horário.
- Se a conexão cair durante o atendimento, o sistema tenta reconexão automática e preserva o registro em andamento; persistindo a falha, oferece conclusão por outro meio ou reagendamento sem novo custo.
- Se o paciente não comparecer à sala dentro da tolerância definida, o atendimento segue o fluxo de ausência previsto em RF015.
- Se o profissional concluir que o caso exige exame presencial, registra a orientação no prontuário e o sistema oferece o agendamento presencial imediato.

### **3.4.3 \[RF026] Compartilhar documentos durante a teleconsulta (V)**

Este caso de uso descreve o envio e a visualização de documentos, imagens e resultados de exames durante o atendimento remoto, dentro do ambiente seguro da plataforma.

**Ator:** Paciente, Profissional de saúde

**Prioridade:** Importante

**Entradas e pré-condições:** teleconsulta em andamento.

**Saídas e pós-condições:** os arquivos compartilhados são vinculados ao atendimento e ao prontuário do paciente.

**Regras de negócio associadas:** RN12

**Fluxo de eventos principal:**

1\. Durante o atendimento, o usuário seleciona a opção de enviar arquivo.

2\. O sistema valida formato e tamanho do arquivo.

3\. O sistema disponibiliza o documento à outra parte dentro da sala virtual.

4\. O sistema arquiva o documento no atendimento correspondente do prontuário.

**Fluxos secundários (alternativos e de exceção):**

- Se o arquivo não atender aos critérios de formato ou tamanho, o sistema informa a restrição e não realiza o envio.
- Documentos compartilhados permanecem restritos aos participantes do atendimento e à trilha de auditoria.
- O profissional pode emitir e enviar prescrições e atestados assinados durante a própria sessão, por meio de RF019 e RF021.

### **3.4.4 \[RF027] Gravar teleconsulta mediante consentimento (V)**

Este caso de uso descreve a gravação opcional do atendimento remoto, condicionada ao consentimento explícito do paciente e sujeita a regras estritas de guarda e acesso.

**Ator:** Profissional de saúde, Paciente

**Prioridade:** Desejável

**Entradas e pré-condições:** teleconsulta em andamento e consentimento específico para gravação registrado.

**Saídas e pós-condições:** a gravação é armazenada de forma criptografada, vinculada ao atendimento e de acesso restrito e auditado.

**Regras de negócio associadas:** RN11, RN12

**Fluxo de eventos principal:**

1\. O profissional solicita autorização para gravar o atendimento.

2\. O sistema apresenta ao paciente o pedido de consentimento específico para gravação.

3\. O paciente autoriza.

4\. O sistema inicia a gravação e sinaliza visualmente a todos os participantes que a sessão está sendo gravada.

5\. Encerrado o atendimento, o sistema armazena o arquivo criptografado, vinculado ao prontuário.

**Fluxos secundários (alternativos e de exceção):**

- Se o paciente não autorizar, a gravação não é iniciada e o atendimento prossegue normalmente.
- Se o paciente revogar a autorização durante a sessão, a gravação é interrompida imediatamente e o trecho já registrado é descartado.
- O acesso a gravações é restrito ao profissional responsável e a solicitações formais, sempre com registro em auditoria.
- As gravações observam o prazo de guarda definido pela clínica e as exigências legais aplicáveis.

## **3.5 Administração e gestão**

Esta subseção agrupa os casos de uso de configuração da operação, controle de acesso e acompanhamento gerencial da clínica.

### **3.5.1 \[RF028] Gerenciar profissionais e especialidades (P)**

Este caso de uso descreve o cadastro e a manutenção das especialidades atendidas pela clínica e dos profissionais a elas vinculados.

**Ator:** Gestor, Administrador

**Prioridade:** Essencial

**Entradas e pré-condições:** dados de identificação do profissional, registro no conselho de classe, especialidades e modalidades de atendimento.

**Saídas e pós-condições:** o profissional passa a estar apto a ter grade publicada e a receber agendamentos.

**Regras de negócio associadas:** RN02

**Fluxo de eventos principal:**

1\. O gestor acessa a área de profissionais e especialidades.

2\. O sistema exibe os registros existentes.

3\. O gestor cadastra ou edita um profissional, informando dados pessoais, registro profissional e especialidades.

4\. O gestor define a duração padrão de consulta por especialidade e as modalidades aceitas.

5\. O sistema valida os dados e grava o cadastro.

**Fluxos secundários (alternativos e de exceção):**

- Se o registro profissional for inválido ou duplicado, o sistema impede a gravação.
- A inativação de um profissional com agenda futura exige decisão explícita sobre os atendimentos já marcados.
- A exclusão de especialidade com histórico de atendimentos não é permitida; admite-se apenas sua inativação.

### **3.5.2 \[RF029] Gerenciar usuários e perfis de acesso (P)**

Este caso de uso descreve a criação, alteração, bloqueio e revogação de contas e a atribuição de perfis que determinam o que cada usuário pode ver e fazer.

**Ator:** Administrador

**Prioridade:** Essencial

**Entradas e pré-condições:** administrador autenticado com privilégio compatível.

**Saídas e pós-condições:** as permissões passam a vigorar imediatamente e a alteração é registrada em auditoria.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O administrador acessa o painel de usuários.

2\. O sistema lista as contas com perfil, situação e data do último acesso.

3\. O administrador cria ou edita uma conta e atribui o perfil correspondente.

4\. O sistema aplica as permissões do perfil atribuído.

5\. O sistema registra a operação com identificação do responsável, data e hora.

**Fluxos secundários (alternativos e de exceção):**

- Se a conta possuir sessão ativa quando bloqueada, o sistema encerra a sessão imediatamente.
- O sistema impede a remoção da última conta com privilégio de administração.
- Contas sem uso por período definido são sinalizadas para revisão periódica de acessos.

### **3.5.3 \[RF030] Visualizar painel gerencial de indicadores (V)**

Este caso de uso descreve o acompanhamento da operação da clínica por meio de indicadores de ocupação, absenteísmo, produtividade e distribuição de atendimentos.

**Ator:** Gestor

**Prioridade:** Importante

**Entradas e pré-condições:** gestor autenticado; deve haver histórico de atendimentos no período consultado.

**Saídas e pós-condições:** os indicadores são apresentados de forma agregada, sem exposição de conteúdo clínico identificável.

**Regras de negócio associadas:** RN05, RN07

**Fluxo de eventos principal:**

1\. O gestor acessa o painel gerencial.

2\. O sistema apresenta os indicadores do período corrente: taxa de ocupação da agenda, índice de ausências, volume de atendimentos por especialidade e proporção entre atendimentos presenciais e remotos.

3\. O gestor ajusta o período, a especialidade ou o profissional analisado.

4\. O sistema recalcula e apresenta os indicadores filtrados.

**Fluxos secundários (alternativos e de exceção):**

- Se não houver dados suficientes no período, o sistema informa a limitação em vez de exibir indicadores enganosos.
- O painel não expõe conteúdo clínico; indicadores que envolvam poucos pacientes são apresentados de forma agregada para evitar reidentificação.
- O gestor pode exportar os indicadores apresentados por meio de RF031.

### **3.5.4 \[RF031] Emitir relatórios operacionais (V)**

Este caso de uso descreve a geração e a exportação de relatórios sobre a operação da clínica para análise externa ao sistema.

**Ator:** Gestor, Administrador

**Prioridade:** Desejável

**Entradas e pré-condições:** seleção de tipo de relatório, período e filtros aplicáveis.

**Saídas e pós-condições:** o relatório é gerado em formato exportável e sua emissão é registrada em auditoria.

**Regras de negócio associadas:** RN07

**Fluxo de eventos principal:**

1\. O usuário seleciona o tipo de relatório e os filtros desejados.

2\. O sistema valida as permissões do usuário sobre os dados solicitados.

3\. O sistema processa e apresenta o relatório em tela.

4\. O usuário exporta o arquivo no formato disponível.

5\. O sistema registra a emissão, com identificação do responsável e do escopo dos dados.

**Fluxos secundários (alternativos e de exceção):**

- Se o volume de dados for elevado, o sistema processa a solicitação em segundo plano e notifica o usuário quando o relatório estiver disponível.
- Relatórios que contenham dados pessoais são identificados como tais e sua exportação exige confirmação de ciência quanto ao tratamento adequado da informação.

### **3.5.5 \[RF032] Consultar trilha de auditoria (P)**

Este caso de uso descreve a consulta ao registro cronológico e não editável de todas as ações relevantes praticadas sobre dados pessoais e clínicos.

**Ator:** Administrador, Encarregado de dados (DPO)

**Prioridade:** Essencial

**Entradas e pré-condições:** usuário com perfil autorizado; definição de período, usuário, paciente ou tipo de evento.

**Saídas e pós-condições:** os eventos são apresentados de forma cronológica e exportáveis para apuração; a própria consulta é auditada.

**Regras de negócio associadas:** RN07, RN08, RN12

**Fluxo de eventos principal:**

1\. O usuário acessa a área de auditoria.

2\. O sistema apresenta os filtros disponíveis.

3\. O usuário define os critérios da consulta.

4\. O sistema apresenta os eventos com data, hora, usuário responsável, ação praticada, recurso afetado e origem do acesso.

5\. O sistema registra a própria consulta como evento auditável.

**Fluxos secundários (alternativos e de exceção):**

- Acessos de urgência (RF023) e alterações de permissão (RF029) são apresentados com destaque específico.
- O sistema não permite edição ou exclusão de registros de auditoria por nenhum perfil de usuário.
- Se a consulta retornar volume elevado, o sistema oferece a exportação do resultado para análise externa.

# **4. Capítulo 3 — Requisitos não funcionais**

Esta seção apresenta as características de qualidade e as restrições que o VidaPlena Connected Care deve observar. Por se tratar de um sistema que manipula dados pessoais sensíveis de saúde, boa parte destes requisitos tem caráter obrigatório e integra os critérios de aceitação do produto, não podendo ser negociada como melhoria futura.

Sempre que possível, cada requisito é acompanhado de uma métrica objetiva, de modo que sua verificação em teste seja inequívoca.

## **4.1 Usabilidade**

### **4.1.1 \[NF001] Agendamento em poucas etapas (P)**

O agendamento de uma consulta pelo paciente deve ser uma tarefa curta e direta, compatível com o uso em telefone celular e sem exigir conhecimento técnico ou treinamento prévio.

**Métrica de verificação:** o fluxo completo, da escolha da especialidade à confirmação, deve ser concluído em no máximo quatro interações principais. Em teste de usabilidade, 90% dos participantes devem concluir um agendamento sem auxílio em até três minutos.

**Prioridade:** Essencial

### **4.1.2 \[NF002] Eficiência operacional na recepção (V)**

A tela de agenda do dia deve permitir que a recepcionista visualize a situação de todos os profissionais e execute as operações mais frequentes sem navegar entre múltiplos menus, considerando que ela atende telefone e balcão simultaneamente.

**Métrica de verificação:** agendar, reagendar, cancelar e registrar chegada devem estar acessíveis a partir da agenda do dia em no máximo dois cliques, sem recarregamento completo da página.

**Prioridade:** Essencial

### **4.1.3 \[NF003] Acessibilidade digital (P)**

A plataforma deve ser utilizável por pessoas idosas, com baixa visão ou com limitações motoras, perfil relevante entre os pacientes da clínica.

**Métrica de verificação:** as telas de uso do paciente devem atender ao nível AA das diretrizes WCAG 2.1, incluindo contraste mínimo de 4,5:1, navegação completa por teclado, rótulos associados a todos os campos e compatibilidade com leitores de tela.

**Prioridade:** Importante

### **4.1.4 \[NF004] Facilidade de aprendizado (P)**

Os usuários internos devem assimilar rapidamente o funcionamento do sistema, mesmo sem familiaridade prévia com ferramentas digitais de gestão clínica.

**Métrica de verificação:** após uma hora de treinamento, 90% das recepcionistas devem executar corretamente agendamento, reagendamento, cancelamento e check-in sem consulta a manual; 90% dos profissionais devem localizar um atendimento anterior e registrar uma evolução sem auxílio.

**Prioridade:** Importante

## **4.2 Confiabilidade**

### **4.2.1 \[NF005] Integridade e imutabilidade do registro clínico (P)**

Os registros do prontuário devem ser preservados de forma íntegra, com identificação inequívoca de autoria e data, sem possibilidade de alteração silenciosa ou exclusão. Correções posteriores ocorrem por adendo, mantendo-se o conteúdo original íntegro e visível.

**Métrica de verificação:** nenhuma operação do sistema, em qualquer perfil de usuário, pode remover ou sobrescrever uma evolução finalizada. Toda alteração deve produzir nova versão rastreável, verificável em teste por tentativa deliberada de modificação e por conferência da trilha de auditoria.

**Prioridade:** Essencial

### **4.2.2 \[NF006] Disponibilidade do sistema (P)**

A clínica opera de forma contínua durante o horário comercial, e a indisponibilidade do sistema significa paralisação do atendimento. A plataforma deve, portanto, manter alto índice de disponibilidade.

**Métrica de verificação:** disponibilidade mínima de 99,7% apurada mensalmente. Janelas de manutenção programada limitadas a duas horas por mês, realizadas fora do horário de atendimento e comunicadas com 48 horas de antecedência.

**Prioridade:** Essencial

### **4.2.3 \[NF007] Backup e recuperação de desastres (P)**

A perda de dados clínicos é inaceitável, tanto do ponto de vista assistencial quanto legal. O sistema deve manter rotina de cópia de segurança e procedimento testado de recuperação.

**Métrica de verificação:** backup completo diário e incremental contínuo, com RPO máximo de 15 minutos e RTO máximo de 4 horas. As cópias devem ser criptografadas, armazenadas em localidade distinta da principal e testadas em simulação de restauração ao menos semestralmente.

**Prioridade:** Essencial

### **4.2.4 \[NF008] Tolerância a falhas durante o atendimento (V)**

Falhas de rede não podem provocar perda do trabalho em andamento nem interrupção definitiva de um atendimento remoto.

**Métrica de verificação:** o registro de evolução em digitação deve ser preservado automaticamente a cada 30 segundos e recuperado integralmente após queda de sessão. A sala de teleconsulta deve tentar reconexão automática por até 60 segundos antes de sinalizar falha definitiva.

**Prioridade:** Importante

## **4.3 Desempenho**

### **4.3.1 \[NF009] Tempo de resposta das operações (P)**

O tempo de consulta é curto e a recepção atende sob pressão; a lentidão do sistema se converte diretamente em atraso no atendimento. A promessa central do produto de abrir o prontuário em segundos deve ser sustentada por meta mensurável.

**Métrica de verificação:** 95% das operações de leitura (consultar agenda, listar horários, abrir histórico) devem concluir em menos de 1 segundo; a abertura completa do prontuário de um paciente deve ocorrer em menos de 2 segundos; operações de escrita (agendar, registrar evolução, anexar documento) devem concluir em menos de 2 segundos sob carga normal.

**Prioridade:** Essencial

### **4.3.2 \[NF010] Capacidade de carga e crescimento (P)**

O sistema deve sustentar o volume atual da clínica e acomodar seu crescimento sem reprojeto, considerando os picos de início da manhã e de início da tarde.

**Métrica de verificação:** suportar 200 atendimentos por dia, 60 usuários internos simultâneos e 40 teleconsultas concorrentes. Um crescimento de 200% no volume de dados e de usuários ativos não deve degradar os tempos definidos em NF009 em mais de 20%.

**Prioridade:** Essencial

### **4.3.3 \[NF011] Qualidade da transmissão da teleconsulta (P)**

A teleconsulta precisa oferecer qualidade suficiente para a observação clínica e para o diálogo natural entre profissional e paciente, adaptando-se a conexões domésticas de qualidade variável.

**Métrica de verificação:** transmissão de vídeo em 720p a 30 quadros por segundo com 1,5 Mbps de banda disponível, latência fim a fim inferior a 300 ms e ajuste adaptativo de qualidade em conexões instáveis, com prioridade de preservação do áudio sobre o vídeo.

**Prioridade:** Essencial

## **4.4 Segurança**

### **4.4.1 \[NF012] Controle de acesso baseado em perfil (P)**

Cada usuário deve acessar apenas as informações e funcionalidades compatíveis com sua função. A recepção não acessa conteúdo clínico; o paciente não acessa dados de outros pacientes; o administrador não acessa livremente o prontuário; e o profissional acessa apenas pacientes com os quais possui vínculo assistencial.

**Métrica de verificação:** toda requisição deve ser autorizada no servidor, e não apenas ocultada na interface. Testes de segurança devem demonstrar que a manipulação direta de identificadores ou de endereços não concede acesso a recursos de outro perfil ou de outro paciente.

**Prioridade:** Essencial

### **4.4.2 \[NF013] Autenticação e proteção de credenciais (P)**

As credenciais de acesso devem ser protegidas de forma robusta, com exigência reforçada para os usuários internos que manipulam dados clínicos.

**Métrica de verificação:** senhas armazenadas com função de derivação resistente a força bruta (bcrypt ou Argon2), nunca em texto claro; segundo fator de autenticação obrigatório para perfis internos; encerramento automático de sessão após 15 minutos de inatividade em estações da clínica; bloqueio temporário após cinco tentativas malsucedidas.

**Prioridade:** Essencial

### **4.4.3 \[NF014] Criptografia de dados em trânsito e em repouso (P)**

Dados de saúde devem estar protegidos tanto na comunicação quanto no armazenamento, incluindo anexos, documentos e gravações.

**Métrica de verificação:** toda comunicação por TLS 1.3, admitindo-se no mínimo TLS 1.2, com redirecionamento obrigatório de tráfego não cifrado; dados sensíveis e anexos cifrados em repouso com AES-256; mídia da teleconsulta transmitida com criptografia fim a fim.

**Prioridade:** Essencial

### **4.4.4 \[NF015] Trilha de auditoria completa (P)**

Todo acesso, inclusão, alteração ou exportação de dados pessoais e clínicos deve ser registrado de forma não editável, permitindo apuração posterior de responsabilidade.

**Métrica de verificação:** cada evento deve registrar usuário, perfil, data e hora, ação, recurso afetado e origem do acesso. Os registros devem ser preservados por no mínimo cinco anos e ser imutáveis para todos os perfis, inclusive o de administração.

**Prioridade:** Essencial

### **4.4.5 \[NF016] Conformidade com a LGPD (P)**

O tratamento de dados pessoais e de dados sensíveis de saúde deve observar a Lei nº 13.709/2018, com finalidade determinada, consentimento registrado, minimização de dados e atendimento aos direitos dos titulares.

**Métrica de verificação:** o sistema deve permitir ao titular consultar, corrigir, exportar em formato legível por máquina e solicitar a eliminação de seus dados não sujeitos à guarda obrigatória, com atendimento em até 15 dias; relatórios gerenciais devem apresentar dados agregados e não reidentificáveis.

**Prioridade:** Essencial

### **4.4.6 \[NF017] Conformidade com normas do setor de saúde (V)**

O sistema deve observar a regulamentação específica aplicável ao prontuário eletrônico, à emissão de documentos médicos e à prática da telemedicina.

**Métrica de verificação:** guarda dos registros clínicos por no mínimo 20 anos contados do último atendimento, conforme a Resolução CFM nº 1.821/2007; assinatura de prescrições e atestados com certificado ICP-Brasil; realização da teleconsulta conforme a Resolução CFM nº 2.314/2022, com consentimento e registro em prontuário. A arquitetura deve ser compatível com os requisitos de certificação SBIS/CFM.

**Prioridade:** Essencial

## **4.5 Distribuição**

### **4.5.1 \[NF018] Acesso via navegador sem instalação (P)**

A plataforma deve funcionar inteiramente como sistema web, acessível por navegador, sem exigir instalação de programas nas estações da clínica nem nos dispositivos dos pacientes, inclusive para a teleconsulta.

**Prioridade:** Essencial

### **4.5.2 \[NF019] Uso em dispositivos móveis (P)**

O ambiente do paciente deve ser plenamente funcional em telefones celulares, principal meio de acesso do público da clínica, e o ambiente do profissional deve permanecer utilizável em tablets.

**Métrica de verificação:** todas as funcionalidades do paciente devem operar corretamente em telas a partir de 360 pixels de largura, sem rolagem horizontal e sem perda de funcionalidade.

**Prioridade:** Essencial

## **4.6 Padrões**

### **4.6.1 \[NF020] Consistência de interface (V)**

As telas do sistema devem seguir um padrão visual e de interação comum, derivado da identidade da VidaPlena, mantendo uniformidade na posição de ações, no formato de datas, na nomenclatura e no comportamento dos componentes.

**Métrica de verificação:** todos os componentes de interface devem derivar de uma biblioteca única documentada, sem variações não previstas de estilo ou comportamento entre módulos.

**Prioridade:** Importante

### **4.6.2 \[NF021] Clareza nas mensagens do sistema (P)**

As mensagens devem ser objetivas, escritas em linguagem compreensível e orientadas à ação, informando o que ocorreu e o que o usuário deve fazer. Mensagens técnicas ou códigos internos não devem ser expostos ao usuário final.

**Métrica de verificação:** toda mensagem de erro deve indicar a causa em linguagem natural e ao menos um caminho de resolução; mensagens de conflito de agenda devem informar explicitamente que o horário deixou de estar disponível e oferecer alternativas.

**Prioridade:** Importante

### **4.6.3 \[NF022] Padrões de terminologia e interoperabilidade (V)**

A representação da informação clínica deve adotar padrões reconhecidos, de modo a permitir integrações futuras com laboratórios, operadoras e sistemas públicos sem reestruturação do modelo de dados.

**Métrica de verificação:** diagnósticos registrados conforme a CID-10; procedimentos referenciados pela terminologia TUSS; interfaces de integração projetadas em conformidade com HL7 FHIR R4; troca com operadoras compatível com o padrão TISS.

**Prioridade:** Importante

## **4.7 Hardware e software**

### **4.7.1 \[NF023] Compatibilidade com navegadores modernos (V)**

O sistema deve funcionar corretamente nos navegadores de uso corrente, sem exigir extensões ou configurações especiais.

**Métrica de verificação:** suporte às duas versões mais recentes de Google Chrome, Microsoft Edge, Mozilla Firefox e Safari, incluindo suporte a WebRTC para a teleconsulta.

**Prioridade:** Essencial

### **4.7.2 \[NF024] Infraestrutura de hospedagem (P)**

A aplicação deve ser executada em ambiente de servidor apropriado, com separação entre desenvolvimento, homologação e produção, e capacidade de crescimento horizontal.

**Métrica de verificação:** hospedagem em infraestrutura de nuvem localizada em território nacional, com monitoramento contínuo de disponibilidade e desempenho, alertas automáticos e capacidade de ampliação de recursos sem indisponibilidade programada.

**Prioridade:** Essencial

### **4.7.3 \[NF025] Requisitos mínimos do usuário para teleconsulta (P)**

O sistema deve informar com clareza as condições necessárias para a realização do atendimento remoto e verificá-las antes do início da sessão, evitando que a falha seja descoberta no horário da consulta.

**Métrica de verificação:** conexão mínima de 2 Mbps de subida e descida, câmera e microfone funcionais. A verificação automática de dispositivos e banda deve ser oferecida ao paciente no momento da confirmação do agendamento e novamente na entrada da sala virtual.

**Prioridade:** Importante

# **5. Capítulo 4 — Gerenciamento de requisitos**

Este capítulo apresenta os instrumentos de controle dos requisitos ao longo do projeto: a matriz de rastreabilidade, que evidencia as dependências entre requisitos, a priorização das entregas em sprints e o processo de controle de mudanças.

## **5.1 Matriz de rastreabilidade**

A matriz abaixo relaciona os requisitos de maior acoplamento do sistema. A letra **R** na diagonal identifica o próprio requisito e a letra **D** indica que o requisito da linha depende do requisito da coluna, de modo que qualquer alteração neste último exige reavaliação daquele.

| **ID** | **RF002** | **RF007** | **RF008** | **RF009** | **RF016** | **RF017** | **RF022** | **RF025** | **RF032** | **NF012** |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **RF002** | **R** |  |  |  |  |  |  |  |  | D |
| **RF007** | D | **R** | D |  |  |  |  |  |  | D |
| **RF008** |  | D | **R** | D |  |  |  |  |  |  |
| **RF009** | D | D | D | **R** |  |  |  |  |  |  |
| **RF016** | D |  |  |  | **R** |  |  |  | D | D |
| **RF017** |  |  |  |  | D | **R** | D |  | D |  |
| **RF022** |  |  |  |  | D | D | **R** |  |  | D |
| **RF025** |  | D |  |  | D |  |  | **R** | D |  |
| **RF032** |  |  |  |  | D | D |  | D | **R** | D |
| **NF012** | D |  |  |  | D |  | D |  | D | **R** |

Legenda dos requisitos apresentados na matriz:

- **\[RF002]** Realizar login
- **\[RF007]** Agendar consulta
- **\[RF008]** Impedir dupla reserva de horário
- **\[RF009]** Reagendar consulta
- **\[RF016]** Abrir prontuário do paciente
- **\[RF017]** Registrar evolução clínica
- **\[RF022]** Consultar histórico clínico unificado
- **\[RF025]** Realizar teleconsulta por vídeo
- **\[RF032]** Consultar trilha de auditoria
- **\[NF012]** Controle de acesso baseado em perfil

A leitura da matriz evidencia dois núcleos de acoplamento. O primeiro gira em torno de RF008: praticamente toda operação de agenda depende do mecanismo de controle de concorrência, o que faz dele o requisito de maior risco técnico do projeto e o primeiro candidato a testes automatizados de carga e concorrência. O segundo núcleo reúne RF016, RF017, NF012 e RF032: nenhum acesso a conteúdo clínico existe sem autorização por perfil e sem registro de auditoria, motivo pelo qual esses quatro requisitos devem ser desenvolvidos e testados em conjunto, jamais isoladamente.

## **5.2 Priorização e roadmap de entregas**

A entrega será incremental, em quatro sprints, cada uma produzindo valor verificável para a clínica. A ordem foi definida pela severidade do problema atendido: a agenda vem primeiro porque é a origem da dupla reserva, dor mais visível e de maior impacto imediato na operação.

| **Sprint** | **Módulo** | **Requisitos contemplados** | **Resultado esperado** |
| --- | --- | --- | --- |
| **1** | **Agenda Online** | RF001 a RF015; NF001, NF002, NF009, NF012, NF013, NF018, NF019 | Fim da planilha e da dupla reserva; paciente passa a agendar pela internet e a receber lembretes automáticos. |
| **2** | **Prontuário Eletrônico** | RF016 a RF023; NF005, NF015, NF016, NF017, NF021 | Fim do prontuário em papel; histórico unificado acessível em segundos, com prescrição assinada digitalmente. |
| **3** | **Teleconsulta Integrada** | RF024 a RF027; NF008, NF011, NF014, NF025 | Atendimento remoto dentro da plataforma, vinculado ao agendamento e ao prontuário, com consentimento registrado. |
| **4** | **Painel Administrativo** | RF028 a RF032; NF003, NF010, NF020, NF022, NF023, NF024 | Gestão baseada em indicadores de ocupação e absenteísmo, com governança de acessos e auditoria. |

Os requisitos classificados como Desejáveis (RF012, RF027 e RF031) podem ser deslocados para versões posteriores caso haja pressão de prazo, sem comprometimento da operação da clínica. Requisitos Essenciais não admitem postergação: a ausência de qualquer um deles impede a entrada do sistema em produção.

## **5.3 Controle de mudanças e versionamento**

Requisitos marcados como voláteis (V) concentram a expectativa de mudança e, por isso, devem ser implementados com maior atenção à parametrização, evitando decisões de negócio codificadas de forma rígida. Alterações em requisitos permanentes (P) tendem a indicar mudança na compreensão do domínio e exigem revisão mais ampla.

Toda solicitação de mudança seguirá o fluxo abaixo:

- registro da solicitação, com identificação do solicitante, do requisito afetado e da motivação;
- análise de impacto pela equipe técnica, apoiada na matriz de rastreabilidade da seção 5.1, identificando os requisitos dependentes;
- avaliação conjunta de escopo, prazo e risco com o Product Owner e o gestor da clínica;
- aprovação, rejeição ou postergação formal da mudança;
- atualização deste documento, com incremento de versão e registro no histórico de revisões;
- comunicação da alteração a todos os stakeholders afetados.

Mudanças que impactem requisitos de segurança, sigilo ou conformidade legal exigem parecer do encarregado de proteção de dados antes da aprovação, independentemente de seu tamanho aparente.

**Histórico de versões deste documento:**

| **Versão** | **Data** | **Descrição** | **Responsável** |
| --- | --- | --- | --- |
| 1.0 | Setembro de 2026 | Versão inicial do documento de requisitos, elaborada a partir da elicitação junto à Clínica VidaPlena. | Ronaldo (PO) |
