const db = require('../../db');
const { HttpError } = require('../../utils/errors');
const { haversineKm, obfuscate, canSeePrecisePosition, isOwnerOrSelf } = require('./geo');

// LocationService : suivi avec consentement, sessions, historisation,
// événements de zone, et exposition restreinte de la position exacte.
class LocationService {
  // ---------- Consentement ----------
  async getConsent(userId, vehicleId) {
    const row = await db.one(
      `SELECT consent, updated_at FROM gps_consents WHERE user_id=$1 AND vehicle_id=$2`,
      [userId, vehicleId]
    ).catch(() => null);
    return row ? row.consent : false;
  }

  async setConsent(userId, vehicleId, consent, actorId) {
    await db.query(
      `INSERT INTO gps_consents (user_id, vehicle_id, consent, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (user_id, vehicle_id) DO UPDATE SET consent=$3, updated_at=now()`,
      [userId, vehicleId, consent]
    );
    if (!consent) {
      // Révocation = arrêt immédiat du suivi.
      await db.query(
        `UPDATE gps_tracking_sessions SET status='STOPPED', stopped_at=now()
         WHERE vehicle_id=$1 AND status='ACTIVE'`, [vehicleId]
      );
      await this._logEvent(vehicleId, 'GPS_CONSENT_REVOKED', 'WARNING', 'Le propriétaire a révoqué le suivi GPS', actorId);
    }
    return this.getConsent(userId, vehicleId);
  }

  async ownerOf(vehicleId) {
    const v = await db.one('SELECT owner_id FROM vehicles WHERE id=$1', [vehicleId]).catch(() => null);
    return v ? v.owner_id : null;
  }

  // ---------- Sessions de suivi ----------
  async startTracking({ vehicleId, startedBy, driverId, intervalSec = 30 }) {
    const owner = await this.ownerOf(vehicleId);
    if (!owner) throw new HttpError(404, 'Véhicule introuvable');
    const consent = await this.getConsent(owner, vehicleId);
    if (!consent) throw new HttpError(403, 'Consentement GPS requis pour ce véhicule');
    const existing = await db.one(
      `SELECT id FROM gps_tracking_sessions WHERE vehicle_id=$1 AND status='ACTIVE' LIMIT 1`, [vehicleId]
    ).catch(() => null);
    if (existing) {
      return await this._session(existing.id);
    }
    const s = await db.one(
      `INSERT INTO gps_tracking_sessions (vehicle_id, driver_id, started_by, interval_sec)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [vehicleId, driverId || null, startedBy, intervalSec]
    );
    await this._logEvent(vehicleId, 'GPS_TRACKING_START', 'INFO', 'Suivi GPS démarré', startedBy);
    return s;
  }

  async stopTracking(vehicleId, actorId) {
    await db.query(
      `UPDATE gps_tracking_sessions SET status='STOPPED', stopped_at=now()
       WHERE vehicle_id=$1 AND status='ACTIVE'`, [vehicleId]
    );
    await this._logEvent(vehicleId, 'GPS_TRACKING_STOP', 'INFO', 'Suivi GPS arrêté', actorId);
    return true;
  }

  async activeSession(vehicleId) {
    const s = await db.one(
      `SELECT * FROM gps_tracking_sessions WHERE vehicle_id=$1 AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1`,
      [vehicleId]
    ).catch(() => null);
    return s || null;
  }

  async _session(id) {
    return db.one('SELECT * FROM gps_tracking_sessions WHERE id=$1', [id]);
  }

  // ---------- Positions ----------
  async ping({ vehicleId, actorId, latitude, longitude, speed_kph, heading, accuracy_m, altitude_m, source = 'DEVICE' }) {
    const session = await this.activeSession(vehicleId);
    if (!session) throw new HttpError(409, 'Aucun suivi GPS actif pour ce véhicule');
    const owner = await this.ownerOf(vehicleId);
    if (!owner) throw new HttpError(404, 'Véhicule introuvable');
    const consent = await this.getConsent(owner, vehicleId);
    if (!consent) throw new HttpError(403, 'Consentement GPS révoqué');

    const prev = await db.one(
      `SELECT latitude, longitude FROM gps_tracking
       WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [vehicleId]
    ).catch(() => null);

    const row = await db.one(
      `INSERT INTO gps_tracking (vehicle_id, driver_id, latitude, longitude, altitude_m, speed_kph, heading, accuracy_m, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [vehicleId, session.driver_id, latitude, longitude, altitude_m ?? null, speed_kph ?? null, heading ?? null, accuracy_m ?? null, source]
    );

    if (prev) {
      const moved = haversineKm(prev.latitude, prev.longitude, latitude, longitude);
      if (moved > 0.05) {
        await this._zoneEvents(vehicleId, prev.latitude, prev.longitude, latitude, longitude, actorId);
      }
    }
    return row;
  }

  async lastPosition(vehicleId) {
    const row = await db.one(
      `SELECT * FROM gps_tracking WHERE vehicle_id=$1 ORDER BY recorded_at DESC LIMIT 1`, [vehicleId]
    ).catch(() => null);
    return row || null;
  }

  // ---------- Exposition (obfuscation si pas de droit précis) ----------
  async deliverPosition(vehicleId, reqUser) {
    const pos = await this.lastPosition(vehicleId);
    if (!pos) return { tracked: false, vehicle_id: vehicleId };
    const owner = await this.ownerOf(vehicleId);
    const precise = canSeePrecisePosition(reqUser) || isOwnerOrSelf(reqUser, owner);
    return {
      tracked: true,
      vehicle_id: vehicleId,
      ...(precise
        ? { latitude: pos.latitude, longitude: pos.longitude, accuracy_m: pos.accuracy_m }
        : obfuscate(pos.latitude, pos.longitude)),
      speed_kph: pos.speed_kph,
      heading: pos.heading,
      recorded_at: pos.recorded_at,
      precise
    };
  }

  async listPositions(reqUser, { ownerId } = {}) {
    const rows = await db.many(
      `SELECT DISTINCT ON (g.vehicle_id) g.vehicle_id, g.latitude, g.longitude, g.speed_kph,
              g.recorded_at, v.plate, v.make, v.model, v.owner_id
       FROM gps_tracking g JOIN vehicles v ON v.id = g.vehicle_id
       ORDER BY g.vehicle_id, g.recorded_at DESC`
    );
    const precise = canSeePrecisePosition(reqUser);
    return (rows || []).map((r) => {
      const self = isOwnerOrSelf(reqUser, r.owner_id);
      const detail = precise || self;
      return {
        vehicle_id: r.vehicle_id,
        plate: r.plate,
        make: r.make,
        model: r.model,
        ...(detail ? { latitude: r.latitude, longitude: r.longitude } : obfuscate(r.latitude, r.longitude)),
        speed_kph: r.speed_kph,
        recorded_at: r.recorded_at,
        precise: detail
      };
    });
  }

  // ---------- Zones ----------
  async getActiveZones() {
    return db.many(`SELECT id, name, code, country, region, city, lat, lng, radius_km, is_active
                    FROM service_zones WHERE is_active = true ORDER BY name`);
  }

  async _containingZone(lat, lng) {
    const zones = await this.getActiveZones();
    for (const z of zones) {
      if (z.lat == null || z.lng == null) continue;
      const d = haversineKm(z.lat, z.lng, parseFloat(lat), parseFloat(lng));
      if (d <= z.radius_km) return z;
    }
    return null;
  }

  async _zoneEvents(vehicleId, aLat, aLng, bLat, bLng, actorId) {
    const za = await this._containingZone(aLat, aLng);
    const zb = await this._containingZone(bLat, bLng);
    const zoneIn = za && (!zb || za.id !== zb.id);
    const zoneOut = zb && (!za || za.id !== zb.id);
    if (zoneIn && zb) {
      await this._logEvent(vehicleId, 'ZONE_ENTER', 'INFO', `Entrée en zone ${zb.name}`, actorId);
    }
    if (zoneOut && za) {
      await this._logEvent(vehicleId, 'ZONE_EXIT', 'INFO', `Sortie de zone ${za.name}`, actorId);
    }
  }

  async _logEvent(vehicleId, eventType, severity, description, actorId) {
    await db.query(
      `INSERT INTO fleet_events (vehicle_id, event_type, severity, description)
       VALUES ($1,$2,$3,$4)`,
      [vehicleId, eventType, severity, description]
    ).catch(() => null);
  }
}

module.exports = new LocationService();