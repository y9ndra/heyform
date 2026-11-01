import assert from 'assert'

const Module = require('module')
const originalLoad = Module._load

Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === '@config') {
    return {
      COOKIE_DEVICE_ID_NAME: 'HEYFORM_DEVICE_ID',
      COOKIE_LOGIN_IN_NAME: 'HEYFORM_LOGGED_IN',
      COOKIE_SESSION_NAME: 'HEYFORM_SESSION',
      CookieOptionsFactory: (options = {}) => options,
      SessionOptionsFactory: (options = {}) => options
    }
  }

  if (request === '@environments') {
    return {
      SESSION_KEY: 'test-session-key',
      SESSION_MAX_AGE: '15d',
      VERIFICATION_CODE_EXPIRE: '5m',
      VERIFICATION_CODE_LIMIT: 5,
      VERIFY_EMAIL_RESEND_COOLDOWN: '1m',
      VERIFY_EMAIL_RESEND_DAILY_LIMIT: 10
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

const { AuthService } = require('../src/service/auth.service')

function createAuthService() {
  const values = new Map<string, string>()
  const cookies: Record<string, string> = {}
  const cleared: string[] = []

  const redisService = {
    set: async ({ key, value }: { key: string; value: string }) => {
      values.set(key, value)
      return 'OK'
    },
    get: async (key: string) => values.get(key) || null,
    getdel: async (key: string) => {
      const value = values.get(key) || null
      values.delete(key)
      return value
    },
    del: async (key: string) => {
      values.delete(key)
      return 1
    }
  }
  const service = new AuthService({} as any, redisService as any)
  const res = {
    cookie: (key: string, value: string) => {
      cookies[key] = value
    },
    clearCookie: (key: string) => {
      cleared.push(key)
    }
  }

  return {
    service,
    values,
    cookies,
    cleared,
    res
  }
}

async function testVerifiesStoredOAuthState() {
  const { service, values, cookies, cleared, res } = createAuthService()
  const req: Record<string, any> = {
    cookies: {},
    headers: {
      'x-device-id': 'device_1'
    }
  }

  const state = await service.createOAuthState(req, res, 'device_1')

  assert.strictEqual(cookies.HEYFORM_OAUTH_STATE, state)
  assert.strictEqual(values.get(`oauth_state:${state}`), 'device_1')

  req.cookies.HEYFORM_OAUTH_STATE = state
  await service.verifyOAuthState(req, res, state)

  assert.strictEqual(values.has(`oauth_state:${state}`), false)
  assert.strictEqual(req.headers['x-device-id'], 'device_1')
  assert.strictEqual(req.cookies.HEYFORM_DEVICE_ID, 'device_1')
  assert.deepStrictEqual(cleared, ['HEYFORM_OAUTH_STATE'])
}

async function testRejectsMismatchedOAuthState() {
  const { service, res } = createAuthService()
  const req: Record<string, any> = {
    cookies: {
      HEYFORM_OAUTH_STATE: 'state_1'
    },
    headers: {}
  }

  await assert.rejects(
    async () => service.verifyOAuthState(req, res, 'state_2'),
    (error: any) => error?.message === 'Invalid OAuth state'
  )
}

async function testRejectsReplayedOAuthState() {
  const { service, res } = createAuthService()
  const req: Record<string, any> = {
    cookies: {},
    headers: {
      'x-device-id': 'device_1'
    }
  }
  const state = await service.createOAuthState(req, res, 'device_1')
  req.cookies.HEYFORM_OAUTH_STATE = state

  await service.verifyOAuthState(req, res, state)
  await assert.rejects(
    async () => service.verifyOAuthState(req, res, state),
    (error: any) => error?.message === 'Invalid OAuth state'
  )
}

async function testConcurrentOAuthStateConsumptionHasOneWinner() {
  const { service, res } = createAuthService()
  const initialReq: Record<string, any> = {
    cookies: {},
    headers: {
      'x-device-id': 'device_1'
    }
  }
  const state = await service.createOAuthState(initialReq, res, 'device_1')
  const createCallbackRequest = () => ({
    cookies: { HEYFORM_OAUTH_STATE: state },
    headers: {}
  })

  const results = await Promise.allSettled([
    service.verifyOAuthState(createCallbackRequest(), res, state),
    service.verifyOAuthState(createCallbackRequest(), res, state)
  ])

  assert.strictEqual(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.strictEqual(results.filter(result => result.status === 'rejected').length, 1)
}

async function testOAuthTransactionIsBoundToStateAndConsumedOnce() {
  const { service, values } = createAuthService()
  const transaction = {
    codeVerifier: 'verifier_1',
    nonce: 'nonce_1'
  }

  await service.storeOAuthTransaction('state_1', transaction)

  assert.deepStrictEqual(JSON.parse(values.get('oauth_transaction:state_1')!), transaction)
  assert.deepStrictEqual(await service.consumeOAuthTransaction('state_1'), transaction)
  assert.strictEqual(values.has('oauth_transaction:state_1'), false)

  await assert.rejects(
    async () => service.consumeOAuthTransaction('state_1'),
    (error: any) => error?.message === 'Invalid OAuth transaction'
  )
}

async function testRejectsIncompleteOAuthTransactions() {
  const { service, values } = createAuthService()

  await assert.rejects(
    async () => service.storeOAuthTransaction('state_1', { codeVerifier: '', nonce: 'nonce_1' }),
    (error: any) => error?.message === 'Invalid OAuth transaction'
  )
  await assert.rejects(
    async () => service.storeOAuthTransaction('state_1', { codeVerifier: 'verifier_1', nonce: '' }),
    (error: any) => error?.message === 'Invalid OAuth transaction'
  )

  values.set('oauth_transaction:state_2', JSON.stringify({ codeVerifier: 'verifier_2' }))
  await assert.rejects(
    async () => service.consumeOAuthTransaction('state_2'),
    (error: any) => error?.message === 'Invalid OAuth transaction'
  )
  assert.strictEqual(values.has('oauth_transaction:state_2'), false)
}

async function run() {
  await testVerifiesStoredOAuthState()
  await testRejectsMismatchedOAuthState()
  await testRejectsReplayedOAuthState()
  await testConcurrentOAuthStateConsumptionHasOneWinner()
  await testOAuthTransactionIsBoundToStateAndConsumedOnce()
  await testRejectsIncompleteOAuthTransactions()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
