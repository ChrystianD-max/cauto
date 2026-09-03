'use strict';

/* =============================================================================
   C-AUTO — Format d'erreur structuré (module 69)
   -----------------------------------------------------------------------------
   Toutes les réponses d'erreur API suivent la norme :

     {
       "success": false,
       "error": { "code": "...", "message": "..." }   (+ "details" si renseigné)
     }

   Pour préserver la rétro-compatibilité, la réponse inclut AUSSI les champs à
   plat historiques (code / message / details) consommés par le client existant.
   =========================================================================== */

/**
 * Construit le corps de réponse d'erreur structuré.
 * @param {number} status  Code HTTP.
 * @param {string} message Message lisible (jamais une stack trace).
 * @param {string} [code]  Code machine (ex : VEHICLE_NOT_FOUND). S'il est omis,
 *                         un code est dérivé du statut HTTP.
 * @param {*} [details]    Détails optionnels (ex : issues de validation).
 */
const STATUS_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED'
};

function errorBody(status, message, code, details) {
  const finalCode = code || STATUS_CODES[status] || 'ERROR';
  const body = {
    success: false,
    error: { code: finalCode, message }
  };
  // Rétro-compat : champs à plat (l'API() du frontend lisait error/code).
  body.code = finalCode;
  body.message = message;
  if (details !== undefined) {
    body.error.details = details;
    body.details = details;
  }
  return body;
}

/**
 * Règle : ne jamais exposer de stack trace au client. Indique ici si un message
 * externe est acceptable (uniquement hors production, et fitre les traces).
 * @param {Error} err
 */
function safeMessage(err) {
  const msg = String((err && err.message) || 'Erreur interne');
  // On ne renvoie jamais un contenu ressemblant à une stack trace.
  const looksLikeTrace = /at\s+[\w$.[\]]+\s*\(/i.test(msg) || /\n\s+at\s+/i.test(msg);
  if (looksLikeTrace) return 'Erreur interne';
  return msg;
}

module.exports = { errorBody, safeMessage };
