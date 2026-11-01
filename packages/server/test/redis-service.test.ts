import assert from 'assert'

import { RedisService } from '../src/service/redis.service'

async function testRateLimitUsesAtomicRedisScript() {
  const calls: unknown[][] = []
  const redis = {
    eval: async (...args: unknown[]) => {
      calls.push(args)
      return [20, 3_599]
    }
  }
  const service = new RedisService(redis as any)

  await service.throttler('ai:user:user-1', 20, '1h')

  assert.strictEqual(calls.length, 1)
  assert.ok(String(calls[0][0]).includes("redis.call('INCRBY', KEYS[1], ARGV[2])"))
  assert.ok(String(calls[0][0]).includes("redis.call('EXPIRE', KEYS[1], ARGV[1])"))
  assert.deepStrictEqual(calls[0].slice(1), [1, 'ai:user:user-1', 3_600, 1])
}

async function testRateLimitReturnsHttp429() {
  const service = new RedisService({
    eval: async () => [21, 3_500]
  } as any)

  await assert.rejects(
    () => service.throttler('ai:user:user-1', 20, '1h'),
    (error: any) => {
      assert.strictEqual(error.getStatus(), 429)
      assert.match(error.message, /3500 seconds/)
      return true
    }
  )
}

async function testWeightedRateLimitCountsEveryUnit() {
  const calls: unknown[][] = []
  const service = new RedisService({
    eval: async (...args: unknown[]) => {
      calls.push(args)
      return [20, 3_600]
    }
  } as any)

  await service.throttler('invite-member:team:team_1', 100, '1h', 20)
  assert.deepStrictEqual(calls[0].slice(1), [1, 'invite-member:team:team_1', 3_600, 20])
}

async function testLockUsesOwnedRelease() {
  const evalCalls: unknown[][] = []
  const service = new RedisService({
    set: async () => 'OK',
    eval: async (...args: unknown[]) => {
      evalCalls.push(args)
      return 1
    }
  } as any)

  assert.strictEqual(await service.withLock('quota:form_1', '30s', async () => 'done'), 'done')
  assert.strictEqual(evalCalls.length, 1)
  assert.ok(String(evalCalls[0][0]).includes("redis.call('GET', KEYS[1]) == ARGV[1]"))
}

async function testLockLeaseIsRenewedDuringLongCallbacks() {
  const evalCalls: unknown[][] = []
  const service = new RedisService({
    set: async () => 'OK',
    eval: async (...args: unknown[]) => {
      evalCalls.push(args)
      return 1
    }
  } as any)

  await service.withLock('quota:form_1', '1s', async () => {
    await new Promise(resolve => setTimeout(resolve, 450))
  })

  assert.ok(
    evalCalls.some(call =>
      String(call[0]).includes("return redis.call('EXPIRE', KEYS[1], ARGV[2])")
    )
  )
  assert.ok(evalCalls.some(call => String(call[0]).includes("return redis.call('DEL', KEYS[1])")))
}

async function run() {
  await testRateLimitUsesAtomicRedisScript()
  await testRateLimitReturnsHttp429()
  await testWeightedRateLimitCountsEveryUnit()
  await testLockUsesOwnedRelease()
  await testLockLeaseIsRenewedDuringLongCallbacks()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
