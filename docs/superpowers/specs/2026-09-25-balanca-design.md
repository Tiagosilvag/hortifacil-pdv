# Integração das balanças (Toledo e Urano) com o PDV — Design

Data: 2026-09-25
Sub-projeto **B1** da Fase 4 (hardware). Os outros dois dispositivos ficam em ciclos próprios: **B2** leitor de código de barras (C3Tech, laser) e **B3** impressora térmica (Epson). Nota fiscal é o sub-projeto C.

## 1. Objetivo e contexto

Quando o operador vende um produto em `kg`, o **peso da balança do caixa preenche a quantidade** do item, como no Gestão Fácil. Hoje o PDV adiciona o item com quantidade 1 e o operador digita o peso (`NewOrder.tsx`, campo numérico com `step="any"`).

Equipamento (fotos do usuário, 25/09/2026):

| Caixa | Balança | Observação |
|---|---|---|
| Um | Toledo **Prix 3 Plus** (6/15/32 kg) | Computadora com teclado e três visores (peso, preço/kg, total) |
| Outro | Urano **US 15/5 POP-S** (15 kg) | Computadora com teclado e três visores |

Cada balança fica ligada ao computador do **seu** caixa. Os computadores rodam **Windows com Chrome ou Edge** e abrem o HortiFácil hospedado em `https://hortfacil.coffetech.com.br`.

### Critério de sucesso

- Em cada caixa, com a balança ligada, clicar num produto em `kg` adiciona o item com o peso estável da balança.
- Se a balança falhar (cabo solto, sem energia, navegador sem suporte), o operador continua vendendo digitando o peso, sem perder o carrinho.
- Nunca se vende com um peso velho, instável, zero ou negativo.

### Fora do escopo

Etiqueta com peso no código de barras (prefixo `200` do sistema antigo), envio de tabela de preços para a balança, tara pelo computador, impressão de etiqueta pela balança, e qualquer integração com leitor de código de barras ou impressora (B2 e B3).

## 2. O que se sabe e o que não se sabe

**Sabe-se** (fabricantes e guias de instalação, consultados em 25/09/2026):

- As duas têm saída **serial RS-232** para computador. A Toledo usa o conector RJ45 da balança com um **cabo conversor RJ45→RS-232 específico** (mais um adaptador serial→USB se o PC não tiver porta COM). A Urano POP-S tem RS-232 nativo com cabo opcional.
- Parâmetros divulgados: **Urano** 9600 bps, 8 bits de dados, 2 stop bits, sem paridade. **Toledo**: um guia de fornecedor cita 2400 bps e a configuração no menu da balança (`2011`, depois `C14` = `Prt5` e `C15`).

**Não se sabe** (os manuais consultados não trazem):

- O **formato exato da mensagem de peso** de cada balança (bytes, terminadores, sinal de estabilidade, peso líquido ou bruto).
- Se cada uma envia o peso **continuamente** ou **só quando o computador pede**.
- Se os parâmetros de serial acima valem para estes exemplares.

Por isso a **descoberta em bancada é a primeira entrega** e os drivers finais só são escritos depois dela (§6).

## 3. Decisões tomadas

| Tema | Decisão |
|---|---|
| Como ler a balança | **Web Serial API no navegador** (Chrome/Edge), sem instalar nada no caixa. O app já roda em HTTPS |
| Agente local | Não agora. A leitura fica atrás de uma **interface de transporte trocável**, para que um agente entre depois sem refazer o PDV (a impressora térmica, B3, provavelmente vai exigir um) |
| Onde fica a configuração | **Por caixa, no navegador** (Zustand persistido). Nada no banco, nenhum endpoint novo |
| Backend | **Sem mudanças.** O pedido continua enviando `qty`; o campo aceita 3 casas decimais (`Numeric(10,3)`), suficiente para gramas |
| Peso usado na venda | Peso **estável** da balança, líquido (a tara é feita no botão da própria balança) |
| Preço/total do visor da balança | Ignorados. O sistema calcula preço/kg × peso |
| Quantidade manual | Sempre editável (plano B) |

## 4. Arquitetura (só frontend)

Pasta nova `frontend/src/hardware/scale/`, com peças pequenas e independentes:

- **Drivers** (`drivers/toledo.ts`, `drivers/urano.ts`): funções puras que convertem os bytes recebidos em `{ pesoKg, estavel, bruto? }`. Cada driver declara os parâmetros de serial e, se o protocolo for "a pedido", o comando de solicitação. Mantêm buffer interno e toleram frames partidos ou lixo.
- **Transporte Web Serial** (`webSerial.ts`): abre a porta, lê continuamente, detecta desconexão e reconecta quando o cabo volta (evento `connect` da API).
- **Interface de transporte** (`types.ts`): contrato mínimo (`conectar`, `desconectar`, assinatura de leituras) que um agente local pode implementar no futuro.
- **Contexto `ScaleProvider` e hook `useScale()`**: estado (`sem-suporte | desconectada | conectando | conectada | erro`) e leitura atual para o PDV.
- **Filtro de estabilidade**: usa o sinal da balança se existir; senão, considera estável após 3 leituras iguais seguidas.
- **Configuração por caixa** (Zustand, persistida): modelo da balança (Toledo Prix ou Urano POP-S) e se está ativa.
- **Balança simulada** (`fakeScale.ts`): controle deslizante que gera leituras, para desenvolver e testar o PDV sem hardware.
- **Cartão "Balança" em Configurações**: escolher o modelo, botão **Conectar balança** (a autorização da porta exige um clique do operador na primeira vez; depois o navegador lembra) e a área **Testar**.

### Área Testar (ferramenta de descoberta)

Mostra, ao vivo: bytes crus em hexadecimal e ASCII, intervalo entre mensagens, contagem de mensagens descartadas, o peso interpretado e o estado de estabilidade. Permite trocar a velocidade da serial e enviar um comando de solicitação manual. É a ferramenta usada para capturar o protocolo real de cada balança e para o roteiro de verificação em campo.

## 5. Fluxo da venda (`NewOrder.tsx`)

- **Indicador no topo:** "Balança: 1,250 kg (estável)" ou "Balança desconectada".
- **Produto em `kg` com a balança conectada:** a quantidade passa a ser o peso estável atual. Peso ≤ 0: não adiciona e avisa "Coloque o produto na balança". Peso oscilando: espera até 2 s; se não estabilizar, avisa "Peso instável" e não adiciona.
- **Mesmo produto de novo:** soma o novo peso ao que já está no carrinho (duas sacolas). Cada item em `kg` no carrinho tem um botão **Pesar** que relê a balança e **substitui** a quantidade.
- **Quantidade manual:** o campo continua editável a qualquer momento.
- **Sem balança, desconectada ou navegador sem suporte:** comportamento de hoje (quantidade 1, editável), com aviso discreto.
- **Produtos que não são `kg`:** inalterados.
- **Precisão:** peso arredondado a gramas (3 casas).

## 6. Descoberta e ordem de entrega

Ordem do plano, com um **portão** de hardware no meio:

1. **Base sem hardware:** interface de transporte, transporte Web Serial, `ScaleProvider`/`useScale`, configuração por caixa, balança simulada, cartão em Configurações com a área Testar, e o Vitest configurado. Entregável e testável sem nenhuma balança.
2. **Portão de captura (precisa do usuário):** ligar cada balança a um PC com Chrome/Edge e capturar os frames. Pré-requisitos por balança: **Toledo** cabo conversor RJ45→serial da Toledo (+ adaptador serial→USB se faltar porta COM) e conferência do menu da balança; **Urano** cabo serial RS-232 (+ adaptador serial→USB), 9600 bps, 8 bits, 2 stop bits, sem paridade. Os frames capturados viram fixtures de teste.
3. **Drivers Toledo e Urano**, escritos e testados contra os frames reais.
4. **Integração no PDV** (§5).

## 7. Tratamento de falhas

| Situação | Comportamento |
|---|---|
| Cabo solto ou porta some | Status "desconectada"; reconecta sozinho quando voltar; PDV segue no modo manual; carrinho preservado |
| Sem dados há mais de 2 s | Leitura marcada como obsoleta; nunca usada na venda |
| Peso ≤ 0, negativo ou sobrecarga | Não usado |
| Porta em uso por outra aba | Aviso "porta em uso" |
| Permissão negada ou revogada | Pede para reconectar |
| Navegador sem Web Serial | Mensagem clara e modo manual |
| Mensagem corrompida | Descartada e contada na área Testar |

## 8. Testes e verificação

- **Vitest** (novo devDependency do frontend, só para lógica pura): drivers contra os frames reais capturados; filtro de estabilidade; regra pura "leitura → quantidade do item" (zero, instável, obsoleta, soma e substituição); reconexão com transporte falso.
- **Balança simulada** para construir e demonstrar o fluxo do PDV.
- **Teste real** com cada balança no Chrome/Edge, com roteiro na área Testar: zerar, colocar um peso conhecido, usar a tara, desconectar o cabo no meio de uma venda e reconectar.
- **Deploy:** nenhum sem a autorização explícita do usuário (regra do projeto). Nada disto exige mudança no backend.

## 9. Ligações com os outros sub-projetos

- **B2 (leitor C3Tech):** leitores USB costumam "digitar" o código como um teclado; o backend já tem `GET /products/barcode/{barcode}`. O ajuste é de foco e captura no PDV. A confirmar no seu ciclo.
- **B3 (impressora Epson):** cupom do pedido; provavelmente exige um agente local para comando direto (corte, gaveta). A interface de transporte deste projeto foi pensada para que esse agente possa ser plugado depois.
- **C (nota fiscal):** independente.
