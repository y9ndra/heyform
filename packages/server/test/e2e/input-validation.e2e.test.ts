import assert from 'assert'

import { E2EClient } from './helpers/client'
import { SignedUpUser, signUpUser } from './helpers/fixtures'
import {
  CREATE_FORM_GQL,
  CREATE_PROJECT_GQL,
  CREATE_TEAM_GQL,
  FORMS_GQL,
  FORM_DETAIL_GQL,
  SIGN_UP_GQL,
  SUBMISSIONS_GQL,
  TEAMS_GQL,
  UPDATE_SUBMISSIONS_CATEGORY_GQL,
  UPDATE_TEAM_GQL
} from './helpers/gql'
import { strongPassword, uniqueEmail, uniqueName } from './helpers/random'
import { defineSuite } from './helpers/runner'

/**
 * Input-validation suite. Probes class-validator decorators and the
 * @Field nullability declared on each input type. Each test issues a
 * single GraphQL call with a deliberately bad payload and asserts the
 * server returned an error (no successful data).
 */
export function build(baseUrl: string) {
  const { suite, test } = defineSuite('input validation')
  let user: SignedUpUser
  let teamId: string
  let projectId: string
  let formId: string

  test('setup: one auth user + workspace+project+form', async () => {
    user = await signUpUser(baseUrl, { name: uniqueName('Validator') })
    teamId = await user.client.gqlOk<string>('createTeam', CREATE_TEAM_GQL, {
      input: { name: uniqueName('Validation WS'), projectName: uniqueName('Seed') }
    })
    const teams = await user.client.gqlOk<any[]>('teams', TEAMS_GQL)
    const team = teams.find(t => t.id === teamId)
    projectId = team.projects[0].id
    formId = await user.client.gqlOk<string>('createForm', CREATE_FORM_GQL, {
      input: { projectId, name: uniqueName('Form'), interactiveMode: 1, kind: 1 }
    })
  })

  // ── Sign-up & auth ───────────────────────────────────────────────────────
  test('signUp rejects weak password (< 8 chars / missing classes)', async () => {
    const c = new E2EClient({ baseUrl })
    const res = await c.gql('signUp', SIGN_UP_GQL, {
      input: { name: uniqueName(), email: uniqueEmail(), password: 'short' }
    })
    assert.ok(res.errors.length > 0, 'weak password must error')
  })

  test('signUp rejects malformed email', async () => {
    const c = new E2EClient({ baseUrl })
    const res = await c.gql('signUp', SIGN_UP_GQL, {
      input: { name: uniqueName(), email: 'not-an-email', password: strongPassword() }
    })
    assert.ok(res.errors.length > 0, 'malformed email must error')
  })

  test('signUp rejects empty name', async () => {
    const c = new E2EClient({ baseUrl })
    const res = await c.gql('signUp', SIGN_UP_GQL, {
      input: { name: '', email: uniqueEmail(), password: strongPassword() }
    })
    assert.ok(res.errors.length > 0, 'empty name must error')
  })

  // ── Team / Workspace ─────────────────────────────────────────────────────
  test('createTeam rejects empty name', async () => {
    const res = await user.client.gql('createTeam', CREATE_TEAM_GQL, {
      input: { name: '', projectName: uniqueName('P') }
    })
    assert.ok(res.errors.length > 0, 'empty team name must error')
  })

  test('createTeam rejects name longer than 30 chars', async () => {
    const res = await user.client.gql('createTeam', CREATE_TEAM_GQL, {
      input: { name: 'x'.repeat(31), projectName: uniqueName('P') }
    })
    assert.ok(res.errors.length > 0, 'oversize team name must error')
  })

  test('updateTeam rejects name longer than 30 chars', async () => {
    const res = await user.client.gql('updateTeam', UPDATE_TEAM_GQL, {
      input: { teamId, name: 'y'.repeat(31) }
    })
    assert.ok(res.errors.length > 0)
  })

  test('updateTeam rejects malformed avatar URL', async () => {
    const res = await user.client.gql('updateTeam', UPDATE_TEAM_GQL, {
      input: { teamId, avatar: 'not://a real:::url' }
    })
    assert.ok(res.errors.length > 0)
  })

  // (UpdateUserInput.avatar has no @IsUrl validator server-side — anything
  //  is accepted. Documented here so we don't grow a flaky test for it.)

  // ── Project ──────────────────────────────────────────────────────────────
  test('createProject rejects missing teamId', async () => {
    const res = await user.client.gql('createProject', CREATE_PROJECT_GQL, {
      input: { name: uniqueName('Lost Project') }
    })
    assert.ok(res.errors.length > 0, 'missing required teamId must error')
  })

  test('createProject rejects unknown teamId', async () => {
    const res = await user.client.gql('createProject', CREATE_PROJECT_GQL, {
      input: { teamId: 'not-a-real-team', name: uniqueName('Phantom') }
    })
    assert.ok(res.errors.length > 0, 'creating under an unknown team must error')
  })

  // ── Form ─────────────────────────────────────────────────────────────────
  test('createForm rejects invalid interactiveMode enum', async () => {
    const res = await user.client.gql('createForm', CREATE_FORM_GQL, {
      input: { projectId, name: uniqueName('Bad'), interactiveMode: 99, kind: 1 }
    })
    assert.ok(res.errors.length > 0, 'bad interactiveMode enum must error')
  })

  test('createForm rejects invalid kind enum', async () => {
    const res = await user.client.gql('createForm', CREATE_FORM_GQL, {
      input: { projectId, name: uniqueName('Bad'), interactiveMode: 1, kind: 99 }
    })
    assert.ok(res.errors.length > 0, 'bad kind enum must error')
  })

  test('createForm rejects missing required projectId', async () => {
    const res = await user.client.gql('createForm', CREATE_FORM_GQL, {
      input: { name: uniqueName('No proj'), interactiveMode: 1, kind: 1 }
    })
    assert.ok(res.errors.length > 0)
  })

  test('formDetail rejects malformed formId (non-existent)', async () => {
    const res = await user.client.gql('formDetail', FORM_DETAIL_GQL, {
      input: { formId: 'definitely-not-a-form-id' }
    })
    assert.ok(res.errors.length > 0)
  })

  test('forms rejects invalid status enum', async () => {
    const res = await user.client.gql('forms', FORMS_GQL, {
      input: { projectId, status: 99 }
    })
    assert.ok(res.errors.length > 0)
  })

  // ── Submission ───────────────────────────────────────────────────────────
  test('submissions rejects invalid category enum', async () => {
    const res = await user.client.gql('submissions', SUBMISSIONS_GQL, {
      input: { formId, category: 'not-a-real-bucket', page: 1, limit: 30 }
    })
    assert.ok(res.errors.length > 0)
  })

  test('updateSubmissionsCategory rejects invalid category enum', async () => {
    const res = await user.client.gql(
      'updateSubmissionsCategory',
      UPDATE_SUBMISSIONS_CATEGORY_GQL,
      { input: { formId, submissionIds: ['anything'], category: 'made-up' } }
    )
    assert.ok(res.errors.length > 0)
  })

  return suite
}
