/**
 * Hydrogen T-Junction App Coordinator
 * Manages UI interactions, dynamic parameter calculations, and analytical charts.
 */

const App = {
    chart: null,
    
    // UI elements references
    el: {
        // Pressures
        sliderPressMain: null,
        sliderPressFeeder: null,
        valPressMain: null,
        valPressFeeder: null,
        
        // Temperatures
        sliderTempMain: null,
        sliderTempFeeder: null,
        valTempMain: null,
        valTempFeeder: null,
        valTempDelta: null,
        
        // Velocities
        sliderVelMain: null,
        sliderVelFeeder: null,
        valVelMain: null,
        valVelFeeder: null,
        
        // View controls
        btnModeCombined: null,
        btnModeFlow: null,
        btnModeStress: null,
        checkCutaway: null,
        checkParticles: null,
        
        // Metrics
        metricMaxStress: null,
        metricStressStatus: null,
        metricStrain: null,
        metricFatigue: null,
        
        // Legend
        legendTitle: null,
        legendBar: null,
        legendMin: null,
        legendMax: null
    },

    /**
     * App Startup
     */
    init() {
        this.cacheElements();
        this.bindEvents();
        
        // Initialize 3D Simulation
        Simulation.init('canvas-container');
        
        // Initialize 2D Chart
        this.initChart();
        
        // Run initial calculations and update UI
        this.updateSimulation();
    },

    cacheElements() {
        // Pressures
        this.el.sliderPressMain = document.getElementById('slider-press-main');
        this.el.sliderPressFeeder = document.getElementById('slider-press-feeder');
        this.el.valPressMain = document.getElementById('val-press-main');
        this.el.valPressFeeder = document.getElementById('val-press-feeder');
        
        // Temperatures
        this.el.sliderTempMain = document.getElementById('slider-temp-main');
        this.el.sliderTempFeeder = document.getElementById('slider-temp-feeder');
        this.el.valTempMain = document.getElementById('val-temp-main');
        this.el.valTempFeeder = document.getElementById('val-temp-feeder');
        this.el.valTempDelta = document.getElementById('val-temp-delta');
        
        // Velocities
        this.el.sliderVelMain = document.getElementById('slider-vel-main');
        this.el.sliderVelFeeder = document.getElementById('slider-vel-feeder');
        this.el.valVelMain = document.getElementById('val-vel-main');
        this.el.valVelFeeder = document.getElementById('val-vel-feeder');
        
        // Buttons & Toggles
        this.el.btnModeCombined = document.getElementById('btn-mode-combined');
        this.el.btnModeFlow = document.getElementById('btn-mode-flow');
        this.el.btnModeStress = document.getElementById('btn-mode-stress');
        this.el.checkCutaway = document.getElementById('check-cutaway');
        this.el.checkParticles = document.getElementById('check-particles');
        
        // Metrics
        this.el.metricMaxStress = document.getElementById('metric-max-stress');
        this.el.metricStressStatus = document.getElementById('metric-stress-status');
        this.el.metricStrain = document.getElementById('metric-strain');
        this.el.metricFatigue = document.getElementById('metric-fatigue');
        
        // Legend
        this.el.legendTitle = document.getElementById('legend-title');
        this.el.legendBar = document.querySelector('.legend-color-bar');
        this.el.legendMin = document.getElementById('legend-min-val');
        this.el.legendMax = document.getElementById('legend-max-val');
    },

    bindEvents() {
        // Slider listeners
        const sliders = [
            this.el.sliderPressMain, this.el.sliderPressFeeder,
            this.el.sliderTempMain, this.el.sliderTempFeeder,
            this.el.sliderVelMain, this.el.sliderVelFeeder
        ];
        
        sliders.forEach(slider => {
            slider.addEventListener('input', () => {
                this.updateSliderDisplays();
                this.updateSimulation();
            });
        });

        // Mode selector clicks
        this.el.btnModeCombined.addEventListener('click', () => this.switchViewMode('combined'));
        this.el.btnModeFlow.addEventListener('click', () => this.switchViewMode('flow'));
        this.el.btnModeStress.addEventListener('click', () => this.switchViewMode('stress'));
        
        // Checkboxes
        this.el.checkCutaway.addEventListener('change', (e) => {
            Simulation.toggleCutaway(e.target.checked);
        });
        
        this.el.checkParticles.addEventListener('change', (e) => {
            Simulation.particleAnimationEnabled = e.target.checked;
        });
    },

    updateSliderDisplays() {
        this.el.valPressMain.textContent = `${parseFloat(this.el.sliderPressMain.value).toFixed(1)} kg/cm²`;
        this.el.valPressFeeder.textContent = `${parseFloat(this.el.sliderPressFeeder.value).toFixed(1)} kg/cm²`;
        
        this.el.valTempMain.textContent = `${this.el.sliderTempMain.value} °C`;
        this.el.valTempFeeder.textContent = `${this.el.sliderTempFeeder.value} °C`;
        
        const dT = Math.abs(this.el.sliderTempMain.value - this.el.sliderTempFeeder.value);
        this.el.valTempDelta.textContent = `${dT} °C`;
        
        this.el.valVelMain.textContent = `${parseFloat(this.el.sliderVelMain.value).toFixed(1)} m/s`;
        this.el.valVelFeeder.textContent = `${parseFloat(this.el.sliderVelFeeder.value).toFixed(1)} m/s`;
    },

    switchViewMode(mode) {
        // Update button active state
        [this.el.btnModeCombined, this.el.btnModeFlow, this.el.btnModeStress].forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (mode === 'combined') {
            this.el.btnModeCombined.classList.add('active');
            this.el.legendTitle.textContent = "Stress Distribution (MPa)";
            this.el.legendBar.className = "legend-color-bar stress-gradient";
            this.el.legendMin.textContent = "0 MPa";
            this.el.legendMax.textContent = "280 MPa";
        } else if (mode === 'flow') {
            this.el.btnModeFlow.classList.add('active');
            this.el.legendTitle.textContent = "Fluid Temperature (°C)";
            this.el.legendBar.className = "legend-color-bar temp-gradient";
            this.el.legendMin.textContent = `${this.el.sliderTempFeeder.value}°C (Cold)`;
            this.el.legendMax.textContent = `${this.el.sliderTempMain.value}°C (Hot)`;
        } else if (mode === 'stress') {
            this.el.btnModeStress.classList.add('active');
            this.el.legendTitle.textContent = "Stress Distribution (MPa)";
            this.el.legendBar.className = "legend-color-bar stress-gradient";
            this.el.legendMin.textContent = "0 MPa";
            this.el.legendMax.textContent = "280 MPa";
        }
        
        // Update simulation
        Simulation.setViewMode(mode);
    },

    /**
     * Computes math equations, updates metrics in UI, updates chart and updates 3D view.
     */
    updateSimulation() {
        const inputs = {
            pressMain: parseFloat(this.el.sliderPressMain.value),
            pressFeeder: parseFloat(this.el.sliderPressFeeder.value),
            tempMain: parseInt(this.el.sliderTempMain.value, 10),
            tempFeeder: parseInt(this.el.sliderTempFeeder.value, 10),
            velMain: parseFloat(this.el.sliderVelMain.value),
            velFeeder: parseFloat(this.el.sliderVelFeeder.value)
        };

        // 1. Calculate physics metrics
        const metrics = PhysicsEngine.calculateJunctionMetrics(inputs);

        // 2. Update UI metric cards
        this.el.metricMaxStress.textContent = `${metrics.maxStress.toFixed(1)} MPa`;
        this.el.metricStrain.textContent = `${(metrics.thermalStrain * 100).toFixed(3)} %`;
        
        // Calibrate yields warnings
        const yieldStrength = PhysicsEngine.material.yieldStrength; // 250 MPa
        if (metrics.maxStress >= yieldStrength) {
            this.el.metricMaxStress.className = "metric-val text-red";
            this.el.metricStressStatus.textContent = "CRITICAL: Plastic Deformation (Yielded)";
            this.el.metricStressStatus.style.color = "var(--red)";
        } else if (metrics.maxStress >= yieldStrength * 0.8) {
            this.el.metricMaxStress.className = "metric-val text-orange";
            this.el.metricStressStatus.textContent = "Caution: Yield Limit Exceeded (Safe: < 80%)";
            this.el.metricStressStatus.style.color = "var(--orange)";
        } else {
            this.el.metricMaxStress.className = "metric-val text-green";
            this.el.metricStressStatus.textContent = "Optimal: elastic deformation zone";
            this.el.metricStressStatus.style.color = "var(--green)";
        }

        // Fatigue cycle formatting
        if (metrics.fatigueCycles >= 100000) {
            this.el.metricFatigue.textContent = "> 100,000 Cycles";
            this.el.metricFatigue.className = "metric-val text-green";
            const sub = this.el.metricFatigue.nextElementSibling;
            sub.innerHTML = `<i class="fa-solid fa-circle-check"></i> Low Thermal Fatigue Risk`;
            sub.className = "metric-sub text-green";
        } else if (metrics.fatigueCycles > 10000) {
            this.el.metricFatigue.textContent = `${metrics.fatigueCycles.toLocaleString()} Cycles`;
            this.el.metricFatigue.className = "metric-val text-yellow";
            const sub = this.el.metricFatigue.nextElementSibling;
            sub.innerHTML = `<i class="fa-solid fa-circle-info"></i> Medium Thermal Fatigue Risk`;
            sub.className = "metric-sub text-yellow";
        } else {
            this.el.metricFatigue.textContent = `${metrics.fatigueCycles.toLocaleString()} Cycles`;
            this.el.metricFatigue.className = "metric-val text-red";
            const sub = this.el.metricFatigue.nextElementSibling;
            sub.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> High Risk: Thermal fatigue failure predicted`;
            sub.className = "metric-sub text-red-light";
        }

        // 3. Update Legend text if temperature mode
        if (this.currentMode === 'flow') {
            this.el.legendMin.textContent = `${inputs.tempFeeder}°C (Cold)`;
            this.el.legendMax.textContent = `${inputs.tempMain}°C (Hot)`;
        }

        // 4. Update 2D Profile Chart
        const profile = PhysicsEngine.generateWeldProfileData(metrics, inputs);
        this.updateChart(profile);

        // 5. Update 3D Visualizer variables
        Simulation.updateParameters({
            tempMain: inputs.tempMain,
            tempFeeder: inputs.tempFeeder,
            velMain: inputs.velMain,
            velFeeder: inputs.velFeeder
        }, metrics.maxStress);
    },

    initChart() {
        const ctx = document.getElementById('profile-chart').getContext('2d');
        
        // Chart configuration with dual Y-axes
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Von Mises Stress (MPa)',
                        yAxisID: 'yStress',
                        data: [],
                        borderColor: '#ff9100',
                        borderWidth: 2,
                        backgroundColor: 'rgba(255, 145, 0, 0.05)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 0,
                    },
                    {
                        label: 'Metal Temp (°C)',
                        yAxisID: 'yTemp',
                        data: [],
                        borderColor: '#00e5ff',
                        borderWidth: 2,
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.3,
                        pointRadius: 0,
                        borderDash: [4, 4]
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#98a2b3',
                            font: { size: 9, family: 'Inter' },
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(10, 12, 16, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#98a2b3',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.02)' },
                        ticks: {
                            color: '#667085',
                            font: { size: 8, family: 'JetBrains Mono' },
                            maxTicksLimit: 7
                        }
                    },
                    yStress: {
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: {
                            color: '#98a2b3',
                            font: { size: 8, family: 'JetBrains Mono' },
                            callback: value => `${value} MPa`
                        },
                        min: 0,
                        max: 300
                    },
                    yTemp: {
                        position: 'right',
                        grid: { drawOnChartArea: false }, // avoid duplicate gridlines
                        ticks: {
                            color: '#98a2b3',
                            font: { size: 8, family: 'JetBrains Mono' },
                            callback: value => `${value}°C`
                        },
                        min: 0,
                        max: 500
                    }
                }
            }
        });
    },

    updateChart(profileData) {
        if (!this.chart) return;
        
        this.chart.data.labels = profileData.labels;
        this.chart.data.datasets[0].data = profileData.stressProfile;
        this.chart.data.datasets[1].data = profileData.tempProfile;
        
        // Dynamically adjust scale limits based on inputs
        const currentMaxTemp = parseInt(this.el.sliderTempMain.value, 10);
        this.chart.options.scales.yTemp.max = Math.max(200, Math.ceil(currentMaxTemp / 100) * 100);
        
        const currentMaxStress = parseFloat(this.el.metricMaxStress.textContent);
        this.chart.options.scales.yStress.max = Math.max(100, Math.ceil(currentMaxStress / 50) * 50 + 50);
        
        this.chart.update('none'); // silent update without resetting animation transition
    }
};

// Start the application on window load
window.addEventListener('DOMContentLoaded', () => App.init());
