import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { overview } = await import("./dashboard.server");
    return overview(context.supabase as never, context.userId);
  });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listDevices } = await import("./dashboard.server");
    return listDevices(context.supabase as never, context.userId);
  });

export const createPairingCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { device_name: string; sender_number?: string }) =>
    z.object({ device_name: z.string().min(1).max(80), sender_number: z.string().max(20).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createPairingCode } = await import("./dashboard.server");
    return createPairingCode(context.supabase as never, context.userId, data);
  });

export const updateDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80).optional(),
        sender_number: z.string().max(20).nullable().optional(),
        enabled: z.boolean().optional(),
        is_default: z.boolean().optional(),
        is_backup: z.boolean().optional(),
        daily_sms_limit: z.number().int().min(0).max(10000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { updateDevice } = await import("./dashboard.server");
    return updateDevice(context.supabase as never, context.userId, data);
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { deleteDevice } = await import("./dashboard.server");
    return deleteDevice(context.supabase as never, context.userId, data.id);
  });

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listApiKeys } = await import("./dashboard.server");
    return listApiKeys(context.supabase as never, context.userId);
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().min(1).max(80),
        device_id: z.string().uuid().nullable().optional(),
        expires_in_days: z.number().int().min(1).max(3650).nullable().optional(),
        requests_per_minute: z.number().int().min(1).max(10000).optional(),
        sms_per_day: z.number().int().min(1).max(10000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { createApiKey } = await import("./dashboard.server");
    return createApiKey(context.supabase as never, context.userId, data);
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { revokeApiKey } = await import("./dashboard.server");
    return revokeApiKey(context.supabase as never, context.userId, data.id);
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { rotateApiKey } = await import("./dashboard.server");
    return rotateApiKey(context.supabase as never, context.userId, data.id);
  });

export const listSmsJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number; status?: string }) =>
    z.object({ limit: z.number().int().min(1).max(200).optional(), status: z.string().max(20).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { listSmsJobs } = await import("./dashboard.server");
    return listSmsJobs(context.supabase as never, context.userId, data);
  });

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSettings } = await import("./dashboard.server");
    return getSettings(context.supabase as never, context.userId);
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sms_paused: z.boolean().optional(),
        requests_per_minute: z.number().int().min(1).max(10000).optional(),
        sms_per_hour: z.number().int().min(0).max(10000).optional(),
        sms_per_day: z.number().int().min(0).max(100000).optional(),
        allow_backup_routing: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { updateSettings } = await import("./dashboard.server");
    return updateSettings(context.supabase as never, context.userId, data);
  });
