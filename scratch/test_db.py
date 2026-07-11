import sys
sys.path.append("d:\\DroneMVP\\backend")

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from app.config import get_settings

async def main():
    settings = get_settings()
    print("Database URL:", settings.database_url)
    engine = create_async_engine(settings.database_url)
    try:
        async with engine.connect() as conn:
            print("Successfully connected to the database!")
    except Exception as e:
        print("Failed to connect to the database:")
        print(e)

if __name__ == "__main__":
    asyncio.run(main())
