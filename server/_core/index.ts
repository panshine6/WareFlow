import "dotenv/config";
// Load environment variables from .env and .env.local
import "../../scripts/load-env.js";

import express from "express";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function ensureDbColumns() {
  try {
    const db = await getDb();
    if (!db) {
      console.log('[db] Database not available, skipping column check');
      return;
    }
    
    // Check if boxId column exists
    const result = await db.execute(sql`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'products' 
        AND COLUMN_NAME = 'boxId'
    `);
    
    if (!result || (Array.isArray(result) && result.length === 0) || (result[0] && Array.isArray(result[0]) && result[0].length === 0)) {
      console.log('[db] Adding missing boxId column...');
      await db.execute(sql`ALTER TABLE products ADD COLUMN boxId varchar(64) NULL`);
      console.log('[db] boxId column added successfully');
    } else {
      console.log('[db] boxId column already exists');
    }
    
    // Check if boxName column exists
    const result2 = await db.execute(sql`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'products' 
        AND COLUMN_NAME = 'boxName'
    `);
    
    if (!result2 || (Array.isArray(result2) && result2.length === 0) || (result2[0] && Array.isArray(result2[0]) && result2[0].length === 0)) {
      console.log('[db] Adding missing boxName column...');
      await db.execute(sql`ALTER TABLE products ADD COLUMN boxName varchar(255) NULL`);
      console.log('[db] boxName column added successfully');
    } else {
      console.log('[db] boxName column already exists');
    }
    
    // Check if price column exists
    const result3 = await db.execute(sql`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'products' 
        AND COLUMN_NAME = 'price'
    `);
    
    if (!result3 || (Array.isArray(result3) && result3.length === 0) || (result3[0] && Array.isArray(result3[0]) && result3[0].length === 0)) {
      console.log('[db] Adding missing price column...');
      await db.execute(sql`ALTER TABLE products ADD COLUMN price decimal(10,2) NULL`);
      console.log('[db] price column added successfully');
    } else {
      console.log('[db] price column already exists');
    }
    
    console.log('[db] Database schema check completed');
  } catch (error) {
    console.error('[db] Error ensuring database columns:', error);
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Ensure database columns exist before starting server
  await ensureDbColumns();
  
  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
