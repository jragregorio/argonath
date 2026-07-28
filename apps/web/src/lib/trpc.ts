import type { AppRouter } from "@warden/api/router-type";
import { createTRPCReact, type CreateTRPCReact } from "@trpc/react-query";

export const trpc: CreateTRPCReact<AppRouter, unknown> =
  createTRPCReact<AppRouter>();
