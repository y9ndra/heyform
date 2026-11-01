import assert from 'assert'

import { E2EClient } from './helpers/client'
import { signUpUser } from './helpers/fixtures'
import { LOGIN_GQL, SEND_RESET_EMAIL_GQL } from './helpers/gql'
import { defineSuite } from './helpers/runner'

/**
 * Rate-limit & throttling suite — runs LAST in `run.ts` because:
 *  - it deliberately burns the per-user attempt counters (5 wrong logins ⇒
 *    15-min cooldown), so earlier suites that re-use the same user would
 *    flake;
 *  - the verification-code cooldown (60s) is independent per user but it's
 *    polite to keep all the timing-sensitive checks bundled together.
 *
 * Every test creates its own user so it never shares counters with another.
 */
export function build(baseUrl: string) {
  const { suite, test } = defineSuite('rate limit')

  // ── Login attempt lockout (5 wrong / 15-min window) ──────────────────────
  test('login locks the user out after 5 failed attempts', async () => {
    const user = await signUpUser(baseUrl)
    const attacker = new E2EClient({ baseUrl })

    for (let i = 0; i < 5; i++) {
      const res = await attacker.gql('login', LOGIN_GQL, {
        input: { email: user.email, password: 'WrongPass1!' }
      })
      assert.ok(res.errors.length > 0, `attempt ${i + 1} should error (wrong password)`)
      assert.match(
        res.errors[0].message,
        /incorrect email or password/i,
        `attempt ${i + 1} expected an auth error, got: ${res.errors[0].message}`
      )
    }

    // Sixth attempt — even with the CORRECT password — should now be locked.
    const blocked = await attacker.gql('login', LOGIN_GQL, {
      input: { email: user.email, password: user.password }
    })
    assert.ok(blocked.errors.length > 0)
    assert.match(
      blocked.errors[0].message,
      /limit exceeded|try again later/i,
      `expected rate-limit error after 5 failures, got: ${blocked.errors[0].message}`
    )
  })

  // ── sendResetPasswordEmail cooldown (60s per user) ───────────────────────
  test('sendResetPasswordEmail enforces a per-user cooldown', async () => {
    const user = await signUpUser(baseUrl)
    const c = new E2EClient({ baseUrl })

    // First send succeeds and stamps a cooldown key in Redis.
    const first = await c.gqlOk<boolean>('sendResetPasswordEmail', SEND_RESET_EMAIL_GQL, {
      input: { email: user.email }
    })
    assert.strictEqual(first, true)

    // Second send within the cooldown window must error with the
    // "Please wait N seconds" message.
    const second = await c.gql('sendResetPasswordEmail', SEND_RESET_EMAIL_GQL, {
      input: { email: user.email }
    })
    assert.ok(second.errors.length > 0)
    assert.match(
      second.errors[0].message,
      /wait \d+ second|too many code emails/i,
      `expected cooldown error, got: ${second.errors[0].message}`
    )
  })

  // Note: signUp/login DeviceId throttling and the per-device throttle on
  // sendResetPasswordEmail (5/hour) are intentionally not exercised here
  // — the suite would have to burn a full device for each one and the
  // value-to-cost ratio is poor. Add when needed; until then we trust
  // the @Throttle decorators are configured.
  test('rate-limit suite acknowledged (placeholder for future device-level checks)', async () => {
    assert.ok(true)
  })

  return suite
}
