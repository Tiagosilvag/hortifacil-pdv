from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (
    auth, categories, customers, dashboard, fiscal, orders, products, receivables, reports, stock_losses, users,
)
from app.core.config import settings
from app.services import fiscal_retry


@asynccontextmanager
async def lifespan(app: FastAPI):
    retry_task = fiscal_retry.start_retry_loop()  # None sem provedor fiscal ou com o intervalo em 0
    yield
    if retry_task:
        retry_task.cancel()


app = FastAPI(
    title="HortiFácil PDV",
    version="1.0.0",
    description="Sistema de gestão e ponto de venda",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(customers.router, prefix="/api/v1")
app.include_router(products.router, prefix="/api/v1")
app.include_router(orders.router, prefix="/api/v1")
app.include_router(receivables.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(stock_losses.router, prefix="/api/v1")
app.include_router(fiscal.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
