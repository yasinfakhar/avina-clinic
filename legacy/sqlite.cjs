// Keep the existing node:sqlite call sites shared with the modern build.
const Database = require('better-sqlite3');
class DatabaseSync extends Database {
  constructor(filename, options = {}) {
    super(filename, { readonly: Boolean(options.readOnly), timeout: 5000 });
  }
}
module.exports = { DatabaseSync };
