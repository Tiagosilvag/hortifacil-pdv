# Impressora Epson: configuração por caixa

O HortiFácil imprime o cupom pelo navegador, usando o driver da Epson instalado no Windows. Faça uma vez em cada caixa.

## 1. No Windows

1. **Driver da Epson instalado** e a impressora aparecendo em *Impressoras e scanners*. O modelo está na etiqueta embaixo da impressora.
2. **Impressora padrão:** selecione a Epson e escolha *Definir como padrão*. No Windows 11, desligue antes *Permitir que o Windows gerencie minha impressora padrão*.
3. **Papel do driver em bobina de 80 mm.** Em *Preferências de impressão*, escolha o tamanho de papel de bobina de 80 mm (o nome varia conforme o modelo e o driver). Papel errado faz o cupom sair reduzido ou cortado.
4. **Corte e gaveta.** Nas opções do driver escolha cortar o papel ao fim de cada documento e, se houver gaveta de dinheiro, abrir a gaveta ao imprimir. Os nomes das opções variam conforme o driver. Atenção: a gaveta abre em **todo** trabalho de impressão, inclusive teste e reimpressão.

## 2. Impressão silenciosa (sem a janela de impressão)

Sem este passo o navegador abre a janela de impressão a cada cupom (funciona, mas é mais lento).

1. Clique com o botão direito no atalho do **Chrome** (ou do **Edge**) que o caixa usa, e abra *Propriedades*.
2. No campo *Destino*, no **final** da linha e depois das aspas, acrescente um espaço e `--kiosk-printing`.
3. Feche todas as janelas do navegador e abra de novo **por esse atalho**.

Com essa opção, **qualquer** impressão desse navegador sai direto na impressora padrão. Use um atalho só para o caixa.

## 3. No HortiFácil (como administrador)

1. **Configurações > Impressora:** preencha nome do comércio, endereço, telefone e rodapé; escolha a largura do papel (80 mm); marque **Imprimir o cupom ao confirmar o pedido**.
2. Clique em **Imprimir teste**.

## 4. Checklist do teste

- [ ] A régua `1234567890…` cabe na largura, sem cortar nas bordas (se sair pequena, o papel do driver está errado; se cortar, a largura ou as margens do driver estão erradas).
- [ ] Os acentos saem certos (`ÁÉÍÓÚ áéíóú ãõç`).
- [ ] O nome longo do produto quebra em várias linhas.
- [ ] O papel é cortado **depois** do cupom, sem cortar a última linha.
- [ ] A gaveta abre (se houver).
- [ ] Sem janela de impressão (impressão silenciosa).
- [ ] Um **pedido de verdade**: confirme um pedido de teste; o cupom sai sozinho com os itens, o total e o pagamento certos.
- [ ] **Reimprimir cupom** na tela do pedido funciona; num pedido cancelado, sai "CANCELADO".
- [ ] (Opcional) Troque para **58 mm** na aba Impressora e no driver, e repita o teste.

## 5. O que enviar de volta

O modelo exato da Epson, uma **foto do cupom de teste** e de um cupom de pedido, e qualquer item do checklist que não passou. Com isso eu ajusto o layout para a impressão real.
