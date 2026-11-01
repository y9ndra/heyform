import assert from 'assert'

import { UpdateFormThemeResolver } from '../src/resolver/form/update-form-theme.resolver'

function createResolver() {
  let updateCalled = false
  const formService = {
    update: async () => {
      updateCalled = true
      return true
    }
  }

  return {
    resolver: new UpdateFormThemeResolver(formService as any),
    wasUpdateCalled: () => updateCalled
  }
}

async function testRejectsBackgroundImageRuleInjection() {
  const { resolver, wasUpdateCalled } = createResolver()

  await assert.rejects(
    resolver.updateFormTheme({
      formId: 'form_1',
      theme: {
        backgroundImage: 'http://a.com/x);}body::after{content:"PWNED";position:fixed}/*'
      }
    } as any),
    /Background image value contains unsafe CSS characters/
  )
  assert.strictEqual(wasUpdateCalled(), false)
}

async function testAllowsSupportedBackgroundImages() {
  for (const backgroundImage of [
    'https://forms.example.com/background.png?x=1&y=2',
    'linear-gradient(to right, #fff 0%, #000 100%)',
    'radial-gradient(circle, #fff 0%, #000 100%)'
  ]) {
    const { resolver, wasUpdateCalled } = createResolver()

    await resolver.updateFormTheme({
      formId: 'form_1',
      theme: {
        backgroundImage
      }
    } as any)
    assert.strictEqual(wasUpdateCalled(), true)
  }
}

async function testRejectsRuleInjectionInThemeColors() {
  for (const property of [
    'questionTextColor',
    'answerTextColor',
    'buttonBackground',
    'buttonTextColor',
    'backgroundColor'
  ]) {
    const { resolver, wasUpdateCalled } = createResolver()

    await assert.rejects(
      resolver.updateFormTheme({
        formId: 'form_1',
        theme: {
          [property]: 'red;}body::after{content:"PWNED";position:fixed}/*'
        }
      } as any),
      /Theme color value contains unsafe CSS characters/
    )
    assert.strictEqual(wasUpdateCalled(), false)
  }
}

async function run() {
  await testRejectsBackgroundImageRuleInjection()
  await testAllowsSupportedBackgroundImages()
  await testRejectsRuleInjectionInThemeColors()
}

if (require.main === module) {
  run().catch(error => {
    // eslint-disable-next-line no-console
    console.error(error)
    process.exitCode = 1
  })
}
