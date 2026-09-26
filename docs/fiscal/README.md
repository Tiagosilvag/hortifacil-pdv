# NFC-e: como experimentar com o provedor falso

O backend já sabe montar e "emitir" a NFC-e, mas só com um provedor **falso** (as notas não existem na SEFAZ). Serve para desenvolver as telas e conferir o fluxo. Nada disto vale como nota fiscal.

## Ligar em desenvolvimento

1. No `backend/.env`, deixe `ENVIRONMENT=development` e acrescente `FISCAL_PROVIDER=fake`.
2. Aplique as migrations: `cd backend && alembic upgrade head`.
3. Suba o backend e abra `http://localhost:8000/docs`, entre como administrador.
4. `PUT /api/v1/fiscal/settings` com dados **fictícios** e `"enabled": true` (CNPJ, IE, razão social, endereço, código IBGE do município, UF e CEP).
5. `PUT /api/v1/fiscal/defaults` para uma categoria, por exemplo `{"category": "Frutas", "ncm": "08039000", "origem": 0, "cfop": "5102", "cst_icms": "41"}`.
6. `GET /api/v1/fiscal/pending-products` lista o que ainda falta nos produtos.
7. Crie um pedido de produtos dessa categoria e consulte `GET /api/v1/orders/{id}`: `fiscal_status` vira `authorized` com número, chave e QR falsos. Se faltar dado num produto, fica `pending` com o motivo em `fiscal_error`, e `POST /api/v1/fiscal/orders/{id}/emit` tenta de novo.

## O que o sistema faz sozinho

- **Fiado:** pedido com qualquer parte fiada não emite (`not_required`).
- **Falha do provedor:** o pedido continua salvo; a nota fica `pending` e pode ser tentada de novo.
- **Cancelamento:** cancelar um pedido com NFC-e autorizada cancela **primeiro a nota** (motivo de 15 a 255 caracteres, dentro do prazo da empresa). Se algo falhar, o pedido **não** é cancelado.
- **Fora do desenvolvimento:** `FISCAL_PROVIDER=fake` só funciona com `ENVIRONMENT=development`; em qualquer outro valor é recusado. Em produção o padrão é `none` (nada emite).
- **Simples Nacional:** ainda não dá para ligar a emissão com esse regime (a nota usaria CSOSN).

## O que falta para emitir de verdade

1. Tabela fiscal do contador por categoria (CST, CFOP, ICMS, PIS/COFINS), preenchida na aba Fiscal (C1b).
2. CSC da NFC-e gerado na SEFAZ-PE (homologação e depois produção).
3. Provedor escolhido e contratado, com o token guardado **só** nas variáveis de ambiente do Coolify.
4. Adaptador do provedor real (um arquivo novo em `app/services/fiscal/`, registrado em `get_provider`).
5. Contingência **offline** da NFC-e (emitir sem conexão e transmitir depois): depende do provedor escolhido.

## Cancelamento, reenvio e produção (C3)

- **Cancelar a nota:** o motivo é obrigatório (15 a 255 caracteres) e o **prazo** vem de Configurações > Fiscal (padrão **30 minutos**). O prazo varia por estado (há relatos de 30 minutos e de 24 horas): **confirme com o contador**. Fora do prazo o pedido não é cancelado e o sistema manda procurar o contador. Cada tentativa fica na auditoria (`fiscal_events`).
- **Consultar situação:** para nota pendente que já foi ao provedor (tempo esgotado), o botão pergunta ao provedor o que houve; a SEFAZ pode ter autorizado sem a resposta chegar. Enquanto isso o pedido **não** pode ser cancelado.
- **Reenvio automático:** o servidor reenvia sozinho, a cada `FISCAL_RETRY_INTERVAL_SECONDS` (padrão 120; 0 desliga), as notas pendentes por falha do provedor das últimas 24 horas. A emissão é idempotente pela referência, então repetir não duplica a nota. Também dá para reenviar na hora em Configurações > Fiscal.
- **Ida para produção:** em Configurações > Fiscal, mudar o ambiente para Produção pede confirmação e o servidor só libera se: houver **provedor fiscal real** configurado (o falso e o desligado não servem), a emissão estiver ligada com todos os dados da empresa, existir **ao menos uma venda de teste autorizada em homologação** e o administrador confirmar que o **contador validou o cupom**. Quem confirmou e quando ficam registrados.
- **Ainda não existe:** inutilização de numeração, cancelamento fora do prazo (por substituição ou evento extemporâneo) e a contingência offline.

## Cupom fiscal na Epson (C2)

Com a NFC-e **autorizada**, o botão de imprimir passa a ser **Imprimir cupom fiscal** (na tela do pedido, **Reimprimir cupom fiscal**) e o cupom sai como DANFE NFC-e, com QR Code. Nos demais casos (fiado, dado fiscal faltando, emissão desligada) continua saindo o **cupom não fiscal**.

- **Impressão automática ao confirmar:** com a emissão fiscal ligada, ela espera a nota assentar (alguns segundos) para imprimir o documento certo; se a nota não assentar a tempo, imprime o cupom não fiscal. Sem emissão fiscal, imprime na hora, como antes.
- **Dados da empresa** no cupom vêm de Configurações > Fiscal (o servidor os entrega a qualquer usuário logado em `GET /api/v1/fiscal/status`).
- **Data e documento do consumidor:** o cupom usa a hora em que o servidor recebeu a autorização (não a data de emissão do XML, nem a data da autorização, que o layout oficial prevê) e o CPF/CNPJ do cliente **como está no cadastro hoje** (uma reimpressão depois de o cadastro mudar pode mostrar outro documento). Ambos se resolvem com o adaptador do provedor real, guardando esses dados no pedido.
- **Ainda fora do cupom:** os **tributos aproximados** (Lei 12.741, que precisa da tabela IBPT por NCM) e o **endereço de consulta da SEFAZ** impresso por extenso (depende do provedor real). Confirmar com o contador antes de emitir em produção.
