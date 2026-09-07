# Verificação do funil comercial

Capturas geradas em Chrome headless, em 1440px e 390px, com dados sintéticos (158 / 68 / 13 / 0). Não são capturas de produção. Fontes externas e gráfico foram desativados no teste para evitar chamadas de rede.

Verificado: cards conferem com as etapas; zero explícito aparece como zero; linhas ausentes e campo nulo aparecem como indisponíveis; outra origem não reutiliza os cards da Principal; barra vermelha removida; celular sem transbordamento horizontal da página; detalhes abrem com Enter; média formatada como 45,1 mensagens. Revisão visual das duas capturas e git diff --check aprovados.

## Dependência pendente

O repositório não contém as views SQL nem o workflow que calcula clara_funil_diario e clara_etapas_cache. A página recebe travaram/parada prontos. O comentário original descreve inatividade sem venda, sem verificar quem enviou a última mensagem. Portanto esses campos não foram reutilizados como ausência de resposta. A nova coluna fica indisponível até a fonte fornecer sem_resposta_24h com o contrato correto. O gráfico e a lista identificam a inatividade antiga como legado.

É necessário conferir o SQL da view vw_clara_etapas_r2 e sua agregação/cache: timestamp da última mensagem de toda a conversa, direção da mensagem/estado de resposta e operador estrito >24h. Validar na fonte: pendente há menos de 24h = excluído; exatamente 24h = excluído; mais de 24h e sem resposta da pessoa = incluído; pessoa respondeu = excluído na próxima atualização. Esses testes de negócio NÃO foram executados, pois a implementação não está disponível. Não foi criada uma regra fictícia no navegador.

A média preserva sum(media_msgs * alcancaram) / sum(alcancaram); a semântica interna de media_msgs também depende da view. O avanço mantém próxima etapa / etapa atual. A máscara de contagens positivas menores que cinco e a lógica de Gargalo foram preservadas.

## Card de mensagens da IA — memória

Integração direta com `n8n_chat_histories`, conforme autorização do usuário. Consulta apenas registros `message.type = ai` das sessões das conversas selecionadas em `clara_etapas_cache` por origem e data de início. A estrutura `id`, `session_id`, `message.type` e `message.content` foi conferida na API. A memória usa sessões +55; as chaves de telefone do cache também são comparadas com a variante com nono dígito brasileiro. Correspondências verificadas em dados reais.

O card “Mensagens da IA” soma partes não vazias do conteúdo, sem exigir confirmação de envio. Três ou mais tópicos consecutivos com emoji/keycap contam como uma parte; um ou dois ficam separados. Arrays preservam a separação recebida. Texto literal /n ou barra invertida+n não é quebra real. Registros human são excluídos. IDs repetidos não são contados duas vezes.

Consultas paginadas, sessões deduplicadas e lotes de até 40 sessões para limitar URLs. Carregamento, erro com botão de repetição e zero são distintos. Resposta de filtro anterior não altera o card atual. Cache de totais válido por um minuto, reconsultado no próximo render após esse prazo; nenhum texto da memória é persistido pelo card. O filtro de período é pela data de início da conversa, como no funil, e não pela data de cada mensagem.

Testes: `node tests/ai-messages.cjs`, `node tests/ai-memory-loading.cjs`, `node artifacts/check-funnel.cjs`. Incluem regra dos tópicos, vazios, arrays, apenas IA, deduplicação, consulta por origem/período, erro, zero, repetição e troca de aba durante consulta. Capturas com dados sintéticos e rede bloqueada; não exibem conversas reais.

A consulta inicial de metadados OpenAPI respondeu 401. A consulta específica à tabela indicada pelo usuário funcionou; a integração não depende do acesso aos metadados OpenAPI. A exigência anterior de agregado de envios confirmados foi removida.

Consulta real em 07/09/2026, período 27/08–07/09: Principal = 0 partes de IA encontradas na memória para as sessões correspondentes; Presente gratuito = 547. São totais da memória disponível, não prova de que nenhuma mensagem foi enviada fora dela. Nenhum conteúdo de conversa foi incluído nos artefatos ou logs de verificação.
