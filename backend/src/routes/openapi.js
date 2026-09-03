// Documentation API (module 36) — OpenAPI 3.0 construite en JS.
// Endpoints exposés : tous les domaines /api/*. Publique (lecture seule).

const info = {
  openapi: '3.0.0',
  info: {
    title: 'C-AUTO API',
    version: '2.0.0',
    description:
      'API REST de la plateforme C-AUTO. Authentification par Bearer JWT (POST /api/auth/login). ' +
      'RBAC appliqué côté serveur via user_roles + role_permissions — le frontend ne fait jamais confiance.'
  },
  servers: [{ url: '/api' }],
  tags: [
    { name: 'auth', description: 'Inscription / connexion / session' },
    { name: 'users', description: 'Profils, rôles et permissions' },
    { name: 'vehicles', description: 'Véhicules clients' },
    { name: 'maintenance', description: 'Programmes d\'entretien et alertes' },
    { name: 'diagnostic', description: 'Diagnostics' },
    { name: 'fault-codes', description: 'Code défauts / pannes' },
    { name: 'professionals', description: 'Garages, mécaniciens, experts' },
    { name: 'matching', description: 'Mise en relation profils pro' },
    { name: 'service-requests', description: 'Demandes de service' },
    { name: 'appointments', description: 'Rendez-vous' },
    { name: 'quotes', description: 'Devis' },
    { name: 'repairs', description: 'Réparations et interventions' },
    { name: 'warranties', description: 'Garanties' },
    { name: 'reviews', description: 'Avis / évaluations' },
    { name: 'disputes', description: 'Litiges' },
    { name: 'parts', description: 'Pièces détachées et catalogue' },
    { name: 'suppliers', description: 'Fournisseurs' },
    { name: 'orders', description: 'Commandes pièces' },
    { name: 'payments', description: 'Paiements' },
    { name: 'fleet', description: 'Flotte & gestion' },
    { name: 'notifications', description: 'Notifications utilisateur' },
    { name: 'admin', description: 'Administration (réservé ADMIN/SUPER_ADMIN)' }
  ]
};

function pathKey() {}

const P_STATUS = { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filtre par statut' };
const P_Q = { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Recherche libre' };
const P_PAGE = { name: 'page', in: 'query', schema: { type: 'integer' }, description: 'Page (pagination auto)' };
const P_PAGESIZE = { name: 'pageSize', in: 'query', schema: { type: 'integer' }, description: 'Taille de page' };
const P_SORT = { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Tri auto' };
const P_ORDER = { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } };

const paths = {
  '/auth/register': {
    post: {
      tags: ['auth'], summary: 'Inscription', security: [],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { 200: { description: 'Compte créé' }, 400: { description: 'Validation' } }
    }
  },
  '/auth/login': {
    post: {
      tags: ['auth'], summary: 'Connexion (renvoie le JWT Bearer)', security: [],
      requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
      responses: { 200: { description: 'JWT + utilisateur' }, 401: { description: 'Identifiants invalides' } }
    }
  },
  '/auth/me': {
    get: { tags: ['auth'], summary: 'Utilisateur courant', responses: { 200: { description: 'Profil' } } },
    patch: { tags: ['auth'], summary: 'Mettre à jour ses coordonnées', responses: { 200: { description: 'Profil mis à jour' } } }
  },

  '/users/me': { get: { tags: ['users'], summary: 'Profil complet + rôles + permissions', responses: { 200: { description: 'user + profile + roles + permissions' } } } },
  '/users/{id}': {
    get: { tags: ['users'], summary: 'Profil d\'un utilisateur (soi ou admin)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Profil' }, 404: { description: 'Introuvable' } } },
    patch: { tags: ['users'], summary: 'Mise à jour (admin : rôle via users.roles.assign)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Profil mis à jour' }, 403: { description: 'Permission requise' } } }
  },

  '/vehicles': {
    get: { tags: ['vehicles'], summary: 'Véhicules (filtres, pagination auto)', parameters: [P_STATUS, P_PAGE, P_PAGESIZE, P_SORT, P_ORDER], responses: { 200: { description: 'Liste véhicules' } } },
    post: { tags: ['vehicles'], summary: 'Créer un véhicule (validation zod)', responses: { 201: { description: 'Véhicule créé' }, 400: { description: 'Validation' } } }
  },
  '/vehicles/{id}': {
    get: { tags: ['vehicles'], summary: 'Détail véhicule', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Détail' } } },
    patch: { tags: ['vehicles'], summary: 'Mettre à jour un véhicule', responses: { 200: { description: 'Mise à jour' } } },
    delete: { tags: ['vehicles'], summary: 'Supprimer un véhicule', responses: { 200: { description: 'Supprimé' } } }
  },

  '/maintenance': {
    get: { tags: ['maintenance'], summary: 'Programmes d\'entretien', responses: { 200: { description: 'Liste' } } }
  },
  '/diagnostic': {
    post: { tags: ['diagnostic'], summary: 'Lancer / enregistrer un diagnostic', responses: { 201: { description: 'Diagnostic' } } },
    get: { tags: ['diagnostic'], summary: 'Catégories de diagnostic', responses: { 200: { description: 'Catégories' } } }
  },
  '/fault-codes': {
    get: { tags: ['fault-codes'], summary: 'Codes défauts (filtre par système/code)', responses: { 200: { description: 'Codes' } } }
  },

  '/professionals': {
    get: { tags: ['professionals'], summary: 'Liste des professionnels (filtres + tri + pagination auto)', parameters: [P_Q, P_PAGE, P_PAGESIZE, P_SORT, P_ORDER], responses: { 200: { description: 'Professionnels' } } }
  },

  '/matching/profiles': { get: { tags: ['matching'], summary: 'Profils de mise en relation actifs', responses: { 200: { description: 'Profils' } } } },
  '/matching/results/{srId}': { get: { tags: ['matching'], summary: 'Meilleures correspondances pour une demande de service', parameters: [{ name: 'srId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Résultats score' }, 404: { description: 'Demande introuvable' } } } },

  '/service-requests': {
    get: { tags: ['service-requests'], summary: 'Demandes de service (mine/statut)', parameters: [P_STATUS, P_PAGE, P_PAGESIZE], responses: { 200: { description: 'Demandes' } } },
    post: { tags: ['service-requests'], summary: 'Créer une demande', responses: { 201: { description: 'Créée' } } }
  },
  '/appointments': { post: { tags: ['appointments'], summary: 'Créer un rendez-vous', responses: { 201: { description: 'Créé' } } } },
  '/quotes': { get: { tags: ['quotes'], summary: 'Devis', responses: { 200: { description: 'Liste' } } } },
  '/repairs': { get: { tags: ['repairs'], summary: 'Réparations', responses: { 200: { description: 'Liste' } } } },
  '/warranties': { get: { tags: ['warranties'], summary: 'Garanties', responses: { 200: { description: 'Liste' } } } },

  '/reviews': {
    get: { tags: ['reviews'], summary: 'Avis / évaluations', responses: { 200: { description: 'Avis' } } },
    post: { tags: ['reviews'], summary: 'Publier un avis', responses: { 201: { description: 'Avis créé' } } }
  },
  '/disputes': {
    get: { tags: ['disputes'], summary: 'Litiges', parameters: [P_STATUS, P_PAGE, P_PAGESIZE], responses: { 200: { description: 'Litiges' } } },
    post: { tags: ['disputes'], summary: 'Ouvrir un litige', responses: { 201: { description: 'Créé' } } }
  },

  '/parts': {
    get: { tags: ['parts'], summary: 'Catalogue pièces (q, category, vin, in_stock, page)', parameters: [P_Q, P_PAGE], responses: { 200: { description: 'Pièces + total' } } },
    post: { tags: ['parts'], summary: 'Créer une pièce (validation zod)', responses: { 201: { description: 'Créée' } } }
  },
  '/parts/orders': {
    get: { tags: ['orders'], summary: 'Commandes pièces (fournisseur => les siennes)', responses: { 200: { description: 'Commandes' } } },
    post: { tags: ['orders'], summary: 'Passer une commande', responses: { 201: { description: 'Crée' } } }
  },

  '/suppliers': { get: { tags: ['suppliers'], summary: 'Fournisseurs', responses: { 200: { description: 'Liste' } } } },

  '/payments/intent': { post: { tags: ['payments'], summary: 'Créer une intention de paiement', responses: { 200: { description: 'Intention' } } } },
  '/fleet': { get: { tags: ['fleet'], summary: 'Véhicules de flotte', responses: { 200: { description: 'Flotte' } } } },
  '/notifications': {
    get: { tags: ['notifications'], summary: 'Mes notifications', responses: { 200: { description: 'Notifications' } } }
  },

  '/admin/dashboard': { get: { tags: ['admin'], summary: 'Tableau de bord admin (ADMIN/SUPER_ADMIN)', responses: { 200: { description: 'Stats' }, 403: { description: 'Réservé admin' } } } },
  '/admin/settings': {
    get: { tags: ['admin'], summary: 'Paramètres plateforme', responses: { 200: { description: 'Paramètres' } } },
    patch: { tags: ['admin'], summary: 'Modifier les paramètres (permission admin.settings.manage)', responses: { 200: { description: 'Mis à jour' }, 403: { description: 'Permission requise' } } }
  },
  '/admin/audit-logs': { get: { tags: ['admin'], summary: 'Journal d\'audit (permission admin.audit.view)', responses: { 200: { description: 'Journal' }, 403: { description: 'Permission requise' } } } }
};

function buildOpenApi() {
  return {
    openapi: info.openapi,
    info: info.info,
    servers: info.servers,
    tags: info.tags,
    paths,
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  };
}

module.exports = { buildOpenApi, paths, info };