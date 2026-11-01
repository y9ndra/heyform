import assert from 'assert'

import { redactMongoLogValue } from '../src/config/mongo'

function testRedactsNestedAndDottedSecrets() {
  assert.deepStrictEqual(
    redactMongoLogValue({
      email: 'owner@example.com',
      nested: { password: 'nested-secret' },
      'settings.password': 'form-secret',
      $set: { apiToken: 'token-secret', name: 'Form' }
    }),
    {
      email: 'owner@example.com',
      nested: { password: '******' },
      'settings.password': '******',
      $set: { apiToken: '******', name: 'Form' }
    }
  )
}

if (require.main === module) {
  testRedactsNestedAndDottedSecrets()
}
