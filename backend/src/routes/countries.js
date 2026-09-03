const express = require('express');
const CountryService = require('../core/countries');
const { HttpError, wrap } = require('../utils/errors');

// Module 44/45 — Catalogue pays/régions/villes + devises + moyens de paiement.
// Données 100% issues des tables (jamais codées en dur). Point d'entrée public.
const router = express.Router();

// /api/countries
router.get('/countries', wrap(async (req, res) => {
  const activeOnly = req.query.scope !== 'all';
  res.json({ countries: await CountryService.list({ activeOnly }) });
}));

// /api/countries/default
router.get('/countries/default', wrap(async (req, res) => {
  const code = await CountryService.defaultCountryCode();
  const country = await CountryService.get(code);
  const currency = await CountryService.currencyFor(code);
  res.json({ country, currency, payment_methods: await CountryService.paymentMethods(code) });
}));

// /api/countries/:code
router.get('/countries/:code', wrap(async (req, res) => {
  res.json({ country: await CountryService.get(req.params.code.toUpperCase()) });
}));

// /api/countries/:code/regions
router.get('/countries/:code/regions', wrap(async (req, res) => {
  res.json({ country: req.params.code.toUpperCase(), regions: await CountryService.regions(req.params.code.toUpperCase()) });
}));

// /api/countries/:code/cities
router.get('/countries/:code/cities', wrap(async (req, res) => {
  res.json({ country: req.params.code.toUpperCase(), cities: await CountryService.cities(req.params.code.toUpperCase()) });
}));

// /api/currencies
router.get('/currencies', wrap(async (req, res) => {
  res.json({ currencies: await CountryService.currencies() });
}));

// /api/payment-methods
router.get('/payment-methods', wrap(async (req, res) => {
  const code = (req.query.country || '').toUpperCase() || await CountryService.defaultCountryCode();
  res.json({ country: code, payment_methods: await CountryService.paymentMethods(code) });
}));

module.exports = router;