import assert from 'assert'

import hbs from '../src/utils/handlebars'

function testJsonHelperEscapesScriptBreakout() {
  const template = hbs.compile('<script>var data = {{{json payload}}};</script>')
  const html = template({
    payload: {
      code: '</script><img src=x onerror=alert(1)>'
    }
  })

  assert.strictEqual(html.includes('</script><img'), false)
  assert.strictEqual(html.includes('\\u003c/script\\u003e'), true)
}

function run() {
  testJsonHelperEscapesScriptBreakout()
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
