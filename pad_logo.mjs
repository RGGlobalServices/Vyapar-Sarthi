import sharp from 'sharp';

async function main() {
  const logoPath = 'vyapar-landing-page/public/logo2.png';
  const outPath = 'assets/splash.png';
  const outDarkPath = 'assets/splash-dark.png';

  // Create a 2732x2732 black image
  // Scale the logo to fit within a small center area (e.g. 1000x1000) so Android 12 doesn't crop it
  
  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 } // #ffffff
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize({ width: 1000, height: 1000, fit: 'inside' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(outPath);

  console.log('Created splash.png');

  // Also create splash-dark
  await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 } // #ffffff
    }
  })
  .composite([
    {
      input: await sharp(logoPath).resize({ width: 1000, height: 1000, fit: 'inside' }).toBuffer(),
      gravity: 'center'
    }
  ])
  .png()
  .toFile(outDarkPath);

  console.log('Created splash-dark.png');
}

main().catch(console.error);
