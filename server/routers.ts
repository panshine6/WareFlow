import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as aiVision from "./ai-vision";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  products: router({
    getAll: publicProcedure.query(async () => await db.getAllProducts()),
    getActive: publicProcedure.query(async () => await db.getActiveProducts()),
    getDeleted: publicProcedure.query(async () => await db.getDeletedProducts()),
    getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => await db.getProductById(input.id)),
    search: publicProcedure.input(z.object({ sku: z.string() })).query(async ({ input }) => await db.searchProductsBySku(input.sku)),
    create: publicProcedure.input(z.object({ id: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), sku: z.string(), quantity: z.number(), storageLocation: z.string(), operatorId: z.number(), operatorName: z.string() })).mutation(async ({ input }) => await db.createProduct({ ...input, isDeleted: 0, deletedAt: null, createdAt: new Date(), updatedAt: new Date() })),
    update: publicProcedure.input(z.object({ id: z.string(), sku: z.string().optional(), quantity: z.number().optional(), storageLocation: z.string().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await db.updateProduct(id, data); return { success: true }; }),
    softDelete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.softDeleteProduct(input.id); return { success: true }; }),
    restore: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.restoreProduct(input.id); return { success: true }; }),
    permanentDelete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.permanentDeleteProduct(input.id); return { success: true }; }),
    cleanupOld: publicProcedure.mutation(async () => { const count = await db.cleanupOldDeletedProducts(); return { count }; }),
    merge: publicProcedure.input(z.object({ existingProductId: z.string(), quantity: z.number(), location: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), operatorId: z.number(), operatorName: z.string() })).mutation(async ({ input }) => { const { existingProductId, ...newEntry } = input; await db.mergeProduct(existingProductId, newEntry); return { success: true }; }),
    getHistory: publicProcedure.input(z.object({ productId: z.string() })).query(async ({ input }) => await db.getProductHistory(input.productId)),
    addHistory: publicProcedure.input(z.object({ id: z.string(), productId: z.string(), operatorId: z.number(), operatorName: z.string(), quantity: z.number(), location: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), notes: z.string().optional() })).mutation(async ({ input }) => { await db.addInventoryHistory({ ...input, timestamp: new Date() }); return { success: true }; }),
  }),

  sync: router({
    // 上传本地数据到云端（覆盖）
    upload: publicProcedure
      .input(z.object({
        products: z.array(z.object({
          id: z.string(),
          detailImageUri: z.string(),
          overviewImageUri: z.string(),
          sku: z.string(),
          quantity: z.number(),
          storageLocation: z.string(),
          operatorId: z.number(),
          operatorName: z.string(),
          isDeleted: z.number(),
          deletedAt: z.date().nullable().optional(),
          createdAt: z.date(),
          updatedAt: z.date(),
        })),
      }))
      .mutation(async ({ input }) => {
        // 清空云端数据
        await db.clearAllProducts();
        // 批量插入本地数据
        await db.batchInsertProducts(input.products);
        return { success: true, count: input.products.length };
      }),
    
    // 从云端下载数据到本地（覆盖）
    download: publicProcedure      .query(async () => {
        const products = await db.getAllProducts();
        return { products };
      }),
    
    // 获取同步状态
    status: publicProcedure
      .query(async () => {
        const cloudCount = await db.getProductsCount();
        const lastSyncTime = await db.getLastSyncTime();
        return {
          cloudCount,
          lastSyncTime,
        };
      }),
  }),

  // AI 视觉识别 API
  ai: router({
    // 识别图片中的饰品数量
    countProducts: publicProcedure
      .input(z.object({
        imageBase64: z.string(),
      }))
      .mutation(async ({ input }) => {
        const count = await aiVision.countProductsInImage(input.imageBase64);
        return { count };
      }),

    // 对比两张图片的相似度
    compareSimilarity: publicProcedure
      .input(z.object({
        imageBase64_1: z.string(),
        imageBase64_2: z.string(),
      }))
      .mutation(async ({ input }) => {
        const result = await aiVision.compareImageSimilarity(
          input.imageBase64_1,
          input.imageBase64_2
        );
        return result;
      }),

    // 批量对比图片相似度（查重）
    batchCompare: publicProcedure
      .input(z.object({
        newImageBase64: z.string(),
        existingImages: z.array(z.object({
          id: z.string(),
          base64: z.string(),
        })),
        threshold: z.number().optional().default(90),
      }))
      .mutation(async ({ input }) => {
        const results = await aiVision.batchCompareImages(
          input.newImageBase64,
          input.existingImages,
          input.threshold
        );
        return { results };
      }),
  }),
});

export type AppRouter = typeof appRouter;
