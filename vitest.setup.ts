import { vi } from "vitest";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

// Mock global window object for React Native environment
global.window = {} as any;
