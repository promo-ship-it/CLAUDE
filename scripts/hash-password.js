// Usage: node scripts/hash-password.js "yourpassword"
// Copy the output into ADMIN_PASSWORD_HASH in your .env file.
const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.js <password>");
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log("\nAdd this to your .env file:\n");
  console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
});
