/**
 * Hydrogen T-Junction 3D Simulation Engine (Three.js)
 * Renders the 3D pipes, stress heatmaps, flow particles, and handles interactive camera/clipping.
 */

const Simulation = {
    // Canvas container
    container: null,
    
    // Three.js Core Objects
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    
    // Pipes & Geometry Meshes
    mainPipe: null,
    feederPipe: null,
    weldSeam: null,
    
    // Pipe Materials
    mainMaterial: null,
    feederMaterial: null,
    weldMaterial: null,

    // Particles System
    particles: [],
    particleGeometry: null,
    particleSystem: null,
    maxParticles: 800,
    
    // Clipping Plane (For cutaway)
    clippingPlane: null,
    isCutawayEnabled: false,
    
    // View state
    currentMode: 'combined', // 'combined', 'flow', 'stress'
    particleAnimationEnabled: true,
    
    // Dynamic physics inputs
    params: {
        tempMain: 390,
        tempFeeder: 82,
        velMain: 18.0,
        velFeeder: 4.6,
        maxStress: 224.5 // updated from physics calculations
    },

    /**
     * Initializes the Three.js Environment
     */
    init(containerId) {
        this.container = document.getElementById(containerId);
        
        // 1. Scene Setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0c10);
        this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.025);

        // 2. Camera Setup
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        this.camera.position.set(12, 8, 16);

        // 3. Renderer Setup
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Enable Local Clipping
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // clip front half (z > 0)
        this.renderer.localClippingEnabled = true;

        // 4. Orbit Controls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // limit camera going below ground plane
        this.controls.minDistance = 5;
        this.controls.maxDistance = 40;

        // 5. Lighting Setup
        this.setupLighting();

        // 6. Build Pipe Geometry
        this.buildPipes();

        // 7. Setup Flow Particle Engine
        this.setupParticles();

        // 8. Add Grid & Environment Accents
        this.buildEnvironment();

        // Window resize listener
        window.addEventListener('resize', () => this.onWindowResize());

        // Start render loop
        this.animate();
    },

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(ambientLight);

        // Main soft overhead directional light
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(5, 15, 10);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.bias = -0.001;
        this.scene.add(dirLight);

        // Cyberpunk style blue fill light from below
        const fillLight = new THREE.DirectionalLight(0x00a8ff, 0.4);
        fillLight.position.set(-5, -5, -5);
        this.scene.add(fillLight);

        // Orange accent point light near the hot junction
        const accentLight = new THREE.PointLight(0xff5500, 0.6, 12);
        accentLight.position.set(0, 2.5, 0);
        this.scene.add(accentLight);
    },

    /**
     * Constructs the 3D model of the T-junction pipes
     */
    buildPipes() {
        // Dimensions scaled:
        // Main Pipe (14"): Radius = 3.1, Length = 18.0
        // Feeder Pipe (4"): Radius = 1.0, Length = 7.0
        const mainRadius = 3.1;
        const mainLength = 18.0;
        const feederRadius = 1.0;
        const feederLength = 7.0;

        // Custom Shader Material for Stress Heatmap / Glass overlay
        // We will use Vertex Colors to dynamically color stress levels
        this.mainMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.2,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
            clippingPlanes: []
        });

        this.feederMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.2,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.75,
            clippingPlanes: []
        });

        // 1. Build Main Pipe (Horizontal, aligned along X-axis)
        // Cylinder arguments: radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded
        const mainGeo = new THREE.CylinderGeometry(mainRadius, mainRadius, mainLength, 64, 40, true);
        mainGeo.rotateZ(Math.PI / 2); // align with X-axis
        
        // Remove vertices where the branch pipe intersects to make a real cut hole
        // For visual simplicity in webgl, we'll keep the geometry intact, but color it appropriately
        // and adjust particles to turn correctly.

        this.mainPipe = new THREE.Mesh(mainGeo, this.mainMaterial);
        this.mainPipe.castShadow = true;
        this.mainPipe.receiveShadow = true;
        this.scene.add(this.mainPipe);

        // 2. Build Feeder Pipe (Vertical, aligned along Y-axis)
        // Base sits at y = mainRadius (3.1), extends upwards
        const feederGeo = new THREE.CylinderGeometry(feederRadius, feederRadius, feederLength, 48, 20, true);
        // Move vertical cylinder upwards so its bottom edge lies exactly on the main pipe wall
        feederGeo.translate(0, mainRadius + feederLength / 2, 0);

        this.feederPipe = new THREE.Mesh(feederGeo, this.feederMaterial);
        this.feederPipe.castShadow = true;
        this.feederPipe.receiveShadow = true;
        this.scene.add(this.feederPipe);

        // 3. Build Weld Seam Bead (Torus sit at the junction line)
        // Torus sits horizontally on top of the main cylinder
        // We scale the torus along Z to match the curved interface of the main cylinder
        const weldGeo = new THREE.TorusGeometry(feederRadius + 0.08, 0.15, 16, 64);
        weldGeo.rotateX(Math.PI / 2);
        weldGeo.translate(0, mainRadius, 0);
        
        this.weldMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.6,
            metalness: 0.5,
            transparent: true,
            opacity: 0.9,
            clippingPlanes: []
        });
        
        this.weldSeam = new THREE.Mesh(weldGeo, this.weldMaterial);
        // Deform torus vertices slightly to wrap onto the cylinder profile y = sqrt(R_m^2 - z^2)
        const pos = this.weldSeam.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const z = pos.getZ(i);
            const x = pos.getX(i);
            // Height at this z on the cylinder profile
            const targetY = Math.sqrt(mainRadius * mainRadius - z * z);
            // Weld coordinate offset: interpolate y towards the cylinder surface
            if (pos.getY(i) < mainRadius + 0.3) {
                pos.setY(i, targetY);
            }
        }
        this.weldSeam.geometry.computeVertexNormals();
        this.scene.add(this.weldSeam);

        // 4. Initial Coloring based on base stress profile
        this.updateStressHeatmapColors();
    },

    /**
     * Interpolates color mapping for Von Mises Stress Heatmap (Jet-like Jet Colormap)
     * s goes from 0.0 (low stress) to 1.0 (critical stress)
     */
    getColorForStress(s) {
        s = Math.max(0, Math.min(1, s));
        const color = new THREE.Color();
        
        // Colormap interpolation: Blue (0) -> Cyan (0.25) -> Green (0.5) -> Yellow (0.75) -> Red (1.0)
        if (s < 0.25) {
            // Blue to Cyan
            color.setRGB(0, s * 4, 1);
        } else if (s < 0.5) {
            // Cyan to Green
            color.setRGB(0, 1, 1 - (s - 0.25) * 4);
        } else if (s < 0.75) {
            // Green to Yellow
            color.setRGB((s - 0.5) * 4, 1, 0);
        } else {
            // Yellow to Red
            color.setRGB(1, 1 - (s - 0.75) * 4, 0);
        }
        
        return color;
    },

    /**
     * Recalculates vertex colors of the pipe meshes based on distance to junction crotch.
     * High stress concentrates at the weld fillet junction.
     */
    updateStressHeatmapColors() {
        const mainRadius = 3.1;
        const feederRadius = 1.0;
        
        // Maximum stress value relative to yield strength (250 MPa)
        const stressRatio = this.params.maxStress / 250.0;
        
        // 1. Color Main Pipe
        const mainPos = this.mainPipe.geometry.attributes.position;
        const mainColors = [];
        for (let i = 0; i < mainPos.count; i++) {
            const x = mainPos.getX(i);
            const y = mainPos.getY(i);
            const z = mainPos.getZ(i);
            
            // Distance on the cylinder surface to the junction opening (centered at x=0, z=0)
            const d = Math.sqrt(x*x + z*z);
            
            let stressVal = 0.05; // background minimal pressure stress
            
            if (d >= feederRadius) {
                // Decay of stress concentration as we move away from junction
                // Math.exp(-decayRate * distance)
                const decay = Math.exp(-0.85 * (d - feederRadius));
                
                // Crotch points (flanks vs saddle)
                // Crotch region (x=0, z=R_f) has highest stress, Saddle region (x=R_f, z=0) is slightly lower
                const angle = Math.atan2(z, x || 0.0001);
                const crotchFactor = 0.7 + 0.3 * Math.abs(Math.sin(angle * 2)); // peaks at crotches
                
                stressVal = 0.05 + 0.95 * decay * stressRatio * crotchFactor;
            } else {
                // inside opening (should theoretically be clipped or hollow, color max stress at rim)
                stressVal = stressRatio;
            }
            
            const color = this.getColorForStress(stressVal);
            mainColors.push(color.r, color.g, color.b);
        }
        this.mainPipe.geometry.setAttribute('color', new THREE.Float32BufferAttribute(mainColors, 3));
        this.mainPipe.geometry.attributes.color.needsUpdate = true;

        // 2. Color Feeder Pipe
        const feederPos = this.feederPipe.geometry.attributes.position;
        const feederColors = [];
        for (let i = 0; i < feederPos.count; i++) {
            const x = feederPos.getX(i);
            const y = feederPos.getY(i);
            const z = feederPos.getZ(i);
            
            // y goes from mainRadius (3.1) to mainRadius + 7.0 (10.1)
            const h = y - mainRadius; // height above weld
            
            // Stress concentration decays exponentially as we go up the branch
            const decay = Math.exp(-1.4 * h);
            
            // Crotch alignment on branch base
            const angle = Math.atan2(z, x || 0.0001);
            const crotchFactor = 0.7 + 0.3 * Math.abs(Math.sin(angle * 2));
            
            const stressVal = 0.03 + 0.97 * decay * stressRatio * crotchFactor;
            const color = this.getColorForStress(stressVal);
            feederColors.push(color.r, color.g, color.b);
        }
        this.feederPipe.geometry.setAttribute('color', new THREE.Float32BufferAttribute(feederColors, 3));
        this.feederPipe.geometry.attributes.color.needsUpdate = true;
        
        // 3. Weld Seam Bead Color matches maximum stress
        const maxStressColor = this.getColorForStress(stressRatio * 1.05); // weld has higher micro-stress
        this.weldMaterial.color.copy(maxStressColor);
    },

    /**
     * Particles Flow System representing cold and hot hydrogen gas mixing
     */
    setupParticles() {
        this.particleGeometry = new THREE.BufferGeometry();
        const positions = [];
        const colors = [];
        const sizes = [];
        
        // Define our custom particle structure
        this.particles = [];
        const mainRadius = 3.1;
        const feederRadius = 1.0;
        
        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.createParticle(mainRadius, feederRadius);
            this.particles.push(p);
            
            positions.push(p.pos.x, p.pos.y, p.pos.z);
            colors.push(p.color.r, p.color.g, p.color.b);
            sizes.push(p.size);
        }
        
        this.particleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.particleGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Custom circular glow texture for particles
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 16, 16);
        const texture = new THREE.CanvasTexture(canvas);
        
        // Points Material
        const particleMat = new THREE.PointsMaterial({
            size: 0.18,
            map: texture,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // Prevents black boxes overlaying
            vertexColors: true
        });
        
        this.particleSystem = new THREE.Points(this.particleGeometry, particleMat);
        this.scene.add(this.particleSystem);
    },

    /**
     * Spawns/creates a single flow particle
     */
    createParticle(mainRadius = 3.1, feederRadius = 1.0) {
        const p = {
            source: Math.random() < 0.65 ? 'main' : 'feeder', // 65% main pipe flow, 35% feeder
            pos: new THREE.Vector3(),
            vel: new THREE.Vector3(),
            color: new THREE.Color(),
            temp: 0,
            life: Math.random(), // random initial age progress
            speed: 0.05 + Math.random() * 0.05,
            size: 0.1 + Math.random() * 0.15,
            // radial positioning offsets inside pipes
            offsetRadius: 0,
            offsetAngle: 0
        };
        
        this.resetParticle(p, mainRadius, feederRadius);
        return p;
    },

    /**
     * Resets particle position and velocity based on flow source type
     */
    resetParticle(p, mainRadius = 3.1, feederRadius = 1.0) {
        p.life = 0;
        
        if (p.source === 'main') {
            // Starts at left end of main pipe (x = -9.0)
            p.offsetRadius = Math.random() * (mainRadius - 0.2);
            p.offsetAngle = Math.random() * Math.PI * 2;
            
            p.pos.set(
                -9.0, 
                p.offsetRadius * Math.sin(p.offsetAngle), 
                p.offsetRadius * Math.cos(p.offsetAngle)
            );
            
            p.temp = this.params.tempMain;
            p.color.setHex(0xff3300); // Hot red
            p.speed = (this.params.velMain * 0.01) * (0.8 + Math.random() * 0.4);
        } else {
            // Starts at top end of vertical feeder (y = 10.0)
            p.offsetRadius = Math.random() * (feederRadius - 0.1);
            p.offsetAngle = Math.random() * Math.PI * 2;
            
            p.pos.set(
                p.offsetRadius * Math.sin(p.offsetAngle), 
                10.0, 
                p.offsetRadius * Math.cos(p.offsetAngle)
            );
            
            p.temp = this.params.tempFeeder;
            p.color.setHex(0x00d2ff); // Cold cyan
            p.speed = (this.params.velFeeder * 0.01) * (0.8 + Math.random() * 0.4);
        }
    },

    /**
     * Physics based particle movement update
     */
    updateParticles() {
        if (!this.particleAnimationEnabled) return;
        
        const mainRadius = 3.1;
        const feederRadius = 1.0;
        
        const positions = this.particleGeometry.attributes.position.array;
        const colors = this.particleGeometry.attributes.color.array;
        
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.life += p.speed * 0.1;
            
            if (p.life >= 1.0) {
                this.resetParticle(p, mainRadius, feederRadius);
            }
            
            if (p.source === 'main') {
                // Flows horizontally: x goes from -9.0 to +9.0
                const currentX = -9.0 + p.life * 18.0;
                
                // In collision area near the vertical injector (x in [-feederRadius, feederRadius])
                // the flow profile is slightly pushed down by the incoming vertical stream
                let currentY = p.offsetRadius * Math.sin(p.offsetAngle);
                let currentZ = p.offsetRadius * Math.cos(p.offsetAngle);
                
                if (currentX > -feederRadius && currentX < feederRadius + 2.0) {
                    const mixImpact = Math.exp(-Math.pow(currentX - 0.5, 2));
                    // Pushed down slightly in Y depending on feeder velocity
                    if (currentY > 0) {
                        currentY -= mixImpact * (this.params.velFeeder / 10.0) * 0.8;
                    }
                    // Temperature cooling down as it mixes with the cold gas
                    const blend = mixImpact * (this.params.velFeeder / (this.params.velMain + 0.1)) * 0.5;
                    p.temp = this.params.tempMain - (this.params.tempMain - this.params.tempFeeder) * blend;
                }
                
                p.pos.set(currentX, currentY, currentZ);
                
                // Color interpolation based on local temp
                const tempRatio = (p.temp - this.params.tempFeeder) / (this.params.tempMain - this.params.tempFeeder || 1);
                // Heat color: transition from yellow-ish orange to hot red
                p.color.setHSL(0.02 + tempRatio * 0.08, 1.0, 0.5);
                
            } else {
                // Flows downwards from branch pipe, then turns right (into main flow)
                // We use a Bezier curve simulation for the turning path:
                // Start: (x_start, 10.0, z_start)
                // Down to branch interface y ~ 3.1
                // Transition path turning right (toward +x)
                if (p.life < 0.6) {
                    // Flowing straight down in feeder pipe
                    const progress = p.life / 0.6; // normalized 0 to 1
                    p.pos.set(
                        p.offsetRadius * Math.sin(p.offsetAngle),
                        10.0 - progress * (10.0 - mainRadius), // down to y = 3.1
                        p.offsetRadius * Math.cos(p.offsetAngle)
                    );
                    p.temp = this.params.tempFeeder;
                } else {
                    // Turning zone (mixing zone)
                    const progress = (p.life - 0.6) / 0.4; // normalized 0 to 1
                    
                    // Bezier curves bend toward +X
                    // Start point at branch base: (offset_x, mainRadius, offset_z)
                    // Control point: (offset_x, 1.5, offset_z)
                    // End point in main flow: (3.0 + progress * 6.0, offset_y_pushed, offset_z)
                    const t = progress;
                    const p0 = new THREE.Vector3(p.offsetRadius * Math.sin(p.offsetAngle), mainRadius, p.offsetRadius * Math.cos(p.offsetAngle));
                    const p1 = new THREE.Vector3(1.0, 1.2, 0.0);
                    const p2 = new THREE.Vector3(3.0 + t * 6.0, p.offsetRadius * Math.sin(p.offsetAngle) * 0.5, p.offsetRadius * Math.cos(p.offsetAngle) * 0.7);
                    
                    // Bezier formula: (1-t)^2 * p0 + 2(1-t)t * p1 + t^2 * p2
                    p.pos.x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
                    p.pos.y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
                    p.pos.z = Math.pow(1 - t, 2) * p0.z + 2 * (1 - t) * t * p1.z + Math.pow(t, 2) * p2.z;
                    
                    // Mixes and heats up as it flows down
                    p.temp = this.params.tempFeeder + (this.params.tempMain - this.params.tempFeeder) * t * 0.85;
                }
                
                // Color interpolation based on local temp (Blue/cyan to Purple/pink/orange)
                const tempRatio = (p.temp - this.params.tempFeeder) / (this.params.tempMain - this.params.tempFeeder || 1);
                // Cold cyan (0.55 HSL) to purple (0.8 HSL) to orange (0.05 HSL)
                let hue = 0.55 - tempRatio * 0.5;
                if (hue < 0) hue += 1.0;
                p.color.setHSL(hue, 1.0, 0.5);
            }
            
            // Update WebGL buffer arrays
            const idx = i * 3;
            positions[idx] = p.pos.x;
            positions[idx+1] = p.pos.y;
            positions[idx+2] = p.pos.z;
            
            colors[idx] = p.color.r;
            colors[idx+1] = p.color.g;
            colors[idx+2] = p.color.b;
        }
        
        this.particleGeometry.attributes.position.needsUpdate = true;
        this.particleGeometry.attributes.color.needsUpdate = true;
    },

    /**
     * Builds standard grid floor and structural highlights
     */
    buildEnvironment() {
        // Floor grid
        const gridHelper = new THREE.GridHelper(30, 30, 0x00e5ff, 0x1d2939);
        gridHelper.position.y = -5.0;
        gridHelper.material.opacity = 0.15;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);

        // Circular halo rings at inlet/outlets for tech aesthetic
        const inletRing1 = new THREE.Mesh(
            new THREE.TorusGeometry(3.1, 0.03, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.4 })
        );
        inletRing1.rotation.y = Math.PI / 2;
        inletRing1.position.x = -9.0;
        this.scene.add(inletRing1);

        const outletRing = new THREE.Mesh(
            new THREE.TorusGeometry(3.1, 0.03, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xff9500, transparent: true, opacity: 0.4 })
        );
        outletRing.rotation.y = Math.PI / 2;
        outletRing.position.x = 9.0;
        this.scene.add(outletRing);

        const feederRing = new THREE.Mesh(
            new THREE.TorusGeometry(1.0, 0.02, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.4 })
        );
        feederRing.rotation.x = Math.PI / 2;
        feederRing.position.y = 10.1;
        this.scene.add(feederRing);
    },

    /**
     * Changes rendering visual mode
     * @param {string} mode - 'combined', 'flow', 'stress'
     */
    setViewMode(mode) {
        this.currentMode = mode;
        
        if (mode === 'flow') {
            // Hide pipe walls (stress) or make them extremely transparent
            this.mainMaterial.opacity = 0.08;
            this.mainMaterial.wireframe = true;
            this.feederMaterial.opacity = 0.08;
            this.feederMaterial.wireframe = true;
            this.weldMaterial.opacity = 0.1;
            
            // Emphasize particles
            this.particleSystem.visible = true;
        } else if (mode === 'stress') {
            // Show solid pipe walls with stress coloring
            this.mainMaterial.opacity = 0.95;
            this.mainMaterial.wireframe = false;
            this.feederMaterial.opacity = 0.95;
            this.feederMaterial.wireframe = false;
            this.weldMaterial.opacity = 1.0;
            
            // Hide fluid particles
            this.particleSystem.visible = false;
        } else {
            // Combined View (translucent stress coloring + particle flow)
            this.mainMaterial.opacity = 0.55;
            this.mainMaterial.wireframe = false;
            this.feederMaterial.opacity = 0.55;
            this.feederMaterial.wireframe = false;
            this.weldMaterial.opacity = 0.8;
            
            this.particleSystem.visible = true;
        }
    },

    /**
     * Enable/Disable cutaway view (clipping plane)
     */
    toggleCutaway(enabled) {
        this.isCutawayEnabled = enabled;
        
        if (enabled) {
            this.mainMaterial.clippingPlanes = [this.clippingPlane];
            this.feederMaterial.clippingPlanes = [this.clippingPlane];
            this.weldMaterial.clippingPlanes = [this.clippingPlane];
        } else {
            this.mainMaterial.clippingPlanes = [];
            this.feederMaterial.clippingPlanes = [];
            this.weldMaterial.clippingPlanes = [];
        }
    },

    /**
     * Update operating parameters dynamically
     */
    updateParameters(inputs, currentMaxStress) {
        this.params.tempMain = inputs.tempMain;
        this.params.tempFeeder = inputs.tempFeeder;
        this.params.velMain = inputs.velMain;
        this.params.velFeeder = inputs.velFeeder;
        this.params.maxStress = currentMaxStress;
        
        // Re-color pipe walls to reflect new stress levels
        this.updateStressHeatmapColors();
    },

    onWindowResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    },

    /**
     * Animation Loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Update controls (damping requires this)
        if (this.controls) this.controls.update();
        
        // Update fluid particles positions and temperature coloring
        this.updateParticles();
        
        // Render scene
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
};
