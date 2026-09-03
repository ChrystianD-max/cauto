const db = require('../db');

async function matchProfessionals(serviceRequestId, profileName = 'STANDARD') {
    const profile = await db.one(
        'SELECT * FROM matching_profiles WHERE name = $1',
        [profileName]
    );

    const sr = await db.one(
        `SELECT sr.*, v.make, v.model, v.year 
         FROM service_requests sr 
         JOIN vehicles v ON sr.vehicle_id = v.id 
         WHERE sr.id = $1`,
        [serviceRequestId]
    );

    const professionals = await db.many(
        `SELECT p.*, u.name 
         FROM professionals p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.is_active = true`
    );

    const results = [];

    for (const pro of professionals) {
        let brandScore = 0;
        try {
            const brandMatch = await db.one(
                'SELECT COUNT(*) as cnt FROM professional_brands WHERE professional_id = $1 AND (brand = $2 OR brand = $3)',
                [pro.id, sr.make, 'Toutes marques']
            );
            if (parseInt(brandMatch.cnt) > 0) {
                const exactMatch = await db.one(
                    'SELECT COUNT(*) as cnt FROM professional_brands WHERE professional_id = $1 AND brand = $2',
                    [pro.id, sr.make]
                );
                brandScore = parseInt(exactMatch.cnt) > 0 ? 100 : 30;
            }
        } catch (e) {
            brandScore = 0;
        }

        let problemScore = 20;
        try {
            const services = await db.many(
                'SELECT category FROM professional_services WHERE professional_id = $1',
                [pro.id]
            );
            for (const svc of services) {
                if (svc.category === sr.category) {
                    problemScore = 100;
                    break;
                } else if (svc.category && sr.category && 
                    (svc.category.toLowerCase().includes(sr.category.toLowerCase()) || 
                     sr.category.toLowerCase().includes(svc.category.toLowerCase()))) {
                    problemScore = 50;
                }
            }
        } catch (e) {
            problemScore = 20;
        }

        const qualityScore = (pro.rating / 5.0) * 100;
        const satisfactionScore = pro.satisfaction_rate || 0;
        const delayScore = Math.max(0, 100 - ((pro.avg_delay_days || 0) * 10));

        let priceScore = 50;
        try {
            const avgPrice = await db.one(
                'SELECT COALESCE(AVG(price), 0) as avg_price FROM professional_services WHERE professional_id = $1',
                [pro.id]
            );
            const allPrices = await db.many(
                'SELECT COALESCE(AVG(price), 0) as avg_price FROM professional_services GROUP BY professional_id'
            );
            if (allPrices.length > 0) {
                const minPrice = Math.min(...allPrices.map(p => parseFloat(p.avg_price)));
                const maxPrice = Math.max(...allPrices.map(p => parseFloat(p.avg_price)));
                const proAvgPrice = parseFloat(avgPrice.avg_price);
                if (maxPrice > minPrice) {
                    priceScore = 100 - ((proAvgPrice - minPrice) / (maxPrice - minPrice) * 100);
                } else {
                    priceScore = 50;
                }
            }
        } catch (e) {
            priceScore = 50;
        }

        let distanceScore = 50;
        if (pro.latitude && pro.longitude && sr.latitude && sr.longitude) {
            const distance = Math.sqrt(
                Math.pow(pro.latitude - sr.latitude, 2) + 
                Math.pow(pro.longitude - sr.longitude, 2)
            );
            distanceScore = Math.max(0, 100 - distance * 10);
        }

        const finalScore = (
            (profile.weight_brand * brandScore) +
            (profile.weight_problem * problemScore) +
            (profile.weight_quality * qualityScore) +
            (profile.weight_satisfaction * satisfactionScore) +
            (profile.weight_delay * delayScore) +
            (profile.weight_price * priceScore) +
            (profile.weight_distance * distanceScore)
        );

        results.push({
            professional_id: pro.id,
            professional_name: pro.name,
            specialty: pro.specialty,
            city: pro.city,
            rating: pro.rating,
            is_certified: !!pro.is_certified,
            score: Math.round(finalScore * 100) / 100,
            match_details: {
                brand: Math.round(brandScore * 100) / 100,
                problem: Math.round(problemScore * 100) / 100,
                quality: Math.round(qualityScore * 100) / 100,
                satisfaction: Math.round(satisfactionScore * 100) / 100,
                delay: Math.round(delayScore * 100) / 100,
                price: Math.round(priceScore * 100) / 100,
                distance: Math.round(distanceScore * 100) / 100
            }
        });
    }

    results.sort((a, b) => b.score - a.score);

    return results;
}

async function getMatchingProfiles() {
    return await db.many('SELECT * FROM matching_profiles');
}

async function updateMatchingProfile(id, weights) {
    const { weight_brand, weight_problem, weight_quality, weight_satisfaction, weight_delay, weight_price, weight_distance } = weights;
    
    await db.query(
        `UPDATE matching_profiles 
         SET weight_brand = $1, weight_problem = $2, weight_quality = $3, 
             weight_satisfaction = $4, weight_delay = $5, weight_price = $6, 
             weight_distance = $7, updated_at = NOW()
         WHERE id = $8`,
        [weight_brand, weight_problem, weight_quality, weight_satisfaction, weight_delay, weight_price, weight_distance, id]
    );
    
    return await db.one('SELECT * FROM matching_profiles WHERE id = $1', [id]);
}

async function calculateScore(professionalId, serviceRequestId, profileName = 'STANDARD') {
    const matches = await matchProfessionals(serviceRequestId, profileName);
    const match = matches.find(m => m.professional_id === professionalId);
    
    if (!match) {
        throw new Error('Professionnel non trouve');
    }
    
    return match;
}

module.exports = {
    matchProfessionals,
    getMatchingProfiles,
    updateMatchingProfile,
    calculateScore
};
