const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { HttpError, wrap } = require('../utils/errors');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  wrap(async (req, res) => {
    const {
      q,
      city,
      brand,
      specialty,
      profile_type,
      min_rating,
      max_price,
      available,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (q) {
      conditions.push(`(u.name ILIKE $${idx} OR p.specialty ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    if (city) {
      conditions.push(`g.city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }

    if (specialty) {
      conditions.push(`p.specialty ILIKE $${idx}`);
      params.push(`%${specialty}%`);
      idx++;
    }

    if (profile_type) {
      conditions.push(`p.profile_type = $${idx}`);
      params.push(profile_type);
      idx++;
    }

    if (min_rating) {
      conditions.push(`p.rating >= $${idx}`);
      params.push(parseFloat(min_rating));
      idx++;
    }

    if (available === 'true') {
      conditions.push(`p.is_active = true`);
    }

    if (brand) {
      conditions.push(`p.id IN (SELECT professional_id FROM professional_brands WHERE brand ILIKE $${idx})`);
      params.push(`%${brand}%`);
      idx++;
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    let orderClause = 'ORDER BY p.rating DESC';
    if (sort === 'rating') orderClause = 'ORDER BY p.rating DESC';
    else if (sort === 'delay') orderClause = 'ORDER BY p.avg_delay_days ASC';

    const countSql = `
      SELECT COUNT(*) as total
      FROM professionals p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN garages g ON p.garage_id = g.id
      ${whereClause}
    `;

    const dataSql = `
      SELECT p.*,
             u.name, u.email, u.phone,
             g.name as garage_name, g.city as garage_city, g.address as garage_address,
             (SELECT COUNT(*) FROM professional_brands pb WHERE pb.professional_id = p.id) as brand_count,
             (SELECT COUNT(*) FROM professional_services ps WHERE ps.professional_id = p.id) as service_count
      FROM professionals p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN garages g ON p.garage_id = g.id
      ${whereClause}
      ${orderClause}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limitNum, offset);

    const [countResult, professionals] = await Promise.all([
      db.one(countSql, params.slice(0, -2)),
      db.many(dataSql, params),
    ]);

    res.json({
      professionals,
      total: parseInt(countResult.total, 10),
    });
  })
);

router.get(
  '/me',
  requireRole('GARAGE', 'MECANICIEN'),
  wrap(async (req, res) => {
    const pro = await db.one('SELECT * FROM professionals WHERE user_id=$1', [req.user.sub]);
    if (!pro) throw new HttpError(404, 'Profil professionnel introuvable');
    res.json({ professional: pro });
  })
);

router.patch(
  '/me',
  requireRole('GARAGE', 'MECANICIEN'),
  wrap(async (req, res) => {
    const pro = await db.one('SELECT * FROM professionals WHERE user_id=$1', [req.user.sub]);
    if (!pro) throw new HttpError(404, 'Profil professionnel introuvable');
    const { is_available, city, specialty, logo_url } = req.body || {};
    const sets = [];
    const params = [pro.id];
    let idx = 2;
    let changed = false;
    if (typeof is_available === 'boolean') {
      sets.push(`is_available = $${idx}`); params.push(is_available); idx++; changed = true;
    }
    if (typeof city === 'string') {
      sets.push(`city = $${idx}`); params.push(city); idx++; changed = true;
    }
    if (typeof specialty === 'string') {
      sets.push(`specialty = $${idx}`); params.push(specialty); idx++; changed = true;
    }
    if (typeof logo_url === 'string' || logo_url === null) {
      sets.push(`logo_url = $${idx}`); params.push(logo_url); idx++; changed = true;
    }
    if (Array.isArray(req.body.attestation_doc_ids)) {
      if (req.body.attestation_doc_ids.length > 12) throw new HttpError(400, 'Maximum 12 attestations');
      sets.push(`attestation_doc_ids = $${idx}`, `verification_status = 'PENDING'`);
      params.push(JSON.stringify(req.body.attestation_doc_ids));
      idx++; changed = true;
    }
    if (changed && !sets.includes("verification_status = 'PENDING'")) {
      sets.push(`verification_status = 'PENDING'`);
    }
    if (changed) {
      const u = await db.one('SELECT name, email, phone FROM users WHERE id=$1', [req.user.sub]);
      const synthesis = {
        name: u.name, email: u.email, phone: u.phone,
        city: city || pro.city, specialty: specialty || pro.specialty,
        is_available: typeof is_available === 'boolean' ? is_available : pro.is_available,
        logo_url: logo_url !== undefined ? logo_url : pro.logo_url,
        attestation_count: Array.isArray(req.body.attestation_doc_ids) ? req.body.attestation_doc_ids.length : (pro.attestation_doc_ids || []).length,
        updated_at: new Date().toISOString()
      };
      sets.push(`synthesis = $${idx}`); params.push(JSON.stringify(synthesis)); idx++;
    }
    if (sets.length) await db.query(`UPDATE professionals SET ${sets.join(', ')} WHERE id=$1`, params);
    const updated = await db.one('SELECT * FROM professionals WHERE id=$1', [pro.id]);
    res.json({ professional: updated });
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const { id } = req.params;

    let professional;
    try {
      professional = await db.one(
        `SELECT p.*, u.name, u.email, u.phone,
                g.name as garage_name, g.city as garage_city, g.address as garage_address
         FROM professionals p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN garages g ON p.garage_id = g.id
         WHERE p.id = $1`,
        [id]
      );
    } catch (e) {
      throw new HttpError(404, 'Professionnel introuvable');
    }

    const [services, brands, certifications, availability, recent_ratings] = await Promise.all([
      db.many('SELECT * FROM professional_services WHERE professional_id = $1 ORDER BY category, label', [id]),
      db.many('SELECT brand FROM professional_brands WHERE professional_id = $1 ORDER BY brand', [id]),
      db.many('SELECT * FROM professional_certifications WHERE professional_id = $1 ORDER BY obtained_at DESC', [id]),
      db.many('SELECT * FROM professional_availability WHERE professional_id = $1 AND is_active = true ORDER BY day_of_week, start_time', [id]),
      db.many(
        'SELECT r.*, u.name as author_name FROM ratings r JOIN users u ON r.author_id = u.id WHERE r.professional_id = $1 ORDER BY r.created_at DESC LIMIT 10',
        [id]
      ),
    ]);

    res.json({
      professional: {
        ...professional,
        services,
        brands,
        certifications,
        availability,
        recent_ratings,
      },
    });
  })
);

router.get(
  '/:id/availability',
  wrap(async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      throw new HttpError(400, 'Le paramètre date est requis (YYYY-MM-DD)');
    }

    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      throw new HttpError(400, 'Format de date invalide');
    }

    const dayOfWeek = (dateObj.getDay() + 6) % 7;

    const availability = await db.many(
      'SELECT * FROM professional_availability WHERE professional_id = $1 AND is_active = true AND day_of_week = $2 ORDER BY start_time',
      [id, dayOfWeek]
    );

    const bookedResult = await db.query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE professional_id = $1 AND DATE(scheduled_at) = $2 AND status NOT IN ('CANCELLED')`,
      [id, date]
    );

    const booked = parseInt(bookedResult.rows[0].count, 10);

    const result = availability.map((slot) => ({
      start_time: slot.start_time,
      end_time: slot.end_time,
      max_appointments: slot.max_appointments || 1,
      booked: booked,
    }));

    res.json({ availability: result });
  })
);

router.get(
  '/:id/stats',
  wrap(async (req, res) => {
    const { id } = req.params;

    const stats = await db.one(
      `SELECT
         p.satisfaction_rate,
         p.rating_count as total_reviews,
         p.rating as avg_rating,
         p.return_rate,
         p.complaint_rate,
         p.avg_delay_days
       FROM professionals p
       WHERE p.id = $1`,
      [id]
    );

    res.json({
      stats: {
        avg_rating: parseFloat(stats.avg_rating),
        total_reviews: parseInt(stats.total_reviews, 10),
        satisfaction_rate: parseFloat(stats.satisfaction_rate),
        return_rate: parseFloat(stats.return_rate),
        complaint_rate: parseFloat(stats.complaint_rate),
        avg_delay_days: parseInt(stats.avg_delay_days, 10),
      },
    });
  })
);

module.exports = router;
