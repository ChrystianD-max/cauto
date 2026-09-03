// Géométrie / confidentialité GPS (module 38).
// La position exacte n'est JAMAIS exposée inutilement : mise en flou
// (obfuscation ~1 km) pour les rôles qui n'ont pas besoin du détail.

const EARTH_R = 6371;

function toRad(d) { return (d * Math.PI) / 180; }

function haversineKm(aLat, aLng, bLat, bLng) {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

function bearing(aLat, aLng, bLat, bLng) {
  const y = Math.sin(toRad(bLng - aLng)) * Math.cos(toRad(bLat));
  const x = Math.cos(toRad(aLat)) * Math.sin(toRad(bLat)) -
    Math.sin(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.cos(toRad(bLng - aLng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Flou volontaire : ~0.009° ≈ 1 km. On arrondit aussi la précision annoncée.
function obfuscate(lat, lng, blurDeg = 0.009) {
  return {
    latitude: parseFloat((Math.round(lat / blurDeg) * blurDeg).toFixed(4)),
    longitude: parseFloat((Math.round(lng / blurDeg) * blurDeg).toFixed(4)),
    obscured: true,
    accuracyHint: Math.max(1, blurDeg * 110).toFixed(1) + ' km'
  };
}

// Rôles privilégiés autorisés à voir la position précise.
const PRECISE_ROLES = ['ADMIN', 'SUPER_ADMIN', 'FLEET_MANAGER', 'LIVREUR'];

function canSeePrecisePosition(reqUser) {
  return PRECISE_ROLES.includes(reqUser.role);
}

function isOwnerOrSelf(reqUser, ownerId) {
  return reqUser && ownerId === reqUser.sub;
}

module.exports = { haversineKm, bearing, obfuscate, canSeePrecisePosition, isOwnerOrSelf, EARTH_R };