const https = require('https');
const { haversineKm } = require('./geo');
const config = require('../../config');

// RoutingService : distance / durée entre deux points.
// Routeur externe (ex : OSRM, GraphHopper) si configuré en env,
// sinon calcul Haversine majoré d'un facteur routier.
// MODE DÉMONSTRATION : jamais de routeur externe — trajets simulés (haversine).
class RoutingService {
  get mode() { return config.demoMode ? 'simulated' : (process.env.ROUTING_PROVIDER || 'haversine'); }

  isConfigured() {
    return !config.demoMode && !!(process.env.ROUTING_API_URL && process.env.ROUTING_API_KEY);
  }

  _httpGet(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request({
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'GET',
        headers: this.isConfigured() ? { Authorization: 'Bearer ' + process.env.ROUTING_API_KEY } : {}
      }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  async distance(from, to, opts = {}) {
    const [aLat, aLng] = from;
    const [bLat, bLng] = to;
    const mode = opts.mode || 'driving';
    if (this.isConfigured()) {
      try {
        const url = process.env.ROUTING_API_URL.replace(/\/+$/, '') +
          `/${mode}/${aLng},${aLat};${bLng},${bLat}?overview=false&generate_hints=false`;
        const res = await this._httpGet(url);
        const r = res.routes && res.routes[0];
        if (r) {
          return {
            distanceKm: parseFloat((r.distance / 1000).toFixed(2)),
            durationMin: Math.max(1, Math.round(r.duration / 60)),
            provider: 'external'
          };
        }
      } catch (e) {}
    }
    const straight = haversineKm(aLat, aLng, bLat, bLng);
    const roadFactor = 1.3; // réalité routière vs distance à vol d'oiseau
    const km = parseFloat((straight * roadFactor).toFixed(2));
    const speedKph = opts.speedKph || 35;
    return { distanceKm: km, durationMin: Math.max(1, Math.round((km / speedKph) * 60)), provider: 'haversine' };
  }
}

module.exports = new RoutingService();