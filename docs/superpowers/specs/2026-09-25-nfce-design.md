# Cupom fiscal (NFC-e): emissão pelo PDV — Design (sub-projeto C)

**Data:** 2026-09-25
**Status:** aguardando revisão do usuário
**Antecede:** B3 (impressora Epson, cupom não fiscal), já em `main`.

## 1. Objetivo

Emitir a NFC-e (nota fiscal de consumidor eletrônica, modelo 65) na venda de balcão e imprimir o cupom fiscal (DANFE NFC-e) na Epson do caixa, substituindo o que o Gestão Fácil fazia. O sistema antigo emitia "modo normal" (NF-e modelo 55) na SEFAZ-PE; o uso de balcão é NFC-e.

Fora do escopo do sub-projeto C: NF-e modelo 55, nota em venda fiada, devolução, inutilização de numeração, SPED, notas de entrada (XML de compra) e agente de impressão local.

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Documento | NFC-e modelo 65 |
| Emissão | Provedor de API fiscal (candidatos: Nuvem Fiscal, Focus NFe), atrás de uma interface `FiscalProvider` trocável. Preço e homologação são confirmados antes de contratar |
| Dados fiscais dos produtos | Padrão por categoria (vindo do contador) + edição por produto. Nada é importado do sistema antigo: os NCM de lá não batem com as descrições |
| Regime da empresa | **Normal** (a DANFE do sistema antigo usa CST de 3 dígitos e ICMS de 20,5%, não CSOSN do Simples) |
| Ambiente | Começa em **homologação**; produção só depois de o contador validar um cupom de teste |
| Fiado | Sem NFC-e no C1 (`not_required`, com aviso). Decidir com o contador |
| CPF do consumidor | Só o de cliente já cadastrado, no C1 |
| Segredos | Token do provedor, CSC e certificado ficam **só em variáveis de ambiente do Coolify**; nunca no repositório (público) nem no banco em texto puro |

## 3. Arquitetura

Backend (`backend/app/`):

- `services/fiscal/provider.py`: interface `FiscalProvider` com `emit_nfce(payload)`, `cancel_nfce(reference, reason)` e `get_nfce(reference)`.
- `services/fiscal/fake.py`: `FakeFiscalProvider` para os testes (autorizada, rejeitada, timeout, duplicada). Nenhum teste chama a SEFAZ.
- `services/fiscal/<provedor>.py`: adaptador do provedor real, escrito depois de o usuário contratar e passar o token e o CSC de homologação.
- `services/fiscal_service.py`: monta o payload a partir do pedido, resolve o dado fiscal de cada item (produto → padrão da categoria), chama o provedor, grava o resultado no pedido e em `fiscal_events`.
- `api/v1/fiscal.py`: configuração da empresa, padrões por categoria, teste de conexão, emissão e nova tentativa por pedido.

Frontend: aba **Fiscal** em Configurações (admin), seção "Dados fiscais" no cadastro de produto, selo de status fiscal no pedido, botão de nova tentativa e camada de impressão da B3 estendida com um bloco `qrcode`.

## 4. Modelo de dados (Alembic, colunas opcionais)

**`products`** (novas, todas nulas até serem preenchidas): `ncm` (8 dígitos), `cest`, `origem` (0 a 8), `cfop`, `cst_icms` (2 dígitos), `aliquota_icms`, `cst_pis`, `cst_cofins`.

**`fiscal_defaults`**: uma linha por categoria (nome da categoria, como em `Product.category`) com os mesmos campos. O produto herda o padrão da categoria campo a campo quando o dele está vazio; o próprio sempre prevalece.

**Produto "pronto para emitir":** NCM válido, origem, CFOP, CST do ICMS e, quando o CST cobra imposto, alíquota. Faltando algo, o produto é **pendente** e a venda que o contém não emite.

**`fiscal_settings`** (uma linha, só admin edita): CNPJ, IE, razão social, endereço, regime (`normal` | `simples`), ambiente (`homologacao` | `producao`), série da NFC-e, provedor. Os segredos não ficam aqui.

**`order_items`** (snapshot no momento da emissão, como nome e preço): `ncm`, `cfop`, `cst_icms`, `aliquota_icms`, `cst_pis`, `cst_cofins`. Mudar o cadastro depois não altera notas já emitidas.

**`orders`** (reaproveita `invoice_number`, `invoice_series`, `invoice_key`): `fiscal_status` (`not_required` | `pending` | `authorized` | `rejected` | `cancelled`), `fiscal_protocol`, `fiscal_qr_url`, `fiscal_xml_url`, `fiscal_emitted_at`, `fiscal_error`, `fiscal_attempts`.

**`fiscal_events`** (imutável): pedido, tipo (emissão, nova tentativa, cancelamento), resposta bruta do provedor, código da SEFAZ, horário e usuário.

## 5. Regras de negócio

- **Quando emite:** ao confirmar o pedido, se a emissão fiscal estiver ligada e o pedido não for fiado puro. O pedido é salvo primeiro; a emissão roda depois e nunca atrasa nem impede o registro. Pedido em `pending` (ainda não entregue) também emite.
- **Idempotência:** o pedido leva uma referência única para o provedor (número do pedido mais identificador do ambiente); repetir a tentativa não duplica a nota. Um pedido tem no máximo uma NFC-e.
- **Desconto:** vai como desconto na nota, rateado entre os itens, com arredondamento fechando o total exato.
- **CST composto:** origem (1 dígito) + CST do ICMS (2 dígitos), como na DANFE do sistema antigo (000, 060, 260 etc.).
- **Rejeição da SEFAZ ou do provedor:** `fiscal_status = rejected` com o motivo em `fiscal_error`; a venda continua válida; botão "Tentar de novo". Rejeição por dado do produto leva o operador à tela do produto.
- **Cancelamento:** cancelar o pedido com NFC-e `authorized` cancela a NFC-e no provedor, dentro do prazo legal. Se o prazo passou ou o provedor falhar, o pedido **não** é cancelado e o sistema mostra o motivo (cancelar a venda e deixar a nota válida seria inconsistente). Só admin cancela (regra atual).
- **Auditoria:** toda tentativa de emissão ou cancelamento vira uma linha em `fiscal_events`.
- **Permissões:** aba Fiscal só para admin; "Tentar de novo" e imprimir o cupom fiscal para quem opera o caixa.
- **Cupom não fiscal (B3) x fiscal:** o cupom não fiscal só imprime se a nota não estiver autorizada; com a nota autorizada, a reimpressão sai fiscal.

## 6. Telas

- **Configurações > Fiscal (admin):** dados da empresa; ambiente em destaque, com aviso vermelho em homologação ("notas sem valor fiscal"); padrões por categoria; "Testar conexão com o provedor".
- **Produtos:** seção "Dados fiscais" com o padrão da categoria como sugestão; selo **Pendente** na lista e filtro "Só pendentes fiscais".
- **Pedido:** selo do status fiscal, número e chave quando autorizada; "Tentar de novo" com o motivo; "Imprimir cupom fiscal" quando autorizada.
- **Sucesso no PDV:** "Emitindo NFC-e…" e depois "Autorizada" ou "Pendente de emissão". O caixa nunca espera a SEFAZ.

## 7. Impressão do cupom fiscal (C2)

Reaproveita a camada da B3 (blocos → HTML → Epson) e ganha o bloco `qrcode` (gerado no navegador a partir da URL devolvida pelo provedor). Conteúdo do DANFE NFC-e: emitente, "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", itens, total, forma de pagamento, tributos aproximados (Lei da Transparência, com a tabela IBPT), número, série, data, chave de acesso, protocolo, QR Code e texto de consulta. Em homologação sai com a marca **"EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO – SEM VALOR FISCAL"**.

## 8. Testes

TDD, revisor de contexto novo no fim, como nos sub-projetos anteriores.

- `FakeFiscalProvider` em todos os testes automáticos (autorizada, rejeitada, timeout, duplicada).
- Montagem do payload: rateio de desconto, arredondamento, CST composto, exigência de campos.
- Idempotência da emissão.
- Cancelamento com prazo estourado não cancela o pedido.
- Herança do padrão da categoria e produto pendente.
- Migrations: aplicar e reverter em banco de teste.
- Homologação real: só com o token e o CSC de homologação, por checklist manual.

## 9. Riscos

- **Dado fiscal errado gera nota errada** (o maior). Mitigação: padrões vindos do contador, produto pendente bloqueia a emissão, homologação antes de produção. Nenhum NCM ou CST é inventado.
- **Regime normal é mais complexo que Simples:** o provedor calcula, mas nós mandamos os códigos. O contador valida um cupom de teste antes de produção.
- **SEFAZ ou provedor fora do ar:** o pedido fica `pending` com nova tentativa. A contingência offline da NFC-e é decidida no C3, depois de escolher o provedor.
- **Vazamento de segredos:** só em variáveis do Coolify; checagem de dados pessoais e segredos antes de cada push, já parte do processo.
- **Prazos** de cancelamento e de contingência variam por estado: confirmar os da SEFAZ-PE antes do C3.

## 10. Pendências que dependem do usuário

1. **Contador:** tabela de CST, CFOP, ICMS, PIS/COFINS por categoria (hortaliças, frutas, ovos, embalados, limpeza etc.). Sem ela, a tela existe e os padrões ficam vazios.
2. **Credenciamento:** CSC de NFC-e gerado na SEFAZ-PE (de homologação e, depois, de produção). Sem ele nenhum provedor emite.
3. **Provedor:** escolher e contratar (o preço e o teste em homologação são confirmados por mim antes) e passar o token para o Coolify, nunca para o repositório.
4. **Certificado A1:** o do sistema antigo está em `GestaoFacil/Certificado/` (ignorado pelo Git). Ele só é enviado ao provedor pelo próprio usuário, se o provedor pedir.

## 11. Ordem de entrega

1. **C1:** migrations, dados fiscais do produto e padrões por categoria, aba Fiscal, `FiscalProvider` + `FakeFiscalProvider`, emissão e nova tentativa, selo de status.
2. **C2:** cupom fiscal com QR Code na Epson.
3. Portão: usuário passa o token e o CSC de homologação; adaptador do provedor real; checklist em homologação.
4. **C3:** cancelamento, contingência e liberação para produção, com o cupom validado pelo contador.

Nenhum deploy sem o "pode fazer o deploy" explícito do usuário.
