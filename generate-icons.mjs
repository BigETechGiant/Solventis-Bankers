import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public/icons', { recursive: true })

const sizes = [57, 60, 72, 76, 114, 120, 144, 152, 180, 192, 384, 512]
for (const size of sizes) {
  await sharp('public/logo.png')
    .resize(size, size, { fit: 'contain', background: { r: 242, g: 236, b: 226, alpha: 1 } })
    .png()
    .toFile(`public/icons/icon-${size}.png`)
  console.log(`Generated ${size}x${size}`)
}
