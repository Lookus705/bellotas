import { z } from "zod";

export const classifiedMessageSchema = z.object({
  intent: z.string(),
  confidence: z.number().min(0).max(1),
  entities: z.record(z.any()).default({}),
  clarificationQuestion: z.string().optional()
});

export type ClassifiedMessage = z.infer<typeof classifiedMessageSchema>;
