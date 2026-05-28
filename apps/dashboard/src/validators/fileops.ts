import { z } from "zod";

export const fileListQuery = z.object({
  path: z.string().default("/"),
});

export const fileReadQuery = z.object({
  path: z.string().min(1),
});

export const fileDeleteBody = z.object({
  path: z.string().min(1),
});

export const fileMkdirBody = z.object({
  path: z.string().min(1),
});

export const fileRenameBody = z.object({
  path: z.string().min(1),
  newName: z.string().min(1),
});
