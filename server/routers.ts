import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

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
    getAll: protectedProcedure.query(async () => await db.getAllProducts()),
    getActive: protectedProcedure.query(async () => await db.getActiveProducts()),
    getDeleted: protectedProcedure.query(async () => await db.getDeletedProducts()),
    getById: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => await db.getProductById(input.id)),
    search: protectedProcedure.input(z.object({ sku: z.string() })).query(async ({ input }) => await db.searchProductsBySku(input.sku)),
    create: protectedProcedure.input(z.object({ id: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), sku: z.string(), quantity: z.number(), storageLocation: z.string(), operatorId: z.number(), operatorName: z.string() })).mutation(async ({ input }) => await db.createProduct({ ...input, isDeleted: 0, deletedAt: null, createdAt: new Date(), updatedAt: new Date() })),
    update: protectedProcedure.input(z.object({ id: z.string(), sku: z.string().optional(), quantity: z.number().optional(), storageLocation: z.string().optional() })).mutation(async ({ input }) => { const { id, ...data } = input; await db.updateProduct(id, data); return { success: true }; }),
    softDelete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.softDeleteProduct(input.id); return { success: true }; }),
    restore: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.restoreProduct(input.id); return { success: true }; }),
    permanentDelete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => { await db.permanentDeleteProduct(input.id); return { success: true }; }),
    cleanupOld: protectedProcedure.mutation(async () => { const count = await db.cleanupOldDeletedProducts(); return { count }; }),
    merge: protectedProcedure.input(z.object({ existingProductId: z.string(), quantity: z.number(), location: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), operatorId: z.number(), operatorName: z.string() })).mutation(async ({ input }) => { const { existingProductId, ...newEntry } = input; await db.mergeProduct(existingProductId, newEntry); return { success: true }; }),
    getHistory: protectedProcedure.input(z.object({ productId: z.string() })).query(async ({ input }) => await db.getProductHistory(input.productId)),
    addHistory: protectedProcedure.input(z.object({ id: z.string(), productId: z.string(), operatorId: z.number(), operatorName: z.string(), quantity: z.number(), location: z.string(), detailImageUri: z.string(), overviewImageUri: z.string(), notes: z.string().optional() })).mutation(async ({ input }) => { await db.addInventoryHistory({ ...input, timestamp: new Date() }); return { success: true }; }),
  }),

  sync: router({
    // 上传本地数据到云端（覆盖）
    upload: protectedProcedure
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
    
    // 下载云端数据到本地（覆盖）
    download: protectedProcedure
      .query(async () => {
        const products = await db.getAllProducts();
        return { products };
      }),
    
    // 获取同步状态
    status: protectedProcedure
      .query(async () => {
        const cloudCount = await db.getProductsCount();
        const lastSyncTime = await db.getLastSyncTime();
        return {
          cloudCount,
          lastSyncTime,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
