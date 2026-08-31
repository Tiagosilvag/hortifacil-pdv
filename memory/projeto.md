# Memória do Projeto — HortiFácil PDV

## O que é
Sistema de PDV web para hortifrúti, adaptável a qualquer comércio.

## Dor resolvida na Fase 1
Vendas externas sem controle: não se sabe o que foi vendido, para quem, quando, e quanto está em aberto (fiado).

## Stack
- Backend: Python 3.11 + FastAPI + SQLAlchemy 2.0 async + Alembic + PostgreSQL
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS
- Hardware (Fase 4): agente Python local — pyserial (balança), python-escpos (impressora), PyUSB
- WhatsApp (Fase 5): n8n + MCP — sem código no backend

## Servidor
- PostgreSQL já disponível no servidor do cliente
- Deploy: Docker + Nginx

## Regras de Negócio Críticas
1. Limite de crédito por cliente — bloqueio automático quando balance_due >= credit_limit
2. Todo pedido registra: operador (id + nome snapshot), data + hora exatos
3. Nome do operador copiado para dentro do pedido (auditoria permanente)
4. Cancelamento de pedido fiado reverte o balance_due do cliente
5. order_number é sequencial legível (1, 2, 3...) — separado do UUID

## Módulos da Fase 1
- Cadastro de produtos (nome, preço, unidade: kg/un/lt/g, categoria)
- Cadastro de clientes (limite de crédito, tipo: balcão/externo/hotel/pousada)
- Registro de pedidos com itens + auditoria
- Contas a receber (fiado) com status e pagamentos parciais
- Dashboard: devedores, vendas do dia, clientes bloqueados
- Auth: JWT, perfis admin e operador

## Decisões de Arquitetura
- FastAPI async (não Django) — mais leve, OpenAPI automático, Pydantic tipado
- Hardware via agente Python local WebSocket (não WebUSB — HTTPS complications)
- WhatsApp via n8n + MCP ao invés de código no backend
- UUIDs como PK + order_number sequencial como referência humana

## Estrutura do Repositório
```
backend/app/api/v1/    # routers
backend/app/core/      # config, database, security
backend/app/models/    # SQLAlchemy ORM
backend/app/schemas/   # Pydantic v2
backend/app/services/  # lógica de negócio
backend/alembic/       # migrations
frontend/              # React + Vite (a criar)
hardware-agent/        # Fase 4
memory/                # este arquivo e outros
```
