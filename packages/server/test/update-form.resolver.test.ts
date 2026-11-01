import assert from 'assert'
import bcrypt from 'bcrypt'

import { UpdateFormResolver } from '../src/resolver/form/update-form.resolver'

function createResolver() {
  let updates: Record<string, any> | undefined
  let translateQueueArgs: Array<{
    formId: string
    teamId: string
    userId: string
    languages: string[]
  }> = []

  const formService = {
    update: async (_formId: string, payload: Record<string, any>) => {
      updates = payload
      return true
    },
    addTranslateQueue: (formId: string, teamId: string, userId: string, languages: string[]) => {
      translateQueueArgs.push({ formId, teamId, userId, languages })
    }
  }
  const resolver = new UpdateFormResolver(formService as any)

  return {
    resolver,
    getUpdates: () => updates,
    getTranslateQueueArgs: () => translateQueueArgs
  }
}

const TEST_USER = { id: 'user_1' }

async function testPersistsEmptyLanguagesArray() {
  const { resolver, getUpdates, getTranslateQueueArgs } = createResolver()

  await resolver.updateForm(
    {
      settings: {
        languages: ['fr', 'ja']
      }
    } as any,
    TEST_USER as any,
    {
      formId: 'form_1',
      languages: []
    } as any
  )

  assert.deepStrictEqual(getUpdates()?.['settings.languages'], [])
  assert.strictEqual(getTranslateQueueArgs().length, 0)
}

async function testOmitsLanguagesWhenInputIsNotArray() {
  const { resolver, getUpdates } = createResolver()

  await resolver.updateForm(
    {
      settings: {
        languages: ['fr']
      }
    } as any,
    TEST_USER as any,
    {
      formId: 'form_2'
    } as any
  )

  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(getUpdates() || {}, 'settings.languages'),
    false
  )
}

async function testNullLanguagesResetsToEmptyArray() {
  const { resolver, getUpdates } = createResolver()

  await resolver.updateForm(
    {
      settings: {
        languages: ['fr']
      }
    } as any,
    TEST_USER as any,
    {
      formId: 'form_3',
      languages: null
    } as any
  )

  assert.deepStrictEqual(getUpdates()?.['settings.languages'], [])
}

async function testAllowArchiveFalseOnlyUpdatesSettings() {
  const { resolver, getUpdates } = createResolver()

  await resolver.updateForm(
    {
      settings: {
        allowArchive: true
      }
    } as any,
    TEST_USER as any,
    {
      formId: 'form_4',
      name: 'Renamed Form',
      allowArchive: false
    } as any
  )

  assert.strictEqual(getUpdates()?.name, 'Renamed Form')
  assert.strictEqual(getUpdates()?.['settings.allowArchive'], false)
}

async function testQueuesOnlyNewSupportedLanguages() {
  const { resolver, getUpdates, getTranslateQueueArgs } = createResolver()

  await resolver.updateForm(
    {
      teamId: 'team_1',
      settings: { languages: ['fr'] }
    } as any,
    TEST_USER as any,
    {
      formId: 'form_5',
      languages: ['fr', 'ja', 'ja', 'not-supported']
    } as any
  )

  assert.deepStrictEqual(getUpdates()?.['settings.languages'], ['fr', 'ja'])
  assert.deepStrictEqual(getTranslateQueueArgs(), [
    { formId: 'form_5', teamId: 'team_1', userId: 'user_1', languages: ['ja'] }
  ])
}

async function testHashesFormPasswordBeforePersistence() {
  const { resolver, getUpdates } = createResolver()

  await resolver.updateForm(
    { settings: {} } as any,
    TEST_USER as any,
    { formId: 'form_6', password: 'FormSecret123!' } as any
  )

  const stored = getUpdates()?.['settings.password']
  assert.notStrictEqual(stored, 'FormSecret123!')
  assert.strictEqual(await bcrypt.compare('FormSecret123!', stored), true)
}

async function run() {
  await testPersistsEmptyLanguagesArray()
  await testOmitsLanguagesWhenInputIsNotArray()
  await testNullLanguagesResetsToEmptyArray()
  await testAllowArchiveFalseOnlyUpdatesSettings()
  await testQueuesOnlyNewSupportedLanguages()
  await testHashesFormPasswordBeforePersistence()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
