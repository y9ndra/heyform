import assert from 'assert'

import { WEBHOOK_MAX_RESPONSE_BYTES, readLimitedWebhookResponse } from '../src/apps/webhook'

class FakeResponseStream implements AsyncIterable<Buffer> {
  destroyed = false

  constructor(private readonly chunks: Buffer[]) {}

  async *[Symbol.asyncIterator](): AsyncIterator<Buffer> {
    for (const chunk of this.chunks) {
      yield chunk
    }
  }

  destroy(): void {
    this.destroyed = true
  }
}

async function testReadsResponseWithinLimit() {
  const stream = new FakeResponseStream([Buffer.from('accepted'), Buffer.from(' response')])

  assert.strictEqual(await readLimitedWebhookResponse(stream), 'accepted response')
  assert.strictEqual(stream.destroyed, false)
}

async function testDestroysResponseAboveLimit() {
  const stream = new FakeResponseStream([
    Buffer.alloc(WEBHOOK_MAX_RESPONSE_BYTES, 0x61),
    Buffer.from('overflow')
  ])

  await assert.rejects(
    () => readLimitedWebhookResponse(stream),
    /Webhook response exceeds the 65536 byte limit/
  )
  assert.strictEqual(stream.destroyed, true)
}

async function run() {
  await testReadsResponseWithinLimit()
  await testDestroysResponseAboveLimit()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
