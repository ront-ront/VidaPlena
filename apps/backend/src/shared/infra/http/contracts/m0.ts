import { z } from 'zod'

export const idSchema = z.uuid()
export const internalRoleSchema = z.enum([
  'receptionist',
  'professional',
  'manager',
])
export const roleSchema = z.enum([
  'patient',
  'receptionist',
  'professional',
  'manager',
  'admin',
])
export const userStatusSchema = z.enum([
  'invited',
  'active',
  'locked',
  'inactive',
])

export const inviteUserBody = z
  .object({
    email: z.email().max(255),
    fullName: z.string().trim().min(1).max(255),
    role: internalRoleSchema,
  })
  .strict()

export const invitationTokenBody = z
  .object({ token: z.string().min(1).max(128) })
  .strict()
export const acceptInvitationBody = invitationTokenBody.extend({
  password: z.string().min(1).max(256),
})
export const userIdParams = z.object({ id: idSchema })
export const rolesBody = z
  .object({ roles: z.array(roleSchema).min(1).max(5) })
  .strict()
export const statusBody = z
  .object({ status: z.enum(['active', 'inactive']) })
  .strict()
export const dpoBody = z.object({ enabled: z.boolean() }).strict()

export const notificationPreferencesBody = z
  .object({
    channels: z.array(z.enum(['email', 'portal'])).max(2),
    nonEssentialOptOut: z.boolean(),
  })
  .strict()

export const cursorQuery = z.object({ cursor: idSchema.optional() })
export const userListQuery = z.object({
  role: roleSchema.optional(),
  status: userStatusSchema.optional(),
  cursor: idSchema.optional(),
})

export const loginBody = z
  .object({
    identifier: z.string().trim().min(3).max(255),
    password: z.string().min(1).max(256),
  })
  .strict()
export const mfaEnrollBody = z
  .object({ challengeId: z.string().min(1).max(128) })
  .strict()
export const mfaVerifyBody = mfaEnrollBody.extend({
  code: z.string().regex(/^\d{6}$/),
})
export const recoveryRequestBody = z
  .object({ identifier: z.string().trim().min(3).max(255) })
  .strict()
export const recoveryCompleteBody = z
  .object({
    token: z.string().min(1).max(128),
    newPassword: z.string().min(1).max(256),
  })
  .strict()
export const emailContactBody = z.object({ email: z.email().max(255) }).strict()
export const phoneContactBody = z
  .object({ userId: idSchema, phone: z.string().regex(/^\+?[0-9]{10,15}$/) })
  .strict()

export const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ field: z.string(), reason: z.string() }))
      .optional(),
    requestId: idSchema,
  }),
})
