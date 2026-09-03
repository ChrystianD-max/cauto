const bcrypt = require('bcryptjs');
const { Client } = require('pg');

(async () => {
  const hash = await bcrypt.hash('Test1234!', 10);
  console.log('Generated hash:', hash);
  
  const c = new Client({
    host: 'postgres',
    user: 'cauto',
    password: 'cauto',
    database: 'cauto'
  });
  await c.connect();
  
  await c.query("UPDATE users SET password_hash = $1 WHERE email LIKE 'pro.%'", [hash]);
  console.log('Updated pro users');
  
  const r = await c.query("SELECT email, LEFT(password_hash,30) as h FROM users WHERE email LIKE 'pro.%'");
  console.log(JSON.stringify(r.rows, null, 2));
  
  // Verify
  for (const row of r.rows) {
    const match = await bcrypt.compare('Test1234!', hash);
    console.log(row.email, 'match:', match);
  }
  
  await c.end();
})();
