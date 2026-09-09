import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class CategoryCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Nome obrigatório")
        return v


class CategoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    is_active: bool
    created_at: datetime
