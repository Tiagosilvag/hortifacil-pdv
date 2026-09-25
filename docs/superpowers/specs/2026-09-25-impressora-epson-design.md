# Impressão de cupons na impressora térmica Epson — Design

Data: 2026-09-25
Sub-projeto **B3** da Fase 4 (hardware). Balanças (B1) e leitor de código de barras (B2) estão em ciclos próprios. A **nota fiscal (C)** vai reutilizar a camada de impressão deste projeto para o cupom fiscal.

## 1. Objetivo e contexto

Imprimir, na impressora térmica Epson do caixa, o **cupom do pedido** (comprovante não fiscal) e, depois, o **cupom fiscal** (NFC-e). Hoje nada imprime no HortiFácil: o frontend não tem impressão nenhuma, e o sistema antigo (Gestão Fácil) tinha mais de 25 modelos de cupom.

Equipamento (foto do usuário, 25/09/2026): impressora **Epson** com três LEDs e dois botões (aparenta a linha TM-T20; o modelo exato ainda não foi confirmado). Está **instalada no Windows com o driver da Epson** e aparece em "Impressoras" do Windows. Os caixas usam Windows com Chrome ou Edge, abrindo o HortiFácil em `https://hortfacil.coffetech.com.br`.

### Critério de sucesso

- Ao confirmar um pedido, o cupom sai sozinho na Epson do caixa (impressão silenciosa configurada), sem atrasar nem impedir o registro do pedido.
- É possível **imprimir** ou **reimprimir** o cupom de qualquer pedido, e imprimir uma página de teste para acertar o caixa.
- O cupom não pode ser confundido com um cupom fiscal: sai com "CUPOM NÃO FISCAL".

### Fora do escopo (agora)

Cupom fiscal (NFC-e): depende da emissão da nota (sub-projeto C), mas usa esta mesma camada. QR Code e código de barras no cupom (entram no C). Comprovante de fiado com assinatura (confissão de dívida), recibo de recebimento de fiado e fechamento de caixa: usam a mesma estrutura e podem ser somados depois. Comandos ESC/POS e agente local. Alterações no backend.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Como imprimir | **Pelo navegador, com o driver da Epson**: o cupom vira HTML/CSS na largura da bobina e o navegador manda para a impressora do Windows |
| Agente local / ESC/POS | Não agora. O cupom é uma **estrutura própria** (blocos), e o HTML é só um renderizador; um renderizador ESC/POS para um agente pode entrar depois sem refazer os cupons |
| Corte do papel e gaveta | Opções do **driver** da Epson, configuradas uma vez por caixa (não há comando no HTML) |
| Impressão silenciosa | Chrome/Edge do caixa aberto com `--kiosk-printing` e a Epson como impressora padrão do Windows |
| Configuração | **Por caixa, no navegador** (Zustand persistido, chave `pdv-printer`): largura do papel, imprimir ao confirmar, cabeçalho e rodapé. Nada no banco |
| Dados do comércio | Não existem no sistema; ficam na configuração da impressora (cabeçalho) |
| Largura | 80 mm por padrão; 58 mm como opção |
| Backend | **Sem mudanças** |

## 3. Arquitetura (só frontend)

Pasta nova `frontend/src/hardware/printer/`:

- **`receipt.ts`**: o cupom como lista de blocos: texto (alinhamento, negrito, tamanho), duas colunas (esquerda/direita), linha separadora, espaço em branco e corte. QR Code e código de barras são blocos que entram no sub-projeto C.
- **`orderReceipt.ts`**: função pura `buildOrderReceipt(order, config)`; o layout do cupom do pedido.
- **`renderHtml.ts`**: `renderReceiptHtml(receipt, { widthMm })` gera um documento HTML/CSS completo com `@page { margin: 0 }` (o tamanho do papel vem do driver; `size: <largura> auto` é CSS inválido e o navegador o descarta), preto no branco e colunas por flexbox (o alinhamento não depende da largura das letras).
- **`print.ts`**: `printHtml(html)` usa um iframe oculto na própria página e `window.print()`; limpa o iframe depois.
- **`stores/printer.ts`**: configuração por caixa (largura, imprimir ao confirmar, cabeçalho e rodapé).
- **Aba "Impressora" em Configurações**: campos do cabeçalho e rodapé, largura, imprimir ao confirmar e o botão **Imprimir teste**.
- **PDV e pedidos**: ao confirmar o pedido imprime (se ligado); a tela "Pedido registrado" ganha **Imprimir cupom**; a tela do pedido ganha **Reimprimir**.

## 4. Conteúdo do cupom do pedido

De cima para baixo: (1) cabeçalho configurável (nome do comércio, endereço, telefone); (2) **"CUPOM NÃO FISCAL"** em destaque; (3) pedido nº, data e hora, operador e cliente (se houver); (4) itens: código e nome, e em outra linha `quantidade × preço = total` (kg com 3 casas); (5) subtotal, desconto e **TOTAL**; (6) formas de pagamento, uma linha para cada uma (dinheiro, Pix, cartão, fiado); (7) observação do pedido, se houver; (8) rodapé configurável (por exemplo "Obrigado! Volte sempre"). Pedido **cancelado** sai com "CANCELADO" no topo (reimpressão). Campos vazios não deixam linhas em branco.

## 5. Comportamento, falhas e limites

| Situação | Comportamento |
|---|---|
| Sem `--kiosk-printing` | O navegador abre a janela de impressão a cada cupom (funciona, mais lento) |
| Falta de papel, impressora desligada | O navegador **não detecta**. Por isso existem **Imprimir** e **Reimprimir**; o pedido já foi salvo |
| Falha ao imprimir automaticamente | Nunca impede nem atrasa o registro do pedido (a impressão roda depois, sem esperar) |
| Gaveta configurada no driver para abrir "depois de imprimir" | Abre em **todo** trabalho, inclusive teste e reimpressão. É uma escolha de instalação, documentada |
| Papel do driver diferente da largura escolhida | A impressão sai reduzida ou cortada: o roteiro manda usar o papel de bobina de 80 mm |
| Acentos | Saem corretos: o cupom vai como imagem pelo driver (sem tabela de caracteres) |
| Nomes longos | Quebram em várias linhas |
| Tema escuro do sistema | Ignorado: o documento impresso é sempre preto no branco |

## 6. Testes e verificação

- **Vitest (lógica pura):** o cupom montado a partir do pedido (itens, kg com 3 casas, desconto, pagamentos divididos, cliente, observação, cancelado, campos vazios), o HTML gerado (texto escapado, largura, estrutura) e os valores padrão da configuração.
- **Navegador:** o HTML do cupom e a chamada de impressão são verificados no navegador de desenvolvimento.
- **Impressão real:** só no caixa, com a Epson, pelo **Imprimir teste** e o roteiro (corte, gaveta, acentos, nome longo, 58 mm, impressão silenciosa).
- **Deploy:** nenhum sem a autorização explícita do usuário. Nada exige mudança no backend.

## 7. Ordem de entrega

1. Estrutura do cupom, construtor do cupom do pedido, renderizador HTML e envio para imprimir (testável sem impressora).
2. Configuração por caixa e a aba "Impressora" com o teste.
3. Integração no PDV (imprimir ao confirmar, Imprimir cupom e Reimprimir).
4. Roteiro de instalação da Epson por caixa (`docs/hardware/impressora-epson.md`).
5. **Portão de hardware (precisa do usuário):** configurar a Epson em um caixa e testar; ajustes de layout a partir da impressão real.

## 8. Ligações com os outros sub-projetos

- **C (nota fiscal):** o cupom fiscal (NFC-e) será um segundo construtor de cupom, `buildFiscalReceipt`, que acrescenta os blocos de QR Code e código de barras e usa o mesmo renderizador e o mesmo envio para imprimir. O layout segue as regras da NFC-e.
- **B1/B2:** independentes. O cupom de um pedido com itens pesados mostra a quantidade que a balança registrou.
