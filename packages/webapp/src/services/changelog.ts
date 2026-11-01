import axios from 'axios'

import { ChangelogType } from '@/types'

export class ChangelogService {
  static async latest(): Promise<ChangelogType | null> {
    const { data } = await axios.get<ChangelogType>('/api/changelog/latest')

    // The API returns an empty body when there is no changelog
    return data.version ? data : null
  }
}
