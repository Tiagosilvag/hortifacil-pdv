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
- **Cancelamento:** pedido com NFC-e autorizada não pode ser cancelado ainda (o cancelamento da nota vem no C3).
- **Produção:** `FISCAL_PROVIDER=fake` é recusado com `ENVIRONMENT=production`. Em produção o padrão é `none` (nada emite).

## O que falta para emitir de verdade

1. Tabela fiscal do contador por categoria (CST, CFOP, ICMS, PIS/COFINS), preenchida na aba Fiscal (C1b).
2. CSC da NFC-e gerado na SEFAZ-PE (homologação e depois produção).
3. Provedor escolhido e contratado, com o token guardado **só** nas variáveis de ambiente do Coolify.
4. Adaptador do provedor real (um arquivo novo em `app/services/fiscal/`, registrado em `get_provider`).
5. Telas (C1b), cupom com QR Code na Epson (C2) e cancelamento/contingência (C3).
