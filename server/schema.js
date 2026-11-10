import { z } from "zod";
export const colors = ["yellow", "pink", "blue", "green", "purple", "white"];
export const detectionsSchema = z.object({
  notes: z
    .array(
      z
        .object({
          text: z.string().max(10000),
          color: z.enum(colors),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().positive().max(1),
          height: z.number().positive().max(1),
        })
        .refine((n) => n.x + n.width <= 1.001 && n.y + n.height <= 1.001),
    )
    .max(200),
});
