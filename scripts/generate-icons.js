// Generate PWA icons from SVG
import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const SVG_PATH = join(__dirname, '../public/icons/icon.svg');
const OUTPUT_DIR = join(__dirname, '../public/icons');

async function generateIcons() {
  console.log('🎨 Generating PWA icons...');
  
  // Ensure output directory exists
  await mkdir(OUTPUT_DIR, { recursive: true });
  
  for (const size of ICON_SIZES) {
    const outputPath = join(OUTPUT_DIR, `icon-${size}.png`);
    
    await sharp(SVG_PATH)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`✅ Generated icon-${size}.png`);
  }
  
  // Also generate favicon (32x32)
  await sharp(SVG_PATH)
    .resize(32, 32)
    .png()
    .toFile(join(OUTPUT_DIR, 'favicon-32.png'));
  
  console.log('✅ Generated favicon-32.png');
  
  // Generate apple-touch-icon (180x180 is recommended)
  await sharp(SVG_PATH)
    .resize(180, 180)
    .png()
    .toFile(join(OUTPUT_DIR, 'apple-touch-icon.png'));
  
  console.log('✅ Generated apple-touch-icon.png');
  
  console.log('\n🎉 All icons generated successfully!');
}

generateIcons().catch(console.error);
