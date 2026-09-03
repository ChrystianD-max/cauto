const express = require('express');

const vehicleInsights = require('./vehicleInsights');
const reviewMedia = require('./reviewMedia');
const maintenanceReminders = require('./maintenanceReminders');
const sos = require('./sos');
const servicePlans = require('./servicePlans');
const ecoMobility = require('./ecoMobility');

const router = express.Router();

// #5+7 Passeport QR + Estimation valeur — route publique passport/view sert ici
router.use('/vehicle-insights', vehicleInsights);
// #1 Avis photo/vidéo vérifiés
router.use('/reviews', reviewMedia);
// #2 Rappels maintenance proactifs
router.use('/maintenance-reminders', maintenanceReminders);
// #3 Assistance SOS
router.use('/sos', sos);
// #4 Forfaits d'entretien
router.use('/service-plans', servicePlans);
// #6 Recharge électrique & mobilité verte
router.use('/eco-mobility', ecoMobility);

module.exports = router;