import { z } from "zod";

/** Path param: a single group id. */
export const groupIdParamSchema = z.object({
  groupId: z.string().uuid("groupId must be a valid id."),
});

/** Path params: a group id + a member's user id. */
export const groupMemberParamSchema = z.object({
  groupId: z.string().uuid("groupId must be a valid id."),
  userId: z.string().uuid("userId must be a valid id."),
});

/** POST /api/v1/groups body. */
export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required.")
    .max(100, "name must be 100 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(500, "description must be 500 characters or fewer.")
    .optional(),
});

/**
 * POST /api/v1/groups/:groupId/members body.
 *
 * V1 lookup for an existing user: by `userId` or by verified `phone`
 * — exactly one, not both, not neither.
 */
export const addMemberSchema = z
  .object({
    userId: z.string().uuid("userId must be a valid id.").optional(),
    phone: z.string().trim().min(1, "phone must not be empty.").optional(),
  })
  .refine((value) => Boolean(value.userId) !== Boolean(value.phone), {
    message: "Provide exactly one of userId or phone.",
  });
