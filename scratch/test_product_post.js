const fetch = require('node-fetch');

async function test() {
  const payload = {
    name: 'Test Product',
    brand: '',
    category: '',
    hsnCode: '',
    gstPercent: 0,
    productType: 'single',
    barcode: 'ATT-5001',
    mrp: 299,
    sellingPrice: 285,
    wholesaleCost: 245,
    baseUnit: 'PCS'
  };

  try {
    const res = await fetch('http://localhost:3000/api/v1/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'next-auth.session-token=your_token_here;' // Might need this?
      },
      body: JSON.stringify(payload)
    });
    console.log(res.status);
    console.log(await res.text());
  } catch (e) {
    console.error(e);
  }
}

test();
