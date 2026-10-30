import { ProvisionAccounts } from '../../application/use-cases/provision-accounts'
import type { PrismaClient } from '../../generated/prisma/client'
import { PrismaProvisioningStore } from '../../infrastructure/persistence/prisma/provisioning-store'
import { AesSecretBox } from '../../infrastructure/security/aes-secret-box'
import {
  BcryptPasswords,
  CryptoOpaqueTokens,
} from '../../infrastructure/security/passwords'
import type { AppConfig } from '../config/environment'

export function composeProvisioning(config: AppConfig, db: PrismaClient) {
  const store = new PrismaProvisioningStore(db)
  const passwords = new BcryptPasswords(
    config.passwordMinLength,
    config.passwordCommonListEnabled,
    config.bcryptRounds,
  )
  const tokens = new CryptoOpaqueTokens()
  const service = new ProvisionAccounts(
    store,
    passwords,
    tokens,
    new AesSecretBox(config.encryptionKey, 'notification'),
    config.inviteLinkHours,
    config.accountInactivityReviewDays,
  )
  return { store, service, passwords, tokens }
}
