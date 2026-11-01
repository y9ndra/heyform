import assert from 'assert'
import got from 'got'

import { ChangelogService } from '../src/service/changelog.service'

async function run() {
  const originalGet = got.get
  const store = new Map<string, string>()
  const durations: string[] = []
  const redis = {
    get: async (key: string) => store.get(key) ?? null,
    set: async ({ key, value, duration }: { key: string; value: string; duration: string }) => {
      store.set(key, value)
      durations.push(duration)
    }
  }
  let requests = 0
  let failure: Error | undefined
  let release = {
    id: 1,
    tag_name: 'v3.0.5',
    body: '## What changed',
    html_url: 'https://github.com/heyform/heyform/releases/tag/v3.0.5',
    published_at: '2026-10-29T00:00:00Z'
  }
  got.get = (() => ({
    json: async () => {
      requests++
      if (failure) throw failure
      return release
    }
  })) as unknown as typeof got.get

  try {
    const service = new ChangelogService(redis as any)
    const expected = {
      id: 1,
      version: 'v3.0.5',
      changelog: '## What changed',
      url: release.html_url,
      publishedAt: release.published_at
    }
    assert.deepStrictEqual(await service.getLatestRelease(), expected)
    assert.strictEqual(requests, 1)
    assert.deepStrictEqual(durations, ['1d'])

    // The cache lives in Redis, so it survives restarts and is shared between instances.
    assert.deepStrictEqual(await new ChangelogService(redis as any).getLatestRelease(), expected)
    assert.strictEqual(requests, 1)

    // Rate limits don't retry on every visit, and an upstream failure simply means no badge.
    store.clear()
    failure = Object.assign(new Error('API rate limit exceeded'), {
      response: { statusCode: 403 }
    })
    assert.strictEqual(await service.getLatestRelease(), null)
    assert.strictEqual(await service.getLatestRelease(), null)
    assert.strictEqual(requests, 2)
    assert.deepStrictEqual(durations, ['1d', '5m'])

    // Retry after the failure expires and recover when GitHub becomes available.
    store.clear()
    failure = undefined
    release = { ...release, id: 2, tag_name: 'v3.0.6' }
    assert.deepStrictEqual(await service.getLatestRelease(), {
      ...expected,
      id: 2,
      version: 'v3.0.6'
    })
    assert.strictEqual(requests, 3)
    assert.deepStrictEqual(durations, ['1d', '5m', '1d'])
  } finally {
    got.get = originalGet
  }
}

if (require.main === module) {
  run().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
