import assert from 'assert'

import { BullOptionsFactory } from '../src/config/bull'
import { RedisService, createRedisOptions } from '../src/config/redis'
import { REDIS_DB, REDIS_TLS } from '../src/environments'

function testRedisClientsShareTlsConfiguration() {
  const applicationOptions = new RedisService().createRedisModuleOptions() as {
    config: ReturnType<typeof createRedisOptions>
  }
  const bullOptions = BullOptionsFactory() as ReturnType<typeof BullOptionsFactory> & {
    redis: ReturnType<typeof createRedisOptions>
  }

  assert.deepStrictEqual(applicationOptions.config, createRedisOptions())
  assert.deepStrictEqual(bullOptions.redis, createRedisOptions(REDIS_DB + 1))
  assert.strictEqual('tls' in applicationOptions.config, Boolean(REDIS_TLS))
  assert.strictEqual('tls' in bullOptions.redis, Boolean(REDIS_TLS))

  if (REDIS_TLS) {
    assert.deepStrictEqual(applicationOptions.config.tls, createRedisOptions().tls)
    assert.deepStrictEqual(bullOptions.redis.tls, createRedisOptions().tls)
  }
}

function testRedisTlsJsonConfiguration() {
  const plaintextOptions = createRedisOptions(REDIS_DB, '')
  const defaultTlsOptions = createRedisOptions(REDIS_DB, '{}')
  const customTlsOptions = createRedisOptions(
    REDIS_DB,
    '{"servername":"redis.example.com","rejectUnauthorized":true}'
  )
  const fallbackTlsOptions = createRedisOptions(REDIS_DB, 'not-json')

  assert.strictEqual('tls' in plaintextOptions, false)
  assert.deepStrictEqual(defaultTlsOptions.tls, {})
  assert.deepStrictEqual(customTlsOptions.tls, {
    servername: 'redis.example.com',
    rejectUnauthorized: true
  })
  assert.deepStrictEqual(fallbackTlsOptions.tls, {})
}

if (require.main === module) {
  testRedisClientsShareTlsConfiguration()
  testRedisTlsJsonConfiguration()
}
