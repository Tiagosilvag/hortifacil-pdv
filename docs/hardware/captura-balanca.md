# Captura do protocolo das balanças (portão do plano B1b)

Objetivo: descobrir, com cada balança, **o formato exato da mensagem de peso**, se ela manda o peso **continuamente ou só a pedido**, e se há um sinal de **peso estável**. Sem isso os drivers de Toledo e Urano não podem ser escritos.

## O que separar

| | Toledo Prix 3 Plus | Urano US 15/5 POP-S |
|---|---|---|
| Cabo | Conversor **RJ45 → RS-232** específico da Toledo | Cabo **serial RS-232** |
| Se o PC não tem porta COM | Adaptador **serial → USB** | Adaptador **serial → USB** |
| Ponto de partida na tela | Toledo Prix (2400, 8, 1 stop, sem paridade; **a confirmar**) | Urano POP-S (9600, 8, 2 stop, sem paridade) |

Na Toledo, o guia de um fornecedor manda entrar no menu da balança (tecla Modo, código `2011`) e conferir os parâmetros `C14` (`Prt5`) e `C15` (2400). Confirme no manual da balança antes de ligar.

## Passo a passo (repita para cada balança)

1. No computador do caixa, abra o HortiFácil no **Chrome ou Edge**, como administrador: **Configurações > Balança**. Deixe o modelo em **Nenhuma** para a porta ficar livre.
2. Ligue o cabo (e o adaptador USB, se houver) e ligue a balança.
3. Na área **Testar balança**, escolha o ponto de partida do modelo e clique em **Conectar e escutar**. No seletor do navegador escolha a porta da balança (aparece como "USB Serial", "Prolific", "CH340" ou "COMx").
4. **Antes de cada etapa, clique em Limpar.** Faça as etapas na ordem e **copie o log** (botão **Copiar log**) ao fim de cada uma, em um arquivo de texto separado:
   1. Balança vazia, parada, por 10 segundos.
   2. Coloque um peso conhecido (um pacote de 1 kg fechado serve) e espere 10 segundos.
   3. Retire o peso e espere 5 segundos.
   4. Coloque um peso menor (0,500 kg) e espere 5 segundos.
   5. Use a **tara** com um recipiente vazio; depois coloque um peso dentro dele.
   6. Deixe o peso **oscilando**: apoie a mão no prato e mexa por 5 segundos.
   7. Aperte na balança as teclas de **imprimir** e de **total**, se existirem, e anote o que muda no log.
5. **Se aparecer no log "erro de leitura (FramingError...)" ou os bytes vierem como lixo**, a velocidade, os bits de dados ou a paridade estão errados: a conexão continua aberta, então desconecte e tente a próxima combinação. Se o log ficar muito longo, aparece o aviso "Log truncado": copie o log com mais frequência.
6. **Se nada chegar em 10 segundos**, desconecte e tente, um por vez: outra velocidade (2400, 4800 ou 9600), 7 bits de dados, paridade par. Anote qual combinação fez chegar dados. Depois tente **enviar um comando**: é uma **tentativa**, não um fato; alguns protocolos respondem a um byte de solicitação, por exemplo `05`. Anote se a balança respondeu.

## O que me enviar de cada balança

- O modelo exato e o que está escrito na etiqueta (número de série não é necessário).
- A combinação de velocidade, bits de dados, stop bits e paridade que funcionou.
- Os 7 logs copiados (pode colar no chat; não há dado pessoal neles).
- Se a balança manda o peso sozinha, ou só depois de um comando (e qual).
- Se o peso já vem líquido (depois da tara) e se existe algum sinal de estável.

Com isso escrevo o plano dos drivers (B1b), usando os logs como testes.
