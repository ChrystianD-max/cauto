const RoutingService = require('./RoutingService');

// ETAService : heure d'arrivée estimée (journal) + arrivée réelle horodatée.
class ETAService {
  async estimate(from, to, opts = {}) {
    const r = await RoutingService.distance(from, to, opts);
    const speedKph = opts.speedKph || 35;
    return {
      distanceKm: r.distanceKm,
      durationMin: r.durationMin,
      speedKph: speedKph || Math.max(1, (r.distanceKm / Math.max(1, r.durationMin)) * 60),
      arrivalAt: new Date(Date.now() + r.durationMin * 60000).toISOString(),
      provider: r.provider
    };
  }
}

module.exports = new ETAService();