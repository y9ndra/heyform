import { FieldKindEnum, FormModel } from '@heyform-inc/shared-types-enums'
import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Uploader } from '../src/pages/form/Render/utils/uploader'

vi.mock('@/services', async () => import('../src/services/upload'))

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='
const signature = `data:image/png;base64,${png}`
const form = {
  id: 'form_1',
  fields: [
    { id: 'photo', kind: FieldKindEnum.FILE_UPLOAD },
    { id: 'signature', kind: FieldKindEnum.SIGNATURE },
    { id: 'optional', kind: FieldKindEnum.FILE_UPLOAD }
  ]
} as FormModel

afterEach(() => vi.restoreAllMocks())

describe('respondent multipart uploads', () => {
  it('sends one original file and one named signature, with their field contexts', async () => {
    const bodies: string[] = []
    const post = vi.spyOn(axios, 'post').mockImplementation(async (url, data, config) => {
      expect(url).toBe('/api/upload')
      expect(data).toBeInstanceOf(FormData)
      // Serialize real multipart data: assigning .name to a Blob does not set its wire filename.
      bodies.push(
        await new Request('https://forms.example/api/upload', {
          method: 'POST',
          body: data
        }).text()
      )
      const file = data.get('file') as File
      const fieldId = config!.headers!['x-heyform-field-id']
      expect(config!.headers).toMatchObject({
        'x-heyform-form-id': 'form_1',
        'x-heyform-open-token': 'open_token'
      })
      expect(file.type).toBe('image/png')
      expect(Array.from(new Uint8Array(await file.arrayBuffer())).slice(0, 8)).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10
      ])
      return { data: { filename: file.name, url: `/static/upload/${fieldId}.png` } }
    })
    const original = new File([Uint8Array.from(atob(png), c => c.charCodeAt(0))], 'IMG_0071.png', {
      type: 'image/png'
    })
    const result = await new Uploader(form, { photo: original, signature }, 'open_token').start()

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls.map(call => call[2]!.headers!['x-heyform-field-id']).sort()).toEqual([
      'photo',
      'signature'
    ])
    expect(bodies.join('\n')).toContain('filename="IMG_0071.png"')
    expect(bodies.join('\n')).toContain('filename="signature.png"')
    expect(bodies.join('\n')).not.toContain('filename="blob"')
    expect(result).toEqual({
      photo: { filename: 'IMG_0071.png', url: '/static/upload/photo.png' },
      signature: '/static/upload/signature.png'
    })
  })

  it('does not upload empty optional answers', async () => {
    const post = vi.spyOn(axios, 'post')
    expect(await new Uploader(form, {}, 'open_token').start()).toEqual({})
    expect(post).not.toHaveBeenCalled()
  })
})
