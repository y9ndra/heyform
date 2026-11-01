import assert from 'assert'

import { ConnectStripeResolver } from '../src/resolver/payment/connect-stripe.resolver'
import { RevokeStripeAccountResolver } from '../src/resolver/payment/revoke-stripe-account.resolver'
import { StripeAuthorizeUrlResolver } from '../src/resolver/payment/stripe-authorize-url.resolver'

const permissionError = /You don't have permission to connect a Stripe account/

async function testStripeManagementRequiresWorkspaceOwner() {
  let redisWrites = 0
  let stripeCalls = 0
  let formUpdates = 0
  const authorizeResolver = new StripeAuthorizeUrlResolver(
    {
      getAuthorizeUrl: () => {
        stripeCalls += 1
        return 'https://connect.stripe.example/authorize'
      }
    } as any,
    {
      set: async () => {
        redisWrites += 1
      }
    } as any
  )
  const connectResolver = new ConnectStripeResolver(
    {
      getConnectAccount: async () => {
        stripeCalls += 1
        return { accountId: 'acct_1' }
      }
    } as any,
    {
      update: async () => {
        formUpdates += 1
        return true
      }
    } as any,
    {
      get: async () => 'form_1',
      del: async () => undefined
    } as any
  )
  const revokeResolver = new RevokeStripeAccountResolver({
    update: async () => {
      formUpdates += 1
      return true
    }
  } as any)
  const member = { isOwner: false } as any

  await assert.rejects(
    () =>
      authorizeResolver.stripeAuthorizeUrl({ email: 'member@example.com' } as any, member, {
        formId: 'form_1'
      }),
    permissionError
  )
  await assert.rejects(
    () =>
      connectResolver.connectStripe(member, {
        formId: 'form_1',
        state: 'state_1',
        code: 'code_1'
      }),
    permissionError
  )
  await assert.rejects(
    () => revokeResolver.revokeStripeAccount(member, { formId: 'form_1' }),
    permissionError
  )

  assert.strictEqual(redisWrites, 0)
  assert.strictEqual(stripeCalls, 0)
  assert.strictEqual(formUpdates, 0)
}

async function testWorkspaceOwnerCanManageStripeDestination() {
  let unsetUpdate: Record<string, any> | undefined
  const authorizeResolver = new StripeAuthorizeUrlResolver(
    { getAuthorizeUrl: () => 'https://connect.stripe.example/authorize' } as any,
    { set: async () => undefined } as any
  )
  const revokeResolver = new RevokeStripeAccountResolver({
    update: async (_formId: string, update: Record<string, any>) => {
      unsetUpdate = update
      return true
    }
  } as any)
  const owner = { isOwner: true } as any

  assert.strictEqual(
    await authorizeResolver.stripeAuthorizeUrl({ email: 'owner@example.com' } as any, owner, {
      formId: 'form_1'
    }),
    'https://connect.stripe.example/authorize'
  )
  assert.strictEqual(await revokeResolver.revokeStripeAccount(owner, { formId: 'form_1' }), true)
  assert.deepStrictEqual(unsetUpdate, {
    $unset: {
      stripeAccount: 1
    }
  })
}

async function run() {
  await testStripeManagementRequiresWorkspaceOwner()
  await testWorkspaceOwnerCanManageStripeDestination()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
