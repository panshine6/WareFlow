import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "./__mocks__/@react-native-async-storage/async-storage.ts"
      ),
    },
  },
});
