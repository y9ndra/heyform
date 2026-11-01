import assert from 'assert'
import bcrypt from 'bcrypt'

import { LoginResolver, loginAttemptKey } from '../src/resolver/auth/login.resolver'
import { SendResetPasswordEmailResolver } from '../src/resolver/auth/send-reset-password-email.resolver'
import { UpdateEmailResolver } from '../src/resolver/user/update-email.resolver'
import { AuthService } from '../src/service/auth.service'

async function testVerificationCodesAreConsumedAtomically() {
  const codes = new Map<string, string>([
    ['verify_email:user_1:123456', String(Date.now() + 60_000)]
  ])
  let hgetCalls = 0
  let hgetdelCalls = 0
  const redisService = {
    hget: async () => {
      hgetCalls += 1
      return null
    },
    hgetdel: async ({ key, field }: { key: string; field: string }) => {
      hgetdelCalls += 1
      const mapKey = `${key}:${field}`
      const value = codes.get(mapKey) || null
      codes.delete(mapKey)
      return value
    }
  }
  const service = new AuthService({} as any, redisService as any)

  await service.checkVerificationCode('verify_email:user_1', '123456')
  await assert.rejects(
    () => service.checkVerificationCode('verify_email:user_1', '123456'),
    /Invalid verification code/
  )

  assert.strictEqual(hgetCalls, 0)
  assert.strictEqual(hgetdelCalls, 2)
}

async function testConcurrentAttemptsReserveSlotsBeforeCredentialChecks() {
  let count = 0
  let checks = 0
  const service = new AuthService(
    {} as any,
    {
      incrementWithExpiry: async () => {
        count += 1
        return count
      }
    } as any
  )

  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      service.attemptsCheck('limit:login:user_1', async () => {
        checks += 1
        throw new Error('bad credential')
      })
    )
  )

  assert.strictEqual(checks, 5)
  assert.strictEqual(results.filter(result => result.status === 'rejected').length, 20)
}

async function testLoginAttemptsAreScopedToTrustedSourceAndClearedOnSuccess() {
  const first = loginAttemptKey('user_1', { ip: '203.0.113.10', deviceId: 'device_1' } as any)
  const second = loginAttemptKey('user_1', { ip: '203.0.113.11', deviceId: 'device_1' } as any)
  assert.notStrictEqual(first, second)
  assert.strictEqual(first.includes('203.0.113.10'), false)

  const password = 'StrongPassword1!'
  const passwordHash = await bcrypt.hash(password, 4)
  let checkedKey: string | undefined
  let clearedKey: string | undefined
  const authService = {
    attemptsCheck: async (key: string, check: () => Promise<void>) => {
      checkedKey = key
      await check()
    },
    clearAttempts: async (key: string) => {
      clearedKey = key
    },
    devices: async () => ['device_1'],
    createUserActivity: async () => ({}),
    login: async () => undefined
  }
  const resolver = new LoginResolver(
    authService as any,
    {
      findByEmail: async () => ({
        id: 'user_1',
        email: 'user@example.com',
        password: passwordHash
      })
    } as any,
    { userSecurityAlert: () => undefined } as any
  )
  const client = {
    deviceId: 'device_1',
    ip: '203.0.113.10',
    lang: 'en',
    userAgent: {
      browser: { name: 'Browser' },
      os: { name: 'OS' }
    }
  } as any

  await resolver.login(client, {}, {}, { email: 'user@example.com', password })

  assert.strictEqual(checkedKey, first)
  assert.strictEqual(clearedKey, first)
}

async function testResetEmailDoesNotRevealWhetherAccountExists() {
  let mailCount = 0
  let codeCount = 0
  const resolver = new SendResetPasswordEmailResolver(
    {
      emailVerificationRequest: () => {
        mailCount += 1
      }
    } as any,
    {
      findByEmail: async (email: string) =>
        email === 'exists@example.com' ? { id: 'user_1', email, lang: 'en' } : null
    } as any,
    {
      getVerificationCodeWithRateLimit: async () => {
        codeCount += 1
        return '123456'
      }
    } as any
  )

  assert.strictEqual(await resolver.sendResetPasswordEmail({ email: 'missing@example.com' }), true)
  assert.strictEqual(await resolver.sendResetPasswordEmail({ email: 'exists@example.com' }), true)
  assert.strictEqual(codeCount, 1)
  assert.strictEqual(mailCount, 1)
}

async function testEmailChangeRequiresPasswordAndInvalidatesSessions() {
  const password = 'CurrentPassword1!'
  const user = {
    id: 'user_1',
    email: 'old@example.com',
    password: await bcrypt.hash(password, 4)
  }
  let verificationChecks = 0
  let updates = 0
  let invalidations = 0
  const resolver = new UpdateEmailResolver(
    {
      attemptsCheck: async (_key: string, check: () => Promise<void>) => check(),
      checkVerificationCode: async () => {
        verificationChecks += 1
      },
      invalidateSessions: async (userId: string) => {
        assert.strictEqual(userId, user.id)
        invalidations += 1
      }
    } as any,
    {
      findByEmail: async () => null,
      update: async (userId: string, updatesToApply: Record<string, any>) => {
        assert.strictEqual(userId, user.id)
        assert.deepStrictEqual(updatesToApply, {
          email: 'new@example.com',
          isEmailVerified: true
        })
        updates += 1
        return true
      }
    } as any
  )

  await assert.rejects(
    () =>
      resolver.updateEmail(user as any, {
        email: 'new@example.com',
        code: '123456',
        currentPassword: 'WrongPassword1!'
      }),
    /The password does not match/
  )
  assert.strictEqual(verificationChecks, 0)
  assert.strictEqual(updates, 0)
  assert.strictEqual(invalidations, 0)

  assert.strictEqual(
    await resolver.updateEmail(user as any, {
      email: 'new@example.com',
      code: '123456',
      currentPassword: password
    }),
    true
  )
  assert.strictEqual(verificationChecks, 1)
  assert.strictEqual(updates, 1)
  assert.strictEqual(invalidations, 1)
}

async function run() {
  await testVerificationCodesAreConsumedAtomically()
  await testConcurrentAttemptsReserveSlotsBeforeCredentialChecks()
  await testLoginAttemptsAreScopedToTrustedSourceAndClearedOnSuccess()
  await testResetEmailDoesNotRevealWhetherAccountExists()
  await testEmailChangeRequiresPasswordAndInvalidatesSessions()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
