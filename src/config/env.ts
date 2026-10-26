
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required.")
    .url("DATABASE_URL must be a valid connection URL."),
  DEV_GUILD_ID: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("\n[Environment] ✗ Environment validation failed:");

  for (const issue of result.error.issues) {
    console.error(
      `  • ${issue.path.join(".")}: ${issue.message}`,
    );
  }

  throw new Error("Invalid environment configuration.");
}

export const env = result.data;
