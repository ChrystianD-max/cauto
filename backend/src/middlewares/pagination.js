// Pagination / tri automatiques, 100% rétro-compatibles.
// - Ne fait rien tant que le client ne passe pas ?page, ?sort ou ?count.
// - La réponse doit contenir exactement un tableau (ex: { vehicles: [...] }).
// - Ajoute { total, page, pageSize, totalPages } quand ?page est présent.
// - ?sort=champ&order=asc|desc trie (insensible à la casse, tri numérique si possible).
// - ?count=1 ajoute { count } sans paginer.
const DENY = ['/parts']; // endpoints gérant déjà leur propre page/limit

function toPosInt(s, def, lo = 1, hi = 200) {
  if (s === undefined) return def;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

function autoPagination(req, res, next) {
  const q = req.query || {};
  const use = req.path && DENY.includes(req.path);
  if (use || (q.page === undefined && q.sort === undefined && q.count === undefined)) return next();

  const orig = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const keys = Object.keys(body).filter((k) => Array.isArray(body[k]));
      if (keys.length === 1) {
        const key = keys[0];
        let rows = body[key];
        if (q.sort && Array.isArray(rows)) {
          const dir = String(q.order || 'asc').toLowerCase() === 'desc' ? -1 : 1;
          rows = [...rows].sort((a, b) => {
            const av = a[q.sort];
            const bv = b[q.sort];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return String(av).localeCompare(String(bv), 'fr', { numeric: true }) * dir;
          });
        }
        if (q.page !== undefined) {
          const page = toPosInt(q.page, 1, 1, 1000000);
          const pageSize = toPosInt(q.pageSize, 25, 1, 200);
          const total = rows.length;
          const start = (page - 1) * pageSize;
          return orig({
            ...body,
            [key]: rows.slice(start, start + pageSize),
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize))
          });
        }
        if (q.count !== undefined) return orig({ ...body, count: rows.length });
        if (q.sort !== undefined) return orig({ ...body, [key]: rows });
      }
    }
    return orig(body);
  };
  next();
}

module.exports = { autoPagination };