import assert from 'assert'

import { SubmissionService } from '../src/service/submission.service'

async function testConcurrentCreatesCannotExceedQuota() {
  const submissions: Array<Record<string, any>> = []
  const model = {
    countDocuments: async ({ formId }: { formId: string }) =>
      submissions.filter(submission => submission.formId === formId).length,
    create: async (submission: Record<string, any>) => {
      await new Promise(resolve => setTimeout(resolve, 1))
      submissions.push(submission)
      return { id: `submission_${submissions.length}` }
    }
  }
  let tail = Promise.resolve()
  const redisService = {
    withLock: async (_key: string, _ttl: string, callback: () => Promise<unknown>) => {
      const previous = tail
      let release!: () => void
      tail = new Promise<void>(resolve => {
        release = resolve
      })
      await previous

      try {
        return await callback()
      } finally {
        release()
      }
    }
  }
  const service = new SubmissionService(model as any, {} as any, redisService as any)

  const results = await Promise.allSettled(
    Array.from({ length: 20 }, (_, index) =>
      service.createWithinQuota({ formId: 'form_1', value: index }, 5)
    )
  )

  assert.strictEqual(results.filter(result => result.status === 'fulfilled').length, 5)
  assert.strictEqual(results.filter(result => result.status === 'rejected').length, 15)
  assert.strictEqual(submissions.length, 5)
}

async function run() {
  await testConcurrentCreatesCannotExceedQuota()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
