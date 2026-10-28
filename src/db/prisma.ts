import { createPgliteAdapter } from "prisma-pglite";
import { PrismaClient } from "../generated/prisma/client.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let instance = globalForPrisma.prisma;

if (!instance) {
  instance = new PrismaClient({
    adapter: await createPgliteAdapter({
      directDatabaseDirPath: process.env.FCD_PGLITE_DIR,
    }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  globalForPrisma.prisma = instance;
}

export const prisma = instance;
