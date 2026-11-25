# Catálogos sintéticos para desenvolvimento

Os arquivos cid10.dev.json e tuss.dev.json foram criados para esta demonstração, sob a licença MIT do repositório (LICENSE na raiz). Não foram extraídos de tabela médica oficial. Códigos DEV-* e descrições fictícias não devem ser utilizados para assistência ou enviados a sistemas de saúde.

Origem: VidaPlena, massa sintética. Versão: vidaplena-demo-1. Os metadados source/license/demo ficam preservados no catálogo. Há três entradas ativas e uma inativa em cada fixture, para testes positivos/negativos. Até1000 entradas por arquivo são aceitas pelo loader demonstrativo; catálogos reais exigem outra validação P-13.

Use yarn workspace vida-plena-backend terminologies:demo na raiz (development/test), ou terminologies:load com caminho de arquivo no mesmo formato. Mesma versão/conteúdo não duplica; mesma versão/conteúdo diferente falha. staging/production não permitem carregar ou usar esses dados. Nenhuma API externa é consultada. Medicamentos não fazem parte desta carga.
