import { z } from "zod";

export const authInputSchema = z.object({
  nonce: z.string(),
  address: z.string(),
  signature: z.string(),
  isHardwareWallet: z.boolean().optional().default(false),
});
