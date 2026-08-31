# HortiFácil PDV

Sistema de gestão e ponto de venda (PDV) iniciado como hortifrúti, arquitetado para ser multi-comércio.

## Stack

- **Backend:** Python 3.11+ · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2
- **Frontend:** React 18 · Vite · TypeScript · Tailwind CSS
- **Banco:** PostgreSQL (servidor já disponível)
- **Cache/Filas:** Redis · Celery (Fase 3+)
- **Hardware:** agente Python local via WebSocket (pyserial, python-escpos, PyUSB) — Fase 4
- **WhatsApp:** n8n + MCP — Fase 5

## Estrutura do Projeto

```
backend/          FastAPI + SQLAlchemy
  app/
    api/v1/       routers por módulo
    core/         config, database, security
    models/       SQLAlchemy ORM
    schemas/      Pydantic v2
    services/     lógica de negócio
  alembic/        migrations
frontend/         React + Vite
hardware-agent/   agente Python local para USB/serial
memory/           notas importantes do projeto
```

## Como Rodar (Desenvolvimento)

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
cp .env.example .env         # preencher DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Variáveis de Ambiente

Ver `backend/.env.example`. A variável mais importante é `DATABASE_URL`:
```
DATABASE_URL=postgresql+asyncpg://user:password@host:5432/hortifacil
```

## Fases de Implementação

| Fase | Foco | Status |
|------|------|--------|
| 1 | Clientes, Produtos, Pedidos, Fiado, Auditoria | Em desenvolvimento |
| 2 | PDV frente de caixa | Pendente |
| 3 | Estoque e validade | Pendente |
| 4 | Hardware USB (balança, impressora, leitor) | Pendente |
| 5 | WhatsApp via n8n + MCP | Pendente |

## Convenções

- UUIDs como PK em todas as tabelas
- `created_at` + `created_by_id` + `created_by_name` em transações financeiras
- `order_number` é sequencial legível (1, 2, 3...) — separado do UUID
- Nome do operador copiado para o pedido no momento da criação (auditoria permanente)
- Enums definidos em Python e mapeados para PostgreSQL native enum

## Regras de Negócio Importantes

- Cliente bloqueado automaticamente quando `balance_due >= credit_limit` (e credit_limit > 0)
- Venda fiado só é permitida se o cliente não estiver bloqueado
- `balance_due` é recalculado a cada pagamento (nunca decrementar manualmente)
- Todo cancelamento de pedido deve reverter o `balance_due` do cliente se era fiado
