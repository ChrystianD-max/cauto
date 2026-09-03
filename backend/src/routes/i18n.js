const express = require('express');
const { SUPPORTED, DEFAULT_LOCALE, messagesFor } = require('../core/i18n');
const { wrap } = require('../utils/errors');

// Module 46 — Endpoint i18n.
const router = express.Router();

// GET /api/i18n -> locales disponibles
router.get('/', wrap(async (_req, res) => {
  res.json({ locales: SUPPORTED, default_locale: DEFAULT_LOCALE });
}));

// GET /api/i18n/:locale -> messages (repli français)
router.get('/:locale', wrap(async (req, res) => {
  res.json({ locale: req.params.locale, messages: messagesFor(req.params.locale) });
}));

module.exports = router;