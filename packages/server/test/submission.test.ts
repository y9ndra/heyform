import assert from 'assert'

import { normalizeSubmissionHiddenFields } from '../src/utils/submission'

function testNormalizesHiddenFieldsAgainstFormDefinitions() {
  const result = normalizeSubmissionHiddenFields(
    [
      { id: 'h1', name: 'campaign' },
      { id: 'h2', name: 'source' }
    ],
    [
      { id: 'evil', name: 'admin', value: '1' },
      { id: 'h1', name: 'attacker_name', value: 'spring' },
      { id: 'client_supplied', name: 'source', value: 'newsletter' },
      { id: 'h1', name: 'campaign', value: 'duplicate' }
    ]
  )

  assert.deepStrictEqual(result, [
    { id: 'h1', name: 'campaign', value: 'spring' },
    { id: 'h2', name: 'source', value: 'newsletter' }
  ])
}

function run() {
  testNormalizesHiddenFieldsAgainstFormDefinitions()
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  }
}
