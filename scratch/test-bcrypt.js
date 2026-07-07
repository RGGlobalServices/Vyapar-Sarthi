const bcrypt = require('bcryptjs');

async function test() {
  const hash = await bcrypt.hash('1234', 10);
  console.log(await bcrypt.compare('1234', hash));
  console.log(await bcrypt.compare('wrong', hash));
}
test();
