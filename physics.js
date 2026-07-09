/**
 * Hydrogen T-Junction Physics Engine
 * Performs engineering calculations for fluid mixing, thermal strain, 
 * local stress distribution, and fatigue life.
 */

const PhysicsEngine = {
    // Material Properties (e.g., Grade 304 Stainless Steel / Carbon Steel at High Temp)
    material: {
        E: 185000,           // Young's Modulus (MPa)
        alpha: 1.25e-5,      // Thermal Expansion Coefficient (1/C)
        nu: 0.3,             // Poisson's Ratio
        yieldStrength: 250,  // Yield Strength (MPa)
        tensileStrength: 515,// Ultimate Tensile Strength (MPa)
    },

    // Pipe Dimensions (in mm)
    dimensions: {
        mainDo: 355.6,       // 14" NPS outer diameter
        mainT: 15.0,         // Wall thickness
        feederDo: 114.3,     // 4" NPS outer diameter
        feederT: 6.02,       // Wall thickness
    },

    /**
     * Calculates pressure stress (hoop stress) in MPa
     * @param {number} press_kgcm2 - Pressure in kg/cm2
     * @param {number} D_o - Outer diameter in mm
     * @param {number} t - Thickness in mm
     * @returns {number} hoop stress in MPa
     */
    calcHoopStress(press_kgcm2, D_o, t) {
        // Convert kg/cm2 to MPa (1 kg/cm2 = 0.0980665 MPa)
        const P = press_kgcm2 * 0.0980665;
        const D_i = D_o - 2 * t;
        return (P * D_i) / (2 * t);
    },

    /**
     * Calculates the thermal strain
     * @param {number} dT - Temperature difference in C
     */
    calcThermalStrain(dT) {
        return this.material.alpha * dT;
    },

    /**
     * Calculates Von Mises stress at the T-junction weld fillet
     * @param {object} inputs - { pressMain, pressFeeder, tempMain, tempFeeder, velMain, velFeeder }
     * @returns {object} calculated metrics
     */
    calculateJunctionMetrics(inputs) {
        const { pressMain, pressFeeder, tempMain, tempFeeder, velMain, velFeeder } = inputs;

        // 1. Temperature Delta
        const dT = Math.abs(tempMain - tempFeeder);

        // 2. Base mechanical stresses (Hoop Stress)
        const sigmaHoopMain = this.calcHoopStress(pressMain, this.dimensions.mainDo, this.dimensions.mainT);
        const sigmaHoopFeeder = this.calcHoopStress(pressFeeder, this.dimensions.feederDo, this.dimensions.feederT);

        // Stress Concentration Factor (SCF) at T-junction crotch
        // Integrating both main run stress and branch feeder stress contributions
        const K_t_main = 2.4;
        const K_t_feeder = 1.2;
        const stressPressureLocal = (sigmaHoopMain * K_t_main) + (sigmaHoopFeeder * K_t_feeder);

        // 3. Thermal Stress
        // Localized thermal stress: sigma_th = E * alpha * dT / (1 - nu) * K_constraint
        // K_constraint represents constraint factor of the T-joint geometry (typically 0.3 - 0.5)
        const K_constraint = 0.38;
        const thermalStrain = this.calcThermalStrain(dT);
        const stressThermalLocal = (this.material.E * thermalStrain / (1 - this.material.nu)) * K_constraint;

        // Influence of flow velocity on thermal stress:
        // High mixing velocities increase heat transfer coefficient, intensifying local thermal gradient
        const velocityMixingRatio = (velMain + velFeeder) / 22.6; // normalized around nominal 18+4.6
        const velocityEffectFactor = 0.9 + 0.15 * Math.sqrt(velocityMixingRatio);
        const finalThermalStress = stressThermalLocal * velocityEffectFactor;

        // 4. Combined Von Mises Stress (Interaction of thermal & mechanical load)
        // At the crotch, pressure load (tensile) and thermal constraint load (compressive at hot side, tensile at cold) interact
        const maxStress = Math.sqrt(
            Math.pow(stressPressureLocal, 2) + 
            Math.pow(finalThermalStress, 2) + 
            1.1 * stressPressureLocal * finalThermalStress
        );

        // 5. Fatigue Life Estimation (ASME boiler & pressure vessel curve / Coffin-Manson relation)
        // Cycles to failure: Nf = (C / stress)^m
        let fatigueCycles = 1e7; // default infinite-ish
        if (maxStress > 50) {
            // Simplified fatigue curve parameters calibrated for weld joints
            const C = 2800; 
            const m = 4.2;
            fatigueCycles = Math.round(Math.pow(C / maxStress, m));
            // Cap it realistically
            fatigueCycles = Math.max(500, Math.min(250000, fatigueCycles));
        }

        return {
            dT,
            hoopMain: sigmaHoopMain,
            hoopFeeder: sigmaHoopFeeder,
            thermalStrain,
            stressPressureLocal,
            stressThermalLocal: finalThermalStress,
            maxStress,
            fatigueCycles
        };
    },

    /**
     * Generates profile distribution data along the weld boundary line
     * @param {object} metrics - The calculated metrics from calculateJunctionMetrics
     * @param {object} inputs - Input values
     * @returns {object} { labels, tempProfile, stressProfile }
     */
    generateWeldProfileData(metrics, inputs) {
        const { tempMain, tempFeeder, velMain, velFeeder } = inputs;
        const pointsCount = 31;
        const labels = [];
        const tempProfile = [];
        const stressProfile = [];

        // Weld path represents arc from -180 deg to +180 deg around the branch pipe junction
        for (let i = 0; i < pointsCount; i++) {
            const angleDeg = -180 + (i / (pointsCount - 1)) * 360;
            labels.push(`${angleDeg.toFixed(0)}°`);

            // Position multiplier (0 is the crotch, +/- 180 is the flank/side)
            // Crotch point (0° and 180°) experiences maximum stress concentration
            const isCrotch = Math.abs(Math.sin(angleDeg * Math.PI / 180)); // 0 at crotch, 1 at flank
            const crotchEffect = 1 - isCrotch; // 1 at crotch, 0 at flank

            // Temperature distribution: Cold fluid injection primarily affects the crotch region 
            // depending on feeder velocity.
            const coolingCoverage = Math.max(0.1, Math.min(0.9, velFeeder / (velMain + 0.1)));
            const localTempCooling = Math.exp(-Math.pow(angleDeg / (60 * coolingCoverage), 2)); // Gaussian cooling shape
            const localTemp = tempMain - (tempMain - tempFeeder) * localTempCooling;
            tempProfile.push(parseFloat(localTemp.toFixed(1)));

            // Local stress profile: Peaks at crotches due to geometry and high thermal gradient
            const localStressPress = metrics.stressPressureLocal * (0.6 + 0.4 * crotchEffect);
            const localStressTemp = metrics.stressThermalLocal * (0.4 + 0.6 * localTempCooling);
            const localStress = Math.sqrt(
                Math.pow(localStressPress, 2) + 
                Math.pow(localStressTemp, 2) + 
                1.0 * localStressPress * localStressTemp
            );
            
            // Add slight spatial noise to simulate weld mesh variations
            const noise = (Math.sin(i * 1.5) * 0.02);
            stressProfile.push(parseFloat((localStress * (1 + noise)).toFixed(1)));
        }

        return { labels, tempProfile, stressProfile };
    }
};
