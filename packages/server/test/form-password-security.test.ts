import assert from 'assert'

import { FormService } from '../src/service/form.service'

async function testLazyPasswordMigrationDoesNotOverwriteConcurrentChanges() {
  const updates: Array<{ conditions: Record<string, any>; update: Record<string, any> }> = []
  const model = {
    updateOne: async (conditions: Record<string, any>, update: Record<string, any>) => {
      updates.push({ conditions, update })
      return { modifiedCount: 1 }
    }
  }
  const service = new FormService(model as any, {} as any, {} as any, {} as any)
  const hashedPassword = '$2b$10$Zy8jFR9J4jeK9MThnBnE.OuHX6wUGu6zrICnq8Dqf0zJjFj6QJ56i'

  assert.strictEqual(
    await service.migrateLegacyPassword('legacy_form', 'legacy-secret', hashedPassword),
    true
  )

  assert.strictEqual(updates.length, 1)
  assert.deepStrictEqual(updates[0].conditions, {
    _id: 'legacy_form',
    'settings.password': 'legacy-secret'
  })
  assert.strictEqual(updates[0].update.$set['settings.password'], hashedPassword)
}

if (require.main === module) {
  testLazyPasswordMigrationDoesNotOverwriteConcurrentChanges().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
