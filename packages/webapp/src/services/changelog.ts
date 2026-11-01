import axios from 'axios'

import { ChangelogType } from '@/types'

export class ChangelogService {
  static async latest(): Promise<ChangelogType | null> {
    return (await axios.get('/api/changelog/latest')).data
  }
}
