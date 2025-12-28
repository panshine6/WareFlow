/**
 * 清空数据库脚本
 * 删除所有产品和历史记录
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { products, inventoryHistory } from "../drizzle/schema";

async function clearDatabase() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  console.log("连接到数据库...");
  const connection = await mysql.createConnection(connectionString);
  const db = drizzle(connection);

  try {
    console.log("开始清空数据...");
    
    // 删除所有历史记录
    console.log("删除历史记录...");
    await db.delete(inventoryHistory);
    console.log("✅ 历史记录已删除");
    
    // 删除所有产品
    console.log("删除产品...");
    await db.delete(products);
    console.log("✅ 产品已删除");
    
    console.log("\n🎉 数据库清空完成！");
  } catch (error) {
    console.error("❌ 清空数据库失败:", error);
    throw error;
  } finally {
    await connection.end();
  }
}

clearDatabase().catch((error) => {
  console.error(error);
  process.exit(1);
});
