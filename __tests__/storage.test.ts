import AsyncStorage from "@react-native-async-storage/async-storage";
import { describe, it, expect, beforeEach } from "vitest";
import { ProductStorage, SettingsStorage } from "../lib/storage";
import type { Product } from "../types/product";

describe("ProductStorage", () => {
  beforeEach(async () => {
    // 清空存储
    await AsyncStorage.clear();
  });

  it("should save and retrieve products", async () => {
    const product: Product = {
      id: "test-1",
      detailImageUri: "file:///test/detail.jpg",
      overviewImageUri: "file:///test/overview.jpg",
      sku: "TEST-001",
      quantity: 10,
      storageLocation: "A-01",
      createdAt: new Date().toISOString(),
    };

    await ProductStorage.add(product);
    const products = await ProductStorage.getAll();

    expect(products).toHaveLength(1);
    expect(products[0].sku).toBe("TEST-001");
    expect(products[0].quantity).toBe(10);
  });

  it("should search products by SKU", async () => {
    const product1: Product = {
      id: "test-1",
      detailImageUri: "file:///test/detail1.jpg",
      overviewImageUri: "file:///test/overview1.jpg",
      sku: "ACC-2024-001",
      quantity: 5,
      storageLocation: "A-01",
      createdAt: new Date().toISOString(),
    };

    const product2: Product = {
      id: "test-2",
      detailImageUri: "file:///test/detail2.jpg",
      overviewImageUri: "file:///test/overview2.jpg",
      sku: "ACC-2024-002",
      quantity: 8,
      storageLocation: "A-02",
      createdAt: new Date().toISOString(),
    };

    await ProductStorage.add(product1);
    await ProductStorage.add(product2);

    const results = await ProductStorage.searchBySku("ACC-2024-001");
    expect(results).toHaveLength(1);
    expect(results[0].sku).toBe("ACC-2024-001");
  });

  it("should delete a product", async () => {
    const product: Product = {
      id: "test-1",
      detailImageUri: "file:///test/detail.jpg",
      overviewImageUri: "file:///test/overview.jpg",
      sku: "TEST-001",
      quantity: 10,
      storageLocation: "A-01",
      createdAt: new Date().toISOString(),
    };

    await ProductStorage.add(product);
    await ProductStorage.permanentDelete("test-1");

    const products = await ProductStorage.getAll();
    expect(products).toHaveLength(0);
  });
});

describe("SettingsStorage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("should save and retrieve settings", async () => {
    await SettingsStorage.update({ lastSku: "TEST-001" });
    const settings = await SettingsStorage.get();

    expect(settings.lastSku).toBe("TEST-001");
  });

  it("should update default location", async () => {
    await SettingsStorage.update({ defaultLocation: "A-01" });
    const settings = await SettingsStorage.get();

    expect(settings.defaultLocation).toBe("A-01");
  });
});
