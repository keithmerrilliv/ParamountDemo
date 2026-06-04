// Generate minimal valid placeholder PNGs for packaging.
// Writes icon.png and largeIcon.png to webos/ directory.

import fs from 'fs';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;

function createMinimalPng() {
  // Minimal valid PNG (1x1 pixel)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82
  ]);
  
  return pngData;
}

function main() {
  const webosDir = path.join(__dirname, '..', 'webos');
  
  // Ensure directory exists
  if (!fs.existsSync(webosDir)) {
    fs.mkdirSync(webosDir, { recursive: true });
  }
  
  // Write icon.png (smaller size)
  const iconPath = path.join(webosDir, 'icon.png');
  fs.writeFileSync(iconPath, createMinimalPng());
  console.log(`Generated ${iconPath}`);
  
  // Write largeIcon.png (same minimal PNG for now)
  const largeIconPath = path.join(webosDir, 'largeIcon.png');
  fs.writeFileSync(largeIconPath, createMinimalPng());
  console.log(`Generated ${largeIconPath}`);
}

main();