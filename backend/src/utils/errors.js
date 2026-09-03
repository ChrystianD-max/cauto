class HttpError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    if (opts.code) this.code = opts.code;
    if (opts.details) this.details = opts.details;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { HttpError, wrap };