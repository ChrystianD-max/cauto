const { z } = require('zod');
const { HttpError } = require('./errors');

// Middleware de validation générique (zod) côté backend.
// `where` : 'body' | 'query' | 'params'. `.passthrough()` = ignore les champs inconnus
// au lieu de les rejeter (les payloads métier transportent parfois des extras).
function validate(schema, { where = 'body' } = {}) {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[where]);
      if (where === 'query') {
        // transforme les types parsés (nombre) sans casser req.query
        req.query = { ...req.query, ...parsed };
      } else {
        req[where] = parsed;
      }
      next();
    } catch (err) {
      const details = (err.issues || []).map((i) => ({
        path: i.path.join('.'),
        message: i.message
      }));
      next(new HttpError(400, 'Données invalides', { code: 'VALIDATION_ERROR', details }));
    }
  };
}

module.exports = { validate, z };