import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.models.user import ALL_MODULES, UserRole


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.operator
    allowed_modules: list[str] | None = None
    can_create_products: bool = False
    can_edit_products: bool = False

    @field_validator("allowed_modules")
    @classmethod
    def validate_modules(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            invalid = set(v) - set(ALL_MODULES)
            if invalid:
                raise ValueError(f"Módulos inválidos: {invalid}")
        return v


class UserUpdate(BaseModel):
    name: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None
    allowed_modules: list[str] | None = None
    can_create_products: bool | None = None
    can_edit_products: bool | None = None
    password: str | None = None

    @field_validator("allowed_modules")
    @classmethod
    def validate_modules(cls, v: list[str] | None) -> list[str] | None:
        if v is not None:
            invalid = set(v) - set(ALL_MODULES)
            if invalid:
                raise ValueError(f"Módulos inválidos: {invalid}")
        return v


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    email: str
    role: UserRole
    is_active: bool
    allowed_modules: list[str] | None
    can_create_products: bool
    can_edit_products: bool
    created_at: datetime
    last_login: datetime | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
