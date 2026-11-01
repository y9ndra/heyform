import assert from 'assert'

import { FormService } from '../src/service/form.service'
import { normalizeInvitationRecipients } from '../src/utils/invitation'
import { normalizeTranslationLanguages } from '../src/utils/translation'

function testAbuseInputsAreNormalizedAndDeduplicated() {
  assert.deepStrictEqual(
    normalizeInvitationRecipients(
      ['First@Example.com', 'first@example.com', 'second@example.com'],
      ['SECOND@example.com']
    ),
    ['first@example.com']
  )
  assert.deepStrictEqual(
    normalizeTranslationLanguages(['FR', 'fr', 'ja', 'unsupported-language']),
    ['fr', 'ja']
  )
}

async function testTranslationJobsUseUserAndTeamBudgetsAndCanRetryAfterFailure() {
  const throttles: Array<{ key: string; limit: number; ttl: string; amount: number }> = []
  const jobs: Array<{ data: Record<string, string>; options: Record<string, any> }> = []
  const service = new FormService(
    {} as any,
    {} as any,
    {
      add: async (data: Record<string, string>, options: Record<string, any>) => {
        jobs.push({ data, options })
      }
    } as any,
    {
      throttler: async (key: string, limit: number, ttl: string, amount: number) => {
        throttles.push({ key, limit, ttl, amount })
      }
    } as any
  )

  await service.addTranslateQueue('form_1', 'team_1', 'user_1', ['fr', 'ja', 'fr'])

  assert.deepStrictEqual(throttles, [
    { key: 'translate:user:user_1', limit: 50, ttl: '1h', amount: 2 },
    { key: 'translate:team:team_1', limit: 50, ttl: '1h', amount: 2 }
  ])
  assert.deepStrictEqual(
    jobs.map(job => job.options),
    [
      { jobId: 'translate:form_1:fr', removeOnFail: true },
      { jobId: 'translate:form_1:ja', removeOnFail: true }
    ]
  )
}

async function run() {
  testAbuseInputsAreNormalizedAndDeduplicated()
  await testTranslationJobsUseUserAndTeamBudgetsAndCanRetryAfterFailure()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
