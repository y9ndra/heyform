import sharp from 'sharp'

export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024

const MAX_INPUT_IMAGE_PIXELS = 40 * 1024 * 1024
const MAX_OUTPUT_IMAGE_DIMENSION = 4096
const MAX_IMAGE_PAGES = 100

const SAFE_IMAGE_FORMATS = {
  gif: { contentType: 'image/gif', extension: 'gif' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  webp: { contentType: 'image/webp', extension: 'webp' }
} as const

type SafeImageFormat = keyof typeof SAFE_IMAGE_FORMATS

export interface SafeImageResult {
  buffer: Buffer
  contentType: string
  extension: string
}

function setOutputFormat(pipeline: sharp.Sharp, format: SafeImageFormat): sharp.Sharp {
  switch (format) {
    case 'gif':
      return pipeline.gif()
    case 'jpeg':
      return pipeline.jpeg()
    case 'png':
      return pipeline.png()
    case 'webp':
      return pipeline.webp()
  }
}

export async function sanitizeRemoteImage(
  buffer: Buffer,
  width?: number,
  height?: number
): Promise<SafeImageResult> {
  if (buffer.length < 1 || buffer.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error('Image response is empty or too large')
  }

  const image = sharp(buffer, {
    animated: true,
    failOnError: true,
    limitInputPixels: MAX_INPUT_IMAGE_PIXELS,
    sequentialRead: true
  })
  const metadata = await image.metadata()
  const format = metadata.format as SafeImageFormat
  const formatInfo = SAFE_IMAGE_FORMATS[format]
  const pages = metadata.pages || 1
  const pageHeight = metadata.pageHeight || metadata.height || 0
  const totalPixels = (metadata.width || 0) * pageHeight * pages

  if (
    !formatInfo ||
    !metadata.width ||
    !metadata.height ||
    pages > MAX_IMAGE_PAGES ||
    totalPixels > MAX_INPUT_IMAGE_PIXELS
  ) {
    throw new Error('Unsupported or malformed image')
  }

  // Supplying the missing dimension as a maximum keeps extreme aspect ratios bounded too.
  const pipeline = image.rotate().resize({
    fit: 'inside',
    height: height || MAX_OUTPUT_IMAGE_DIMENSION,
    width: width || MAX_OUTPUT_IMAGE_DIMENSION,
    withoutEnlargement: true
  })
  const output = await setOutputFormat(pipeline, format).toBuffer()

  if (output.length > MAX_REMOTE_IMAGE_BYTES) {
    throw new Error('Processed image is too large')
  }

  return {
    buffer: output,
    contentType: formatInfo.contentType,
    extension: formatInfo.extension
  }
}
