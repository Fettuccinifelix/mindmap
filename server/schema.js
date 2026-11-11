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

// Generation schema constrains individual fields; cross-field box bounds are
// still validated by detectionsSchema after generation.
export const detectionOutputFormat = {
  type: "object",
  additionalProperties: false,
  required: ["notes"],
  properties: {
    notes: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "color", "x", "y", "width", "height"],
        properties: {
          text: { type: "string", maxLength: 10000 },
          color: { type: "string", enum: colors },
          x: { type: "number", minimum: 0, maximum: 1 },
          y: { type: "number", minimum: 0, maximum: 1 },
          width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
          height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        },
      },
    },
  },
};
