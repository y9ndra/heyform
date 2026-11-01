import assert from 'assert'

import { E2EClient } from './helpers/client'
import { signUpUser } from './helpers/fixtures'
import { APPS_GQL, TEMPLATES_GQL } from './helpers/gql'
import { defineSuite } from './helpers/runner'

export function build(baseUrl: string) {
  const { suite, test } = defineSuite('catalog')

  test('apps query is public and returns the integration list', async () => {
    // No @Auth on AppsResolver — but we still need a device id, which a fresh
    // E2EClient supplies.
    const anon = new E2EClient({ baseUrl })
    const apps = await anon.gqlOk<any[]>('apps', APPS_GQL)
    assert.ok(Array.isArray(apps), 'apps returns an array')
    // The catalog is static-seeded; we don't assert specific names so the
    // suite stays resilient to seed-list changes. Just ensure the shape is right.
    for (const app of apps) {
      assert.ok(typeof app.id === 'string' && app.id.length > 0)
      assert.ok(typeof app.name === 'string' && app.name.length > 0)
    }
  })

  test('templates query returns an array for authenticated users', async () => {
    const user = await signUpUser(baseUrl)
    const templates = await user.client.gqlOk<any[]>('templates', TEMPLATES_GQL)
    assert.ok(Array.isArray(templates), 'templates returns an array (may be empty)')
  })

  test('templates query requires authentication', async () => {
    const anon = new E2EClient({ baseUrl })
    const result = await anon.gql('templates', TEMPLATES_GQL)
    assert.ok(result.errors.length > 0, 'unauthenticated templates query must fail')
  })

  return suite
}
