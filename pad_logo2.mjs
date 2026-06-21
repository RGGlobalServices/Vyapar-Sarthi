import sharp from 'sharp';

async function main() {
  const logoPath = 'vyapar-landing-page/public/logo2.png';
  const outIconPath = 'assets/icon.png';

  // Create a 1024x1024 transparent/dark image for the icon
  // Scale the logo to fit within a smaller center area (e.g. 700x700) so it doesn't get clipped by the circle
  
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 } // #ffffff
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize({ width: 700, height: 700, fit: 'inside' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(outIconPath);

  console.log('Created icon.png');
}

main().catch(console.error);
