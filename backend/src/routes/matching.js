const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middlewares/auth');
const { matchProfessionals, getMatchingProfiles } = require('../utils/matchingEngine');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();
router.use(requireAuth);

// GET /api/matching/profiles — profils de mise en relation actifs
router.get('/profiles', wrap(async (req, res) => {
  const profiles = await getMatchingProfiles();
  res.json({ profiles: profiles || [] });
}));

// GET /api/matching/results/:srId — meilleures correspondances pour une demande de service
router.get('/results/:srId', wrap(async (req, res) => {
  const sr = await db.one('SELECT id FROM service_requests WHERE id=$1', [req.params.srId]).catch(() => null);
  if (!sr) throw new HttpError(404, 'Demande de service introuvable');
  const profileName = String(req.query.profile || 'STANDARD');
  const results = await matchProfessionals(sr.id, profileName);
  res.json({ results: results || [] });
}));

module.exports = router;