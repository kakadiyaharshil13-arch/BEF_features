import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test_mongo():
    try:
        client = AsyncIOMotorClient("mongodb://localhost:27017")
        db = client["ActiveRecall"]
        # Try to insert a test document
        result = await db["test"].insert_one({"test": "ok"})
        print(f"Connection successful, inserted ID: {result.inserted_id}")
        # Delete test document
        await db["test"].delete_one({"_id": result.inserted_id})
        print("Cleanup successful")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_mongo())
