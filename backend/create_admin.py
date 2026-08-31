"""
Script para criar o primeiro usuário admin.
Rodar uma única vez após a primeira migration.

  cd backend
  python create_admin.py
"""
import asyncio

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole


async def main() -> None:
    name = input("Nome do admin: ").strip()
    email = input("Email: ").strip()
    password = input("Senha: ").strip()

    async with AsyncSessionLocal() as db:
        user = User(
            name=name,
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.admin,
        )
        db.add(user)
        await db.commit()
        print(f"\nAdmin criado com sucesso! ID: {user.id}")


if __name__ == "__main__":
    asyncio.run(main())
