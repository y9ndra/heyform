import { Injectable } from '@nestjs/common'
import got from 'got'

import { RedisService } from './redis.service'
import { toJSON } from '@heyform-inc/utils'

interface GitHubRelease {
  id: number
  tag_name: string
  body: string
  html_url: string
  published_at: string
}

interface LatestRelease {
  id: number
  version: string
  changelog: string
  url: string
  publishedAt: string
}

const GITHUB_API_URL = 'https://api.github.com/repos/heyform/heyform/releases'
const LATEST_CACHE_KEY = 'changelog:latest'
const CACHE_TTL = '1d'
const FAILURE_CACHE_TTL = '5m'

@Injectable()
export class ChangelogService {
  constructor(private readonly redisService: RedisService) {}

  async getLatestRelease(): Promise<LatestRelease | null> {
    const cached = await this.redisService.get(LATEST_CACHE_KEY)

    if (cached) {
      return toJSON<LatestRelease>(cached) ?? null
    }

    return this.fetchLatestRelease()
  }

  private async fetchLatestRelease(): Promise<LatestRelease | null> {
    let release: LatestRelease | null = null

    try {
      const result = await got
        .get(`${GITHUB_API_URL}/latest`, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Heyform-Changelog'
          },
          timeout: { request: 5000 },
          retry: { limit: 0 }
        })
        .json<GitHubRelease>()

      release = {
        id: result.id,
        version: result.tag_name,
        changelog: result.body || '',
        url: result.html_url,
        publishedAt: result.published_at
      }
    } catch {
      // The update badge is optional: GitHub outages simply mean no changelog.
    }

    // Cache failures briefly, so each workspace visit doesn't retry a rate-limited API.
    await this.redisService.set({
      key: LATEST_CACHE_KEY,
      value: JSON.stringify(release),
      duration: release ? CACHE_TTL : FAILURE_CACHE_TTL
    })

    return release
  }
}
