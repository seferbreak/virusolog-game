import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export function initGame() {
    // --- КОНФИГУРАЦИЯ ИГРЫ ---
    let playerHealth = 300;
    let playerAmmo = 100;
    let hasKeycard = false;
    let gameWon = false;
    let isPaused = true; 
    
    const tileSize = 16.0; 
    const wallHeight = 12.0; 
    const playerRadius = 1.0;

    // Определение сенсорного устройства
    let isMobileMode = true; // Всегда мобильный режим

    // --- КАРТА ЛАБОРАТОРИИ (УМЕНЬШЕНА НА 60%) ---
    const MAP = [
        "WWWWWWWWWWWWWWW",
        "WP..B.M.......W",
        "W.W.WWWWWWW.W.W",
        "W.W.K.....W.W.W",
        "W.W.W.WWW.W.M.W",
        "W.M.W.A.W.W.W.W",
        "W.W.W.W.W.W.W.W",
        "W.W.L.W.N.W.W.W",
        "W.WWWWWWW.W.W.W",
        "W.M...L..H..W.W",
        "WWWWWWWWWWWWW.W",
        "W...M...H...N.E",
        "WWWWWWWWWWWWWWW"
    ];

    let scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer;
    let yawObject: THREE.Object3D, pitchObject: THREE.Object3D;
    let walls: THREE.Mesh[] = [];
    let mutants: THREE.Group[] = [];
    let items: (THREE.Mesh | THREE.PointLight)[] = [];
    let smokeParticles: THREE.Mesh[] = [];
    let flashLight: THREE.SpotLight, flashLightCenter: THREE.SpotLight, muzzleFlash: THREE.PointLight, gunSprite: THREE.Sprite;
    const raycaster = new THREE.Raycaster();
    
    // Ввод от клавиатуры
    let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
    
    // Ввод от виртуального джойстика
    let joystick = { x: 0, y: 0 };
    let isSprinting = false; 

    const velocity = new THREE.Vector3();
    let bobTimer = 0;
    
    let audioCtx: AudioContext | null = null;
    let noiseBuffer: AudioBuffer | null = null;
    
    let mutantTemplate: THREE.Group | null = null; 
    let newEnemyTemplate: THREE.Group | null = null;
    let newEnemies: THREE.Group[] = [];
    let newEnemyAnimations: { [key: string]: THREE.AnimationClip } = {};
    let newEnemyMixers: THREE.AnimationMixer[] = [];
    let modelsLoaded = false;
    
    const GUN_BASE_X = 0.15;
    const GUN_BASE_Y = -0.20;
    let isRecoiling = false; 

    // ДОБАВЛЕНО: сохраняем стартовую позицию игрока для рестарта
    let startPosition = new THREE.Vector3();

    let animationId: number;
    let isCleanedUp = false;

    // Настройка текста старта в зависимости от устройства
    const ctrlDesc = document.getElementById('controls-desc');
    if (ctrlDesc) {
        ctrlDesc.innerText = "Управление: Джойстик для ходьбы | Свайп по экрану для обзора";
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050608); 
    scene.fog = new THREE.FogExp2(0x050608, 0.012);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    
    pitchObject = new THREE.Object3D();
    pitchObject.add(camera);
    yawObject = new THREE.Object3D();
    yawObject.add(pitchObject);
    scene.add(yawObject);

    const targetHeight = 240;
    const aspect = window.innerWidth / window.innerHeight;
    
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(targetHeight * aspect, targetHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    
    const uiScaler = document.getElementById('ui-scaler');
    if (uiScaler) {
        const scale = window.innerHeight / targetHeight;
        const internalWidth = Math.ceil(targetHeight * aspect);
        uiScaler.style.width = `${internalWidth}px`;
        uiScaler.style.height = `${targetHeight}px`;
        const scaledWidth = internalWidth * scale;
        const offsetX = (window.innerWidth - scaledWidth) / 2;
        uiScaler.style.transform = `translate(${offsetX}px, 0px) scale(${scale})`;
        uiScaler.style.transformOrigin = 'top left';
    }
    
    const container = document.getElementById('game-container');
    if (container) {
        container.innerHTML = ''; // Clear previous
        container.appendChild(renderer.domElement);
    }

    scene.add(new THREE.AmbientLight(0x444a55, 0.6));

    flashLight = new THREE.SpotLight(0xfff5e6, 100, 150, Math.PI / 2.8, 0.6, 2);
    flashLight.position.set(0, 0, 0);
    flashLight.target.position.set(0, 0, -1);
    camera.add(flashLight);
    camera.add(flashLight.target);

    flashLightCenter = new THREE.SpotLight(0xffffff, 350, 200, Math.PI / 9, 0.3, 2);
    flashLightCenter.position.set(0, 0, 0);
    flashLightCenter.target.position.set(0, 0, -1);
    camera.add(flashLightCenter);
    camera.add(flashLightCenter.target);

    const imageUrl = 'https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%209%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2016_45_14.png';
    
    const gunTexture = new THREE.TextureLoader().load(imageUrl, undefined, undefined, () => {
        console.error("ОШИБКА: Не удалось загрузить картинку оружия.");
    });
    
    const gunMaterial = new THREE.SpriteMaterial({ map: gunTexture, color: 0xa3a3a3, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    gunSprite = new THREE.Sprite(gunMaterial);
    
    gunSprite.position.set(GUN_BASE_X, GUN_BASE_Y, -0.5); 
    gunSprite.scale.set(0.737, 0.564, 1); 
    gunSprite.renderOrder = 999;
    camera.add(gunSprite);

    muzzleFlash = new THREE.PointLight(0xffaa00, 0, 30, 2);
    muzzleFlash.position.set(0.2, 0.1, -0.6);
    camera.add(muzzleFlash);

    const gltfLoader = new GLTFLoader();
    const fbxLoader = new FBXLoader();
    const modelUrl = 'https://raw.githubusercontent.com/seferbreak/-/main/Meshy_AI_Pink_Cyber_Skull_Spid_0306135258_texture.glb';
    const newEnemyModelUrl = '/models/animated_enemy/main_model.fbx';
    const newEnemyWalkUrl = '/models/animated_enemy/walking.fbx';
    const newEnemyRunUrl = '/models/animated_enemy/running.fbx';
    const newEnemyTextureUrl = '/models/new_enemy/Meshy_AI_аы_0314090349_texture_fbx/Meshy_AI_аы_0314090349_texture.png';
    
    const newEnemyTexture = new THREE.TextureLoader().load(newEnemyTextureUrl);
    newEnemyTexture.colorSpace = THREE.SRGBColorSpace;

    const btnStart = document.getElementById('btn-start');

    fbxLoader.load(newEnemyModelUrl, (fbx) => {
        newEnemyTemplate = fbx;
        newEnemyTemplate.scale.set(0.0764, 0.0764, 0.0764); 
        newEnemyTemplate.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(newEnemyTemplate);
        const height = box.max.y - box.min.y;
        newEnemyTemplate.position.y = -box.min.y - height * 0.2;
        
        newEnemyTemplate.traverse((child: any) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.material = new THREE.MeshStandardMaterial({
                    map: newEnemyTexture,
                    roughness: 0.8,
                    metalness: 0.2,
                    skinning: true
                });
            }
        });

        // Load walk animation
        fbxLoader.load(newEnemyWalkUrl, (animFbx) => {
            if (animFbx.animations && animFbx.animations.length > 0) {
                let clip = animFbx.animations[0];
                
                // Отключаем движение (Root Motion) внутри самой анимации, оставляя только движения рук и ног
                clip.tracks = clip.tracks.filter(track => {
                    if (track.name.endsWith('.position')) {
                        if (track.name.toLowerCase().includes('hips')) return false;
                    }
                    return true;
                });

                newEnemyAnimations['walk'] = clip;
            }

            // Load run animation
            fbxLoader.load(newEnemyRunUrl, (runFbx) => {
                if (runFbx.animations && runFbx.animations.length > 0) {
                    let clip = runFbx.animations[0];
                    
                    clip.tracks = clip.tracks.filter(track => {
                        if (track.name.endsWith('.position')) {
                            if (track.name.toLowerCase().includes('hips')) return false;
                        }
                        return true;
                    });

                    newEnemyAnimations['run'] = clip;
                }

                newEnemies.forEach(n => {
                    if (n.userData.tempMesh) n.remove(n.userData.tempMesh);
                    let clone = SkeletonUtils.clone(newEnemyTemplate!) as THREE.Group;
                    
                    const mixer = new THREE.AnimationMixer(clone);
                    n.userData.mixer = mixer;
                    newEnemyMixers.push(mixer);
                    
                    if (newEnemyAnimations['walk']) {
                        const action = mixer.clipAction(newEnemyAnimations['walk']);
                        action.play();
                        n.userData.currentAction = action;
                    }

                    n.add(clone);
                    n.userData.model = clone;
                });
            });
        });
    }, undefined, (error) => {
        console.error("Ошибка загрузки нового врага:", error);
    });

    gltfLoader.load(modelUrl, (gltf) => {
        mutantTemplate = gltf.scene;
        mutantTemplate.scale.set(3.0, 3.0, 3.0); 
        mutantTemplate.position.y = 2.4; 
        
        mutantTemplate.traverse((child: any) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((m: any) => {
                            let clone = m.clone();
                            if (clone.color) clone.color.multiplyScalar(0.4);
                            if (clone.roughness !== undefined) clone.roughness = 0.2;
                            return clone;
                        });
                    } else {
                        child.material = child.material.clone();
                        if (child.material.color) child.material.color.multiplyScalar(0.4); 
                        if (child.material.roughness !== undefined) child.material.roughness = 0.2; 
                    }
                }
            }
        });

        modelsLoaded = true;
        if (btnStart) {
            btnStart.innerText = "ИГРАТЬ";
            btnStart.classList.remove('disabled');
        }

        mutants.forEach(m => {
            if (m.userData.tempMesh) m.remove(m.userData.tempMesh);
            let clone = mutantTemplate!.clone();
            clone.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((m: any) => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                }
            });
            m.add(clone);
            m.userData.model = clone;
        });
    }, undefined, (error) => {
        console.error("Ошибка загрузки модели:", error);
        modelsLoaded = true; 
        if (btnStart) {
            btnStart.innerText = "ИГРАТЬ (БЕЗ МОДЕЛЕЙ)";
            btnStart.classList.remove('disabled');
        }
        if (ctrlDesc) {
            ctrlDesc.innerText = "Ошибка загрузки 3D моделей. Играем с заглушками.";
        }
    });

    createLevel();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    
    setupTouchControls();

    window.addEventListener('resize', onWindowResize);

    if (btnStart) {
        btnStart.addEventListener('click', () => startGame());
    }

    animate();

    function startGame() {
        if (!modelsLoaded) return;
        
        if(playerHealth <= 0 || gameWon) { 
            resetGame();
            return; 
        }
        
        isMobileMode = true;
        
        if(!audioCtx) initAudio();
        else if(audioCtx.state === 'suspended') audioCtx.resume();
        
        isPaused = false;
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';

        const mobControls = document.getElementById('mobile-controls');
        if (mobControls) mobControls.style.display = 'block';
        // Try to request fullscreen, but don't fail if it's not supported
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(err => console.log(err));
        }
    }

    function pauseGame() {
        isPaused = true;
        const ss = document.getElementById('start-screen');
        if (ss) ss.style.display = 'flex';
        const mobControls = document.getElementById('mobile-controls');
        if (mobControls) mobControls.style.display = 'none';
        
        const startTitle = document.getElementById('start-title');
        if (startTitle) {
            startTitle.innerText = "ПАУЗА";
            startTitle.style.color = "#ffffff";
            startTitle.style.textShadow = "0px 0px 10px #ffffff";
        }
        
        const startDesc = document.getElementById('start-desc');
        if (startDesc) startDesc.innerText = "Система ожидает возвращения оператора.";
    }

    let autoFireTimer: number | null = null;
    function startShooting() {
        if (autoFireTimer === null) {
            shoot();
            autoFireTimer = window.setInterval(shoot, 250);
        }
        const btnShoot = document.getElementById('btn-shoot');
        if (btnShoot) btnShoot.style.background = "rgba(255,50,50,0.5)";
    }
    function stopShooting() {
        if (autoFireTimer !== null) {
            window.clearInterval(autoFireTimer);
            autoFireTimer = null;
        }
        const btnShoot = document.getElementById('btn-shoot');
        if (btnShoot) btnShoot.style.background = "rgba(255,50,50,0.2)";
    }

    function setupTouchControls() {
        let lookTouchId: number | null = null;
        let lastTouchX = 0, lastTouchY = 0;
        let isMouseLooking = false;

        window.addEventListener('touchstart', e => {
            if (isPaused || !isMobileMode) return;
            for (let i=0; i<e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                let target = t.target as HTMLElement;
                if (target.id === 'btn-shoot') {
                    if (lookTouchId === null) {
                        lookTouchId = t.identifier;
                        lastTouchX = t.clientX; lastTouchY = t.clientY;
                    }
                    continue;
                }
                if (target.classList.contains('touch-btn') || target.closest('.touch-btn')) continue;
                if (lookTouchId === null) {
                    lookTouchId = t.identifier;
                    lastTouchX = t.clientX; lastTouchY = t.clientY;
                }
            }
        }, {passive: false});

        window.addEventListener('touchmove', e => {
            if (isPaused || !isMobileMode) return;
            for (let i=0; i<e.changedTouches.length; i++) {
                let t = e.changedTouches[i];
                if (t.identifier === lookTouchId) {
                    e.preventDefault();
                    let dx = t.clientX - lastTouchX; let dy = t.clientY - lastTouchY;
                    yawObject.rotation.y -= dx * 0.005; pitchObject.rotation.x -= dy * 0.005;
                    pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
                    lastTouchX = t.clientX; lastTouchY = t.clientY;
                }
            }
        }, {passive: false});

        const clearLookTouch = (e: TouchEvent) => {
            for (let i=0; i<e.changedTouches.length; i++) { 
                if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null; 
            }
        };
        window.addEventListener('touchend', clearLookTouch);
        window.addEventListener('touchcancel', clearLookTouch);

        window.addEventListener('mousedown', e => {
            if (isPaused || !isMobileMode) return;
            if ((e.target as HTMLElement).classList.contains('touch-btn') || (e.target as HTMLElement).closest('.touch-btn')) return;
            isMouseLooking = true;
            lastTouchX = e.clientX; lastTouchY = e.clientY;
        });
        window.addEventListener('mousemove', e => {
            if (!isMouseLooking || isPaused || !isMobileMode) return;
            let dx = e.clientX - lastTouchX; let dy = e.clientY - lastTouchY;
            yawObject.rotation.y -= dx * 0.005; pitchObject.rotation.x -= dy * 0.005;
            pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
            lastTouchX = e.clientX; lastTouchY = e.clientY;
        });
        window.addEventListener('mouseup', () => {
            isMouseLooking = false;
            stopShooting();
        });

        const joyBase = document.getElementById('joystick-base');
        const joyKnob = document.getElementById('joystick-knob');
        let joyTouchId: number | null = null;
        let joyBaseRect: DOMRect | null = null;
        const maxJoyRadius = 50; 
        let isMouseJoy = false;

        const updateJoystick = (clientX: number, clientY: number) => {
            if (!joyBase || !joyKnob || !joyBaseRect) return;
            let centerX = joyBaseRect.left + joyBaseRect.width / 2;
            let centerY = joyBaseRect.top + joyBaseRect.height / 2;
            let dx = clientX - centerX; let dy = clientY - centerY;
            let distance = Math.sqrt(dx*dx + dy*dy);
            if (distance > maxJoyRadius) { dx = (dx / distance) * maxJoyRadius; dy = (dy / distance) * maxJoyRadius; }
            joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
            joystick.x = dx / maxJoyRadius; joystick.y = dy / maxJoyRadius; 
        };

        const startJoy = (x: number, y: number) => { 
            if (joyBase) {
                joyBaseRect = joyBase.getBoundingClientRect(); 
                updateJoystick(x, y); 
            }
        };
        const endJoy = () => { 
            joystick.x = 0; 
            joystick.y = 0; 
            if (joyKnob) joyKnob.style.transform = `translate(-50%, -50%)`; 
        };

        if (joyBase) {
            joyBase.addEventListener('touchstart', e => { e.preventDefault(); if (joyTouchId !== null) return; let t = e.changedTouches[0]; joyTouchId = t.identifier; startJoy(t.clientX, t.clientY); });
            joyBase.addEventListener('touchmove', e => { e.preventDefault(); for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === joyTouchId) updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY); } });
            const resetJoy = (e: TouchEvent) => { e.preventDefault(); for(let i=0; i<e.changedTouches.length; i++) { if(e.changedTouches[i].identifier === joyTouchId) { joyTouchId = null; endJoy(); } } };
            joyBase.addEventListener('touchend', resetJoy); joyBase.addEventListener('touchcancel', resetJoy);

            joyBase.addEventListener('mousedown', e => { e.preventDefault(); isMouseJoy = true; startJoy(e.clientX, e.clientY); });
        }
        window.addEventListener('mousemove', e => { if(isMouseJoy) { e.preventDefault(); updateJoystick(e.clientX, e.clientY); } });
        window.addEventListener('mouseup', e => { if(isMouseJoy) { isMouseJoy = false; endJoy(); } });

        const btnShoot = document.getElementById('btn-shoot');
        if (btnShoot) {
            btnShoot.addEventListener('touchstart', e => { 
                e.preventDefault(); 
                startShooting(); 
            });
            btnShoot.addEventListener('touchend', e => { e.preventDefault(); stopShooting(); });
            btnShoot.addEventListener('touchcancel', e => { e.preventDefault(); stopShooting(); });
            
            btnShoot.addEventListener('mousedown', e => { 
                e.preventDefault(); 
                startShooting(); 
                isMouseLooking = true;
                lastTouchX = e.clientX; 
                lastTouchY = e.clientY;
            });
        }

        const btnSprint = document.getElementById('btn-sprint');
        if (btnSprint) {
            btnSprint.addEventListener('touchstart', e => { e.preventDefault(); isSprinting = true; btnSprint.style.background = "rgba(255,255,255,0.3)"; });
            btnSprint.addEventListener('touchend', e => { e.preventDefault(); isSprinting = false; btnSprint.style.background = "rgba(255,255,255,0.08)"; });
            btnSprint.addEventListener('mousedown', e => { e.preventDefault(); isSprinting = true; btnSprint.style.background = "rgba(255,255,255,0.3)"; });
        }
        window.addEventListener('mouseup', e => { 
            isSprinting = false; 
            if (btnSprint) btnSprint.style.background = "rgba(255,255,255,0.08)"; 
        });

        const btnPause = document.getElementById('btn-pause');
        if (btnPause) {
            btnPause.addEventListener('touchstart', e => { e.preventDefault(); pauseGame(); });
            btnPause.addEventListener('mousedown', e => { e.preventDefault(); pauseGame(); });
        }
    }

    function createModernTexture(type: string) {
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        
        if (type === 'wall') {
            ctx.fillStyle = "#e0e5ec";
            ctx.fillRect(0,0,512,512);
            ctx.fillStyle = "#2c7a7b";
            ctx.fillRect(0, 240, 512, 32);
            ctx.fillStyle = "#d0d5dc";
            ctx.fillRect(0, 272, 512, 240);
            
            for(let i=0; i<3000; i++) {
                ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
                ctx.fillRect(Math.random()*512, Math.random()*512, Math.random()*3+1, Math.random()*3+1);
            }
            ctx.strokeStyle = "#c0c5cc";
            ctx.lineWidth = 4;
            ctx.strokeRect(2, 2, 508, 508);
            for(let i=0; i<=512; i+=128) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
            }
            ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(512, 256); ctx.stroke();
        } else if (type === 'floor') {
            ctx.fillStyle = "#f0f4f8";
            ctx.fillRect(0,0,512,512);
            ctx.fillStyle = "#d9e2ec";
            for(let i=0; i<512; i+=128) {
                for(let j=0; j<512; j+=128) {
                    if ((i/128 + j/128) % 2 === 0) ctx.fillRect(i, j, 128, 128);
                }
            }
            ctx.strokeStyle = "#c0c5cc";
            ctx.lineWidth = 2;
            for(let i=0; i<=512; i+=128) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
            }
        } else if (type === 'ceil') {
            ctx.fillStyle = "#f8f9fa";
            ctx.fillRect(0,0,512,512);
            ctx.strokeStyle = "#dee2e6";
            ctx.lineWidth = 4;
            for(let i=0; i<=512; i+=64) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
            }
        } else if (type === 'door') {
            ctx.fillStyle = '#050505';
            ctx.fillRect(0,0,512,512);
            ctx.fillStyle = '#1a0202';
            ctx.fillRect(20, 20, 472, 472);
            ctx.fillStyle = '#aa0000';
            ctx.font = 'bold 80px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('СЕКТОР: ВЫХОД', 256, 260);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        return tex;
    }

    function grayscaleTexture(url: string) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for(let i=0; i<data.length; i+=4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                data[i] = avg; // r
                data[i+1] = avg; // g
                data[i+2] = avg; // b
            }
            ctx.putImageData(imgData, 0, 0);
            tex.needsUpdate = true;
        };
        img.src = url;
        return tex;
    }

    function createLevel() {
        const textureLoader = new THREE.TextureLoader();
        
        const wallTexDirty = textureLoader.load("https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2015_01_17.png");
        wallTexDirty.colorSpace = THREE.SRGBColorSpace;
        const wallMatDirty = new THREE.MeshStandardMaterial({ map: wallTexDirty, roughness: 0.9, metalness: 0.1 });

        const wallTexClean = textureLoader.load("https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2014_50_45.png");
        wallTexClean.colorSpace = THREE.SRGBColorSpace;
        const wallMatClean = new THREE.MeshStandardMaterial({ map: wallTexClean, roughness: 0.9, metalness: 0.1 });

        const doorTex = grayscaleTexture("https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2015_02_14.png");
        const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.5 });
        const floorMats = [
            "https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2014_37_50.png", // 0: грязный грубый
            "https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2014_38_44.png", // 1: зараженная зона
            "https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2014_36_43.png", // 2: чистая зона с кровью
            "https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2014_35_10.png"  // 3: чистая зона без монстров
        ].map(url => {
            const tex = textureLoader.load(url);
            tex.colorSpace = THREE.SRGBColorSpace;
            return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1 });
        });

        const ceilTexUrl = "https://raw.githubusercontent.com/seferbreak/-/main/ChatGPT%20Image%208%20%D0%BC%D0%B0%D1%80.%202026%20%D0%B3.%2C%2017_27_19.png";
        const ceilTex = textureLoader.load(ceilTexUrl);
        ceilTex.colorSpace = THREE.SRGBColorSpace;
        ceilTex.wrapS = THREE.RepeatWrapping;
        ceilTex.wrapT = THREE.RepeatWrapping;
        ceilTex.repeat.set(1, 1);
        const ceilMat = new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0.0 });
        const windowMat = new THREE.MeshPhysicalMaterial({ color: 0x223344, transmission: 0.9, opacity: 1, transparent: true, metalness: 0.1, roughness: 0.3, side: THREE.DoubleSide });

        const wallGeo = new THREE.BoxGeometry(tileSize, wallHeight, tileSize);
        const planeGeo = new THREE.PlaneGeometry(tileSize, tileSize);
        const pipeGeo = new THREE.CylinderGeometry(0.1, 0.1, tileSize, 8);
        const pipeMat = new THREE.MeshStandardMaterial({color: 0x0a0a0a, metalness: 0.9, roughness: 0.5});

        for (let z = 0; z < MAP.length; z++) {
            for (let x = 0; x < MAP[z].length; x++) {
                const type = MAP[z][x];
                const px = x * tileSize;
                const pz = z * tileSize;

                let floorMatIndex = 0;
                let hasMutantNearby = false;
                for (let dz = -2; dz <= 2; dz++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const nx = x + dx;
                        const nz = z + dz;
                        if (nz >= 0 && nz < MAP.length && nx >= 0 && nx < MAP[nz].length) {
                            if (MAP[nz][nx] === 'M') {
                                hasMutantNearby = true;
                            }
                        }
                    }
                }

                let wallsAround = 0;
                if (z > 0 && MAP[z-1][x] === 'W') wallsAround++;
                if (z < MAP.length-1 && MAP[z+1][x] === 'W') wallsAround++;
                if (x > 0 && MAP[z][x-1] === 'W') wallsAround++;
                if (x < MAP[z].length-1 && MAP[z][x+1] === 'W') wallsAround++;

                if (hasMutantNearby) {
                    floorMatIndex = Math.random() > 0.5 ? 1 : 0;
                } else {
                    if (wallsAround >= 3) {
                        floorMatIndex = 3;
                    } else {
                        floorMatIndex = 2;
                    }
                }

                let floor = new THREE.Mesh(planeGeo, floorMats[floorMatIndex]);
                floor.position.set(px, 0, pz);
                floor.rotation.x = -Math.PI / 2;
                scene.add(floor);

                let ceiling = new THREE.Mesh(planeGeo, ceilMat);
                ceiling.position.set(px, wallHeight, pz);
                ceiling.rotation.x = Math.PI / 2;
                scene.add(ceiling);

                if(Math.random() < 0.3) {
                    let pipe = new THREE.Mesh(pipeGeo, pipeMat);
                    pipe.position.set(px, wallHeight - 0.2, pz);
                    if(Math.random() > 0.5) pipe.rotation.z = Math.PI/2; else pipe.rotation.x = Math.PI/2;
                    scene.add(pipe);
                }

                let currentWallMat = hasMutantNearby ? wallMatDirty : wallMatClean;

                if (type === 'W') {
                    let wall = new THREE.Mesh(wallGeo, currentWallMat);
                    wall.position.set(px, wallHeight/2, pz);
                    wall.userData.isWall = true;
                    scene.add(wall); walls.push(wall);
                    
                    // Добавляем мебель у некоторых стен
                    if (Math.random() < 0.15 && x > 0 && x < MAP[z].length - 1 && z > 0 && z < MAP.length - 1) {
                        // Проверяем, есть ли свободное место перед стеной
                        let emptyDir = null;
                        if (MAP[z][x+1] === '.') emptyDir = {x: 1, z: 0, rot: Math.PI/2};
                        else if (MAP[z][x-1] === '.') emptyDir = {x: -1, z: 0, rot: -Math.PI/2};
                        else if (MAP[z+1] && MAP[z+1][x] === '.') emptyDir = {x: 0, z: 1, rot: 0};
                        else if (MAP[z-1] && MAP[z-1][x] === '.') emptyDir = {x: 0, z: -1, rot: Math.PI};
                        
                        if (emptyDir) {
                            let isDesk = Math.random() > 0.5;
                            let objPx = px + emptyDir.x * (tileSize/2 + 1.5);
                            let objPz = pz + emptyDir.z * (tileSize/2 + 1.5);
                            
                            if (isDesk) {
                                let deskGeo = new THREE.BoxGeometry(tileSize * 0.5, 1.5, tileSize * 0.3);
                                let deskMat = new THREE.MeshStandardMaterial({color: 0xaaaaaa, roughness: 0.8});
                                let desk = new THREE.Mesh(deskGeo, deskMat);
                                desk.position.set(objPx, 0.75, objPz);
                                desk.rotation.y = emptyDir.rot;
                                desk.userData.isWall = true;
                                scene.add(desk); walls.push(desk);
                                
                                let monitorGeo = new THREE.BoxGeometry(1.2, 0.8, 0.2);
                                let monitorMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.2});
                                let monitor = new THREE.Mesh(monitorGeo, monitorMat);
                                monitor.position.set(objPx, 1.5 + 0.4, objPz);
                                monitor.rotation.y = emptyDir.rot;
                                scene.add(monitor);
                                
                                let screenGeo = new THREE.PlaneGeometry(1.1, 0.7);
                                let screenMat = new THREE.MeshBasicMaterial({color: 0x00ffaa});
                                let screen = new THREE.Mesh(screenGeo, screenMat);
                                screen.position.set(objPx + Math.sin(emptyDir.rot)*0.11, 1.5 + 0.4, objPz + Math.cos(emptyDir.rot)*0.11);
                                screen.rotation.y = emptyDir.rot;
                                scene.add(screen);
                                
                                let screenLight = new THREE.PointLight(0x00ffaa, 20, 15, 2);
                                screenLight.position.set(objPx + Math.sin(emptyDir.rot)*0.5, 1.5 + 0.4, objPz + Math.cos(emptyDir.rot)*0.5);
                                scene.add(screenLight);
                            } else {
                                let cabGeo = new THREE.BoxGeometry(tileSize * 0.4, wallHeight * 0.7, tileSize * 0.3);
                                let cabMat = new THREE.MeshStandardMaterial({color: 0x8899aa, roughness: 0.6});
                                let cabinet = new THREE.Mesh(cabGeo, cabMat);
                                cabinet.position.set(objPx, (wallHeight * 0.7)/2, objPz);
                                cabinet.rotation.y = emptyDir.rot;
                                cabinet.userData.isWall = true;
                                scene.add(cabinet); walls.push(cabinet);
                            }
                        }
                    }
                } else if (type === 'O') {
                    let isHorizontal = (MAP[z][x-1] === 'W' || MAP[z][x+1] === 'W');
                    let paneGeo = isHorizontal ? new THREE.BoxGeometry(tileSize, wallHeight * 0.6, 0.1) : new THREE.BoxGeometry(0.1, wallHeight * 0.6, tileSize);
                    let pane = new THREE.Mesh(paneGeo, windowMat);
                    pane.position.set(px, wallHeight/2, pz); scene.add(pane);
                    
                    let frameGeo = new THREE.BoxGeometry(tileSize, wallHeight * 0.2, tileSize);
                    let frameB = new THREE.Mesh(frameGeo, currentWallMat); frameB.position.set(px, (wallHeight * 0.2)/2, pz); frameB.userData.isWall = true; scene.add(frameB); walls.push(frameB);
                    let frameT = new THREE.Mesh(frameGeo, currentWallMat); frameT.position.set(px, wallHeight - (wallHeight * 0.2)/2, pz); frameT.userData.isWall = true; scene.add(frameT); walls.push(frameT);
                } else if (type === 'L') {
                    let light = new THREE.PointLight(0xaaccff, 25, 30, 2); 
                    light.position.set(px, wallHeight - 0.5, pz);
                    light.userData.isFlickering = true; light.userData.baseIntensity = 25;
                    scene.add(light); items.push(light);
                } else if (type === 'B') {
                    let isHorizontal = (MAP[z][x-1] === 'W' || MAP[z][x+1] === 'W');
                    let glassGeo = isHorizontal ? new THREE.BoxGeometry(tileSize, wallHeight, 0.2) : new THREE.BoxGeometry(0.2, wallHeight, tileSize);
                    let glass = new THREE.Mesh(glassGeo, windowMat);
                    glass.position.set(px, wallHeight/2, pz); 
                    glass.userData.isWall = true; 
                    scene.add(glass); 
                    walls.push(glass);
                    
                    let frameGeo = new THREE.BoxGeometry(0.4, wallHeight, 0.4);
                    let frameMat = new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.9});
                    let frameLeft = new THREE.Mesh(frameGeo, frameMat);
                    frameLeft.position.set(px + (isHorizontal ? -tileSize/2 + 0.2 : 0), wallHeight/2, pz + (isHorizontal ? 0 : -tileSize/2 + 0.2));
                    scene.add(frameLeft);
                    let frameRight = new THREE.Mesh(frameGeo, frameMat);
                    frameRight.position.set(px + (isHorizontal ? tileSize/2 - 0.2 : 0), wallHeight/2, pz + (isHorizontal ? 0 : tileSize/2 - 0.2));
                    scene.add(frameRight);
                    
                    let frameHGeo = isHorizontal ? new THREE.BoxGeometry(tileSize, 0.4, 0.4) : new THREE.BoxGeometry(0.4, 0.4, tileSize);
                    let frameTop = new THREE.Mesh(frameHGeo, frameMat);
                    frameTop.position.set(px, wallHeight - 0.2, pz);
                    scene.add(frameTop);
                    let frameBottom = new THREE.Mesh(frameHGeo, frameMat);
                    frameBottom.position.set(px, 0.2, pz);
                    scene.add(frameBottom);
                    let frameMid = new THREE.Mesh(frameHGeo, frameMat);
                    frameMid.position.set(px, wallHeight/2, pz);
                    scene.add(frameMid);
                } else if (type === 'P') {
                    yawObject.position.set(px, wallHeight * 0.56, pz);
                    startPosition.copy(yawObject.position);
                } else if (type === 'M') {
                    let mutant = createMutant();
                    mutant.position.set(px, 0, pz);
                    scene.add(mutant); mutants.push(mutant);
                } else if (type === 'N') {
                    let enemy = createNewEnemy();
                    enemy.position.set(px, 0, pz);
                    scene.add(enemy); newEnemies.push(enemy);
                } else if (type === 'K') {
                    let keycard = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.15), new THREE.MeshStandardMaterial({color: 0x0044aa}));
                    keycard.position.set(px, 1.2, pz); keycard.userData.isKeycard = true;
                    let light = new THREE.PointLight(0x0066cc, 10, 5); keycard.add(light);
                    scene.add(keycard); items.push(keycard);
                } else if (type === 'A') {
                    let ammoBox = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), new THREE.MeshStandardMaterial({color: 0x2a3a2a}));
                    ammoBox.position.set(px, 0.6, pz); ammoBox.userData.isAmmo = true;
                    scene.add(ammoBox); items.push(ammoBox);
                } else if (type === 'H') {
                    let medkit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), new THREE.MeshStandardMaterial({color: 0xffffff}));
                    // Add a red cross
                    let crossH = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 1.55), new THREE.MeshBasicMaterial({color: 0xff0000}));
                    let crossV = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.0, 1.55), new THREE.MeshBasicMaterial({color: 0xff0000}));
                    medkit.add(crossH); medkit.add(crossV);
                    medkit.position.set(px, 0.6, pz); medkit.userData.isMedkit = true;
                    scene.add(medkit); items.push(medkit);
                } else if (type === 'E') {
                    let exitDoor = new THREE.Mesh(new THREE.BoxGeometry(tileSize, wallHeight, 0.2), doorMat);
                    exitDoor.rotation.y = -Math.PI / 2;
                    exitDoor.position.set(px + tileSize/2 - 0.1, wallHeight/2, pz); 
                    exitDoor.userData.isExit = true; scene.add(exitDoor); items.push(exitDoor);
                    
                    let wallBehind = new THREE.Mesh(wallGeo, currentWallMat); 
                    wallBehind.position.set(px + tileSize, wallHeight/2, pz); 
                    wallBehind.userData.isWall = true; scene.add(wallBehind); walls.push(wallBehind);
                    
                    let exitGlow = new THREE.PointLight(0xff0000, 100, 40, 1.5);
                    exitGlow.position.set(px + 1, wallHeight/2, pz);
                    scene.add(exitGlow);
                }
            }
        }
    }

    function createMutant() {
        const group = new THREE.Group();
        group.userData.isMutant = true;
        group.userData.hp = 6;
        group.userData.state = 'idle';

        if (mutantTemplate) {
            let clone = mutantTemplate.clone();
            clone.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((m: any) => m.clone());
                    } else {
                        child.material = child.material.clone();
                    }
                }
            });
            group.add(clone);
            group.userData.model = clone;
        } else {
            const tempMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.8), new THREE.MeshBasicMaterial({color: 0xff0000, wireframe: true}));
            tempMesh.position.y = 2.5; group.add(tempMesh); group.userData.tempMesh = tempMesh;
        }
        return group;
    }

    function createNewEnemy() {
        const group = new THREE.Group();
        group.userData.isNewEnemy = true;
        group.userData.hp = 10;
        group.userData.state = 'patrol';

        if (newEnemyTemplate) {
            let clone = SkeletonUtils.clone(newEnemyTemplate) as THREE.Group;
            
            const mixer = new THREE.AnimationMixer(clone);
            group.userData.mixer = mixer;
            newEnemyMixers.push(mixer);
            
            if (newEnemyAnimations['walk']) {
                const action = mixer.clipAction(newEnemyAnimations['walk']);
                action.play();
                group.userData.currentAction = action;
            }

            group.add(clone);
            group.userData.model = clone;
        } else {
            const tempMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, 1.0), new THREE.MeshBasicMaterial({color: 0x00ff00, wireframe: true}));
            tempMesh.position.y = 1.0; group.add(tempMesh); group.userData.tempMesh = tempMesh;
        }
        return group;
    }

    function spawnSmoke(pos: THREE.Vector3) {
        for(let i=0; i<20; i++) {
            const smokeGeo = new THREE.SphereGeometry(1.0 + Math.random()*2.0, 8, 8);
            const smokeMat = new THREE.MeshBasicMaterial({color: 0x111111, transparent: true, opacity: 0.9});
            const p = new THREE.Mesh(smokeGeo, smokeMat);
            
            p.position.set(pos.x + (Math.random()-0.5)*3, pos.y + 1 + Math.random()*4, pos.z + (Math.random()-0.5)*3);
            p.userData.life = 1.0;
            p.userData.vel = new THREE.Vector3((Math.random()-0.5)*4, Math.random()*3, (Math.random()-0.5)*4);
            
            scene.add(p);
            smokeParticles.push(p);
        }
    }

    function onKeyDown(e: KeyboardEvent) { 
        if(isPaused) return;
        switch(e.code) { 
            case 'KeyW': moveForward = true; break; 
            case 'KeyS': moveBackward = true; break; 
            case 'KeyA': moveLeft = true; break; 
            case 'KeyD': moveRight = true; break; 
            case 'ShiftLeft': 
            case 'ShiftRight': 
                isSprinting = true; 
                const btnSprint = document.getElementById('btn-sprint');
                if (btnSprint) btnSprint.style.background = "rgba(255,255,255,0.3)";
                break;
            case 'Space':
                startShooting();
                break;
            case 'Escape': pauseGame(); break; 
        } 
    }
    function onKeyUp(e: KeyboardEvent) { 
        switch(e.code) { 
            case 'KeyW': moveForward = false; break; 
            case 'KeyS': moveBackward = false; break; 
            case 'KeyA': moveLeft = false; break; 
            case 'KeyD': moveRight = false; break; 
            case 'ShiftLeft': 
            case 'ShiftRight': 
                isSprinting = false; 
                const btnSprint = document.getElementById('btn-sprint');
                if (btnSprint) btnSprint.style.background = "rgba(255,255,255,0.1)";
                break;
            case 'Space':
                stopShooting();
                break;
        } 
    }

    function onMouseMove(e: MouseEvent) {
        if (isMobileMode || document.pointerLockElement !== document.body) return;
        yawObject.rotation.y -= e.movementX * 0.002;
        pitchObject.rotation.x -= e.movementY * 0.002;
        pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
    }

    function onMouseDown(e: MouseEvent) { 
        if (!isMobileMode && document.pointerLockElement === document.body && e.button === 0) shoot(); 
    }

    function onWindowResize() {
        const targetHeight = 240;
        const aspect = window.innerWidth / window.innerHeight;
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
        renderer.setSize(targetHeight * aspect, targetHeight, false);

        const uiScaler = document.getElementById('ui-scaler');
        if (uiScaler) {
            const scale = window.innerHeight / targetHeight;
            const internalWidth = Math.ceil(targetHeight * aspect);
            uiScaler.style.width = `${internalWidth}px`;
            uiScaler.style.height = `${targetHeight}px`;
            const scaledWidth = internalWidth * scale;
            const offsetX = (window.innerWidth - scaledWidth) / 2;
            uiScaler.style.transform = `translate(${offsetX}px, 0px) scale(${scale})`;
            uiScaler.style.transformOrigin = 'top left';
        }
    }

    function shoot() {
        if(playerAmmo <= 0) { playSound('empty'); showMessage("НЕТ ПАТРОНОВ", "#ff3333"); return; }

        playerAmmo--; updateHUD(); playSound('shoot');
        
        isRecoiling = true;
        gunSprite.position.z = -0.4; 
        gunSprite.position.y = GUN_BASE_Y + 0.05;
        
        setTimeout(() => { 
            if (isCleanedUp) return;
            gunSprite.position.z = -0.5; 
            isRecoiling = false;
        }, 150);

        muzzleFlash.intensity = 15; setTimeout(() => { if (!isCleanedUp) muzzleFlash.intensity = 0; }, 50);

        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        for (let i = 0; i < intersects.length; i++) {
            let obj: any = intersects[i].object;
            let isWall = false; let hitMutant: any = null; let current = obj;
            
            while (current) {
                if (current.userData && current.userData.isWall) isWall = true;
                if (current.userData && current.userData.isMutant) hitMutant = current;
                if (current.userData && current.userData.isNewEnemy) hitMutant = current;
                current = current.parent;
            }

            if (isWall) break; 
            if (hitMutant) { if(hitMutant.userData && hitMutant.userData.hp !== undefined) damageMutant(hitMutant); break; }
        }
    }

    function damageMutant(mutant: THREE.Group) {
        if (mutant.userData.dead) return;
        mutant.userData.hp--; playSound('monster_hurt');

        if (mutant.userData.state === 'idle') {
            mutant.userData.state = 'chasing';
        }

        if (mutant.userData.model) {
            mutant.userData.model.traverse((c: any) => {
                if(c.isMesh && c.material) {
                    const materials = Array.isArray(c.material) ? c.material : [c.material];
                    materials.forEach((mat: any, index: number) => {
                        const origKey = 'origEmissive' + index;
                        if (!c.userData[origKey]) {
                            c.userData[origKey] = mat.emissive ? mat.emissive.clone() : new THREE.Color(0x000000);
                        }
                        if (mat.emissive) {
                            mat.emissive.setHex(0xcc0000);
                            setTimeout(() => { 
                                if (!isCleanedUp && mat && mat.emissive) {
                                    mat.emissive.copy(c.userData[origKey]); 
                                }
                            }, 150);
                        }
                    });
                }
            });
        }

        if (mutant.userData.hp <= 0) {
            mutant.userData.dead = true;
            playSound('monster_die');
            spawnSmoke(mutant.position);
            scene.remove(mutant);
            if (mutant.userData.isMutant) {
                mutants = mutants.filter(m => m !== mutant);
            } else if (mutant.userData.isNewEnemy) {
                newEnemies = newEnemies.filter(m => m !== mutant);
                if (mutant.userData.mixer) {
                    newEnemyMixers = newEnemyMixers.filter(m => m !== mutant.userData.mixer);
                }
            }
        }
    }

    function checkWallCollision(x: number, z: number, radius: number) {
        const mapX = Math.round(x / tileSize); const mapZ = Math.round(z / tileSize);
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const checkX = mapX + dx; const checkZ = mapZ + dz;
                if (MAP[checkZ] && (MAP[checkZ][checkX] === 'W' || MAP[checkZ][checkX] === 'O' || MAP[checkZ][checkX] === 'B' || MAP[checkZ][checkX] === 'C' || MAP[checkZ][checkX] === 'D')) {
                    const nearestX = Math.max(checkX*tileSize - tileSize/2, Math.min(x, checkX*tileSize + tileSize/2));
                    const nearestZ = Math.max(checkZ*tileSize - tileSize/2, Math.min(z, checkZ*tileSize + tileSize/2));
                    if (Math.sqrt((x - nearestX)**2 + (z - nearestZ)**2) < radius) return true;
                }
            }
        }
        return false;
    }

    function initAudio() {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        const bufferSize = audioCtx!.sampleRate * 2; 
        noiseBuffer = audioCtx!.createBuffer(1, bufferSize, audioCtx!.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { output[i] = Math.random() * 2 - 1; }

        const osc = audioCtx!.createOscillator(), gain = audioCtx!.createGain();
        osc.type = 'sine'; osc.frequency.value = 35; gain.gain.value = 0.5;
        osc.connect(gain); gain.connect(audioCtx!.destination); osc.start();
    }

    function playSound(type: string) {
        if (!audioCtx) return;
        const t = audioCtx.currentTime;

        if (type === 'shoot') {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(200, t); osc.frequency.exponentialRampToValueAtTime(0.01, t+0.3);
            gain.gain.setValueAtTime(0.8, t); gain.gain.exponentialRampToValueAtTime(0.01, t+0.3);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+0.3);
        } 
        else if (type === 'monster_aggro') {
            const osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc1.type = 'sawtooth'; osc2.type = 'square';
            osc1.frequency.setValueAtTime(800, t); osc1.frequency.exponentialRampToValueAtTime(2500, t + 0.3);
            osc2.frequency.setValueAtTime(850, t); osc2.frequency.exponentialRampToValueAtTime(2600, t + 0.3);
            gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.6, t + 0.05); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
            osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
            osc1.start(t); osc2.start(t); osc1.stop(t+0.8); osc2.stop(t+0.8);
        }
        else if (type === 'monster_hurt') {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(100, t); osc.frequency.exponentialRampToValueAtTime(10, t+0.2);
            gain.gain.setValueAtTime(1.0, t); gain.gain.linearRampToValueAtTime(0.01, t+0.2);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+0.2);
            playNoise(t, 0.2, 0.5); 
        }
        else if (type === 'monster_die') {
            playNoise(t, 1.5, 0.8);
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(80, t); osc.frequency.exponentialRampToValueAtTime(10, t+1.0);
            gain.gain.setValueAtTime(0.5, t); gain.gain.linearRampToValueAtTime(0, t+1.0);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+1.0);
        }
        else if (type === 'hurt') {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(20, t+0.4);
            gain.gain.setValueAtTime(1, t); gain.gain.exponentialRampToValueAtTime(0.01, t+0.4);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+0.4);
        }
        else if (type === 'pickup') {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(400, t); osc.frequency.exponentialRampToValueAtTime(800, t+0.1);
            gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.01, t+0.1);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+0.1);
        }
        else if (type === 'empty') {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = 'square'; osc.frequency.setValueAtTime(50, t);
            gain.gain.setValueAtTime(0.2, t); gain.gain.exponentialRampToValueAtTime(0.01, t+0.1);
            osc.connect(gain); gain.connect(audioCtx.destination); osc.start(t); osc.stop(t+0.1);
        }
    }

    function playNoise(time: number, duration: number, volume: number) {
        if (!noiseBuffer || !audioCtx) return;
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        noise.connect(gain); gain.connect(audioCtx.destination);
        noise.start(time); noise.stop(time + duration);
    }

    function showMessage(text: string, color = "#ffffff") {
        const el = document.getElementById('message'); 
        if (el) {
            el.innerText = text; el.style.color = color; el.style.display = 'inline-block';
            clearTimeout((window as any).messageTimeout); 
            (window as any).messageTimeout = setTimeout(() => { el.style.display = 'none'; }, 3000);
        }
    }

    function updateHUD() {
        const h = document.getElementById('health');
        const a = document.getElementById('ammo');
        if (h) {
            h.innerText = `ЗДОРОВЬЕ: ${playerHealth}`;
            if(playerHealth <= 30) h.style.color = '#ff3333';
            else h.style.color = '#55dd55';
        }
        if (a) a.innerText = `ПАТРОНЫ: ${playerAmmo}`;
    }

    function flashDamage() { 
        const overlay = document.getElementById('damage-overlay'); 
        if (overlay) {
            overlay.style.backgroundColor = "rgba(255, 0, 0, 0.6)"; 
            setTimeout(() => { if(!isCleanedUp) overlay.style.backgroundColor = "rgba(255, 0, 0, 0)"; }, 200); 
        }
    }
    
    function gameOver() { 
        isPaused = true;
        const ss = document.getElementById('start-screen'); if (ss) ss.style.display = 'flex'; 
        const mc = document.getElementById('mobile-controls'); if (mc) mc.style.display = 'none';
        const st = document.getElementById('start-title'); if (st) { st.innerText = "ВЫ МЕРТВЫ"; st.style.color = "#ff0000"; }
        const sd = document.getElementById('start-desc'); if (sd) sd.innerText = "Они разорвали вас на части во тьме."; 
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.style.display = 'inline-block';
            btnStart.innerText = "ПЕРЕЗАПУСК";
        }
    }
    
    function win() { 
        gameWon = true; isPaused = true;
        const ss = document.getElementById('start-screen'); if (ss) ss.style.display = 'flex'; 
        const mc = document.getElementById('mobile-controls'); if (mc) mc.style.display = 'none';
        const st = document.getElementById('start-title'); if (st) { st.innerText = "СВОБОДА"; st.style.color = "#00ffaa"; st.style.textShadow = "0px 0px 20px #00ffaa"; }
        const sd = document.getElementById('start-desc'); if (sd) sd.innerText = "Вы покинули зону карантина. Но инфекция уже внутри вас?"; 
        
        const btnStart = document.getElementById('btn-start');
        if (btnStart) {
            btnStart.style.display = 'inline-block';
            btnStart.innerText = "ИГРАТЬ СНОВА";
        }
    }

    function resetGame() {
        playerHealth = 300;
        playerAmmo = 100;
        hasKeycard = false;
        gameWon = false;
        updateHUD();
        
        mutants.forEach(m => scene.remove(m));
        newEnemies.forEach(n => scene.remove(n));
        items.forEach(i => scene.remove(i));
        walls.forEach(w => scene.remove(w));
        smokeParticles.forEach(p => scene.remove(p));
        
        mutants = [];
        newEnemies = [];
        newEnemyMixers = [];
        items = [];
        walls = [];
        smokeParticles = [];

        createLevel();

        yawObject.position.copy(startPosition);
        yawObject.rotation.y = 0;
        pitchObject.rotation.x = 0;
        
        const btnStart = document.getElementById('btn-start');
        if(btnStart) btnStart.innerText = "ИГРАТЬ";

        const msg = document.getElementById('message');
        if (msg) msg.style.display = 'none';
        
        startGame();
    }

    function drawMinimap() {
        const canvas = document.getElementById('minimap') as HTMLCanvasElement;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width = 60, h = canvas.height = 60;
        const center = w / 2;
        
        ctx.clearRect(0, 0, w, h);
        
        // Сетка и круги дальности
        ctx.strokeStyle = "rgba(0, 255, 170, 0.1)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(center, center, center - 2, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(center, center, center / 2, 0, Math.PI*2); ctx.stroke();
        
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(yawObject.rotation.y); 
        
        // Масштаб: сколько пикселей на один игровой метр
        const scale = 2.0; 
        
        // Отрисовка стен
        ctx.fillStyle = "rgba(0, 255, 170, 0.6)";
        for(let z=0; z<MAP.length; z++) {
            for(let x=0; x<MAP[z].length; x++) {
                const char = MAP[z][x];
                if(char === 'W' || char === 'O' || char === 'B' || char === 'C' || char === 'D') {
                    const rx = (x * tileSize - yawObject.position.x) * scale;
                    const rz = (z * tileSize - yawObject.position.z) * scale;
                    
                    // Рисуем только если в пределах видимости мини-карты
                    if(Math.hypot(rx, rz) < center + tileSize * scale) {
                        ctx.fillRect(rx - (tileSize * scale)/2, rz - (tileSize * scale)/2, tileSize * scale, tileSize * scale);
                    }
                } else if (char === 'E') {
                    const rx = (x * tileSize - yawObject.position.x) * scale;
                    const rz = (z * tileSize - yawObject.position.z) * scale;
                    if(Math.hypot(rx, rz) < center) {
                        ctx.fillStyle = "#ff0000"; 
                        ctx.fillRect(rx - (tileSize * scale)/2, rz - (tileSize * scale)/2, tileSize * scale, tileSize * scale);
                        ctx.fillStyle = "rgba(0, 255, 170, 0.6)";
                    }
                }
            }
        }
        
        // Отрисовка врагов
        ctx.fillStyle = "#ff3333";
        mutants.forEach(m => {
            if(!m.userData.dead) {
                const rx = (m.position.x - yawObject.position.x) * scale;
                const rz = (m.position.z - yawObject.position.z) * scale;
                if(Math.hypot(rx, rz) < center) {
                    ctx.beginPath(); ctx.arc(rx, rz, 3, 0, Math.PI*2); ctx.fill();
                    // Маленькая обводка для врагов
                    ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
                }
            }
        });

        ctx.fillStyle = "#ffaa00";
        newEnemies.forEach(m => {
            if(!m.userData.dead) {
                const rx = (m.position.x - yawObject.position.x) * scale;
                const rz = (m.position.z - yawObject.position.z) * scale;
                if(Math.hypot(rx, rz) < center) {
                    ctx.beginPath(); ctx.arc(rx, rz, 3, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = "white"; ctx.lineWidth = 1; ctx.stroke();
                }
            }
        });

        ctx.restore();

        // Игрок (всегда в центре, смотрит вверх)
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(center, center - 5);
        ctx.lineTo(center + 4, center + 5);
        ctx.lineTo(center - 4, center + 5);
        ctx.closePath();
        ctx.fill();

        // Метки сторон света
        ctx.fillStyle = "rgba(0, 255, 170, 0.8)";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        
        // Поворачиваем метки в зависимости от взгляда игрока, чтобы они всегда были по краям
        const angle = -yawObject.rotation.y;
        const labelDist = center - 8;
        
        const drawLabel = (text: string, offsetAngle: number) => {
            const a = angle + offsetAngle;
            const lx = center + Math.sin(a) * labelDist;
            const ly = center - Math.cos(a) * labelDist;
            ctx.fillText(text, lx, ly);
        };

        drawLabel("N", 0);
        drawLabel("E", Math.PI/2);
        drawLabel("S", Math.PI);
        drawLabel("W", -Math.PI/2);
        
        ctx.fillStyle = "#ffffff";
    }

    const clock = new THREE.Clock();

    function animate() {
        if (isCleanedUp) return;
        animationId = requestAnimationFrame(animate);
        if (isPaused || playerHealth <= 0 || gameWon) { renderer.render(scene, camera); return; }

        const delta = Math.min(clock.getDelta(), 0.1);
        const time = clock.getElapsedTime();

        const currentSpeed = isSprinting ? 125.0 : 75.0; 
        const friction = 8.0;
        const bobMult = isSprinting ? 21 : 14; 

        velocity.x -= velocity.x * friction * delta; 
        velocity.z -= velocity.z * friction * delta;
        
        let forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawObject.rotation.y);
        let right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawObject.rotation.y);
        
        let inputZ = -joystick.y + Number(moveForward) - Number(moveBackward);
        let inputX = joystick.x + Number(moveRight) - Number(moveLeft);
        
        // Визуальное обновление джойстика при игре с клавиатуры
        if (joystick.x === 0 && joystick.y === 0) {
            const joyKnob = document.getElementById('joystick-knob');
            if (joyKnob) {
                let kx = Number(moveRight) - Number(moveLeft);
                let ky = Number(moveBackward) - Number(moveForward);
                let dist = Math.sqrt(kx*kx + ky*ky);
                if (dist > 1) { kx /= dist; ky /= dist; }
                const maxJoyRadius = 50;
                joyKnob.style.transform = `translate(calc(-50% + ${kx * maxJoyRadius}px), calc(-50% + ${ky * maxJoyRadius}px))`;
            }
        }
        
        let inputLength = Math.sqrt(inputX*inputX + inputZ*inputZ);
        let isMoving = inputLength > 0;

        if (inputLength > 1) { 
            inputX /= inputLength; 
            inputZ /= inputLength; 
        }

        velocity.x += (forward.x * inputZ + right.x * inputX) * currentSpeed * delta; 
        velocity.z += (forward.z * inputZ + right.z * inputX) * currentSpeed * delta;
        let nextX = yawObject.position.x + velocity.x * delta, nextZ = yawObject.position.z + velocity.z * delta;

        if (!checkWallCollision(nextX, yawObject.position.z, playerRadius)) yawObject.position.x = nextX; else velocity.x = 0;
        if (!checkWallCollision(yawObject.position.x, nextZ, playerRadius)) yawObject.position.z = nextZ; else velocity.z = 0;

        let targetGunX = GUN_BASE_X;
        let targetGunY = GUN_BASE_Y;

        if (isMoving) {
            bobTimer += delta * bobMult; 
            pitchObject.position.y = Math.sin(bobTimer) * 0.15;
            
            targetGunX += Math.sin(bobTimer * 0.5) * 0.04;
            targetGunY += Math.abs(Math.sin(bobTimer)) * 0.04;
        } else {
            pitchObject.position.y += (0 - pitchObject.position.y) * 0.1;
        }

        if (!isRecoiling) {
            gunSprite.position.x += (targetGunX - gunSprite.position.x) * 0.1;
            gunSprite.position.y += (targetGunY - gunSprite.position.y) * 0.1;
        }

        let flicker = Math.sin(time * 40) * 10;
        if (flashLight) flashLight.intensity = 100 + flicker;
        if (flashLightCenter) flashLightCenter.intensity = 350 + flicker * 2;

        for(let i=smokeParticles.length-1; i>=0; i--) {
            let p = smokeParticles[i]; 
            p.position.addScaledVector(p.userData.vel, delta); 
            p.userData.life -= delta * 0.8; 
            (p.material as THREE.Material).opacity = p.userData.life;
            if(p.userData.life <= 0) { 
                scene.remove(p); 
                smokeParticles.splice(i, 1); 
            }
        }

        for (let i = items.length - 1; i >= 0; i--) {
            let item = items[i];
            if (item.userData.isFlickering) { 
                if (Math.random() < 0.05) (item as THREE.PointLight).intensity = item.userData.baseIntensity * (0.1 + Math.random() * 0.4); 
                else (item as THREE.PointLight).intensity = item.userData.baseIntensity;
                continue; 
            }
            const dist2D = Math.hypot(yawObject.position.x - item.position.x, yawObject.position.z - item.position.z);
            if (dist2D < 7.0) { 
                if (item.userData.isKeycard) { hasKeycard = true; showMessage("ПОЛУЧЕН ДОСТУП. НАЙДИТЕ ВЫХОД.", "#00aaff"); playSound('pickup'); scene.remove(item); items.splice(i, 1); items.forEach(it => { if(it.userData.isExit) (it as any).material.color.setHex(0x00ff55); }); }
                else if (item.userData.isAmmo) { playerAmmo += 10; updateHUD(); showMessage("+10 ПАТРОНОВ", "#55ff55"); playSound('pickup'); scene.remove(item); items.splice(i, 1); }
                else if (item.userData.isMedkit) { 
                    if (playerHealth < 300) {
                        playerHealth = Math.min(300, playerHealth + 50); 
                        updateHUD(); 
                        showMessage("+50 ЗДОРОВЬЕ", "#55ff55"); 
                        playSound('pickup'); 
                        scene.remove(item); 
                        items.splice(i, 1); 
                    } else {
                        if(!item.userData.msgCooldown || time - item.userData.msgCooldown > 2) {
                            showMessage("ЗДОРОВЬЕ ПОЛНОЕ", "#ffffff");
                            item.userData.msgCooldown = time;
                        }
                    }
                }
                else if (item.userData.isExit) { if (hasKeycard) win(); else { if(!item.userData.msgCooldown || time - item.userData.msgCooldown > 2) { showMessage("ДВЕРЬ ЗАБЛОКИРОВАНА. НУЖНА СИНЯЯ КЛЮЧ-КАРТА.", "#ff3333"); item.userData.msgCooldown = time; } } }
            }
            if (item.userData.isKeycard || item.userData.isAmmo || item.userData.isMedkit) { item.rotation.y += delta; item.position.y += Math.sin(time * 3) * 0.005; }
        }

        const mutantRadius = 2.0; 
        
        mutants.forEach(m => {
            if (m.userData.dead) return;
            
            let dist = m.position.distanceTo(yawObject.position);
            let dirToPlayer = new THREE.Vector3().subVectors(yawObject.position, m.position).normalize();
            let playerForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yawObject.rotation.y);
            
            let dot = playerForward.dot(dirToPlayer.clone().negate());
            let isIlluminated = (dist < 28 && dot > 0.85); 
            let isTooClose = (dist < 8); 

            if (m.userData.state === 'idle') {
                if (isIlluminated || isTooClose) {
                    raycaster.set(m.position, dirToPlayer);
                    let intersects = raycaster.intersectObjects(walls);
                    let sightClear = true; if (intersects.length > 0 && intersects[0].distance < dist) sightClear = false;

                    if (sightClear) {
                        m.userData.state = 'alerting';
                        m.userData.alertStartTime = time;
                        playSound('monster_aggro');
                        m.rotation.y = Math.atan2(yawObject.position.x - m.position.x, yawObject.position.z - m.position.z);
                    }
                } else {
                    if (m.userData.patrolAngle === undefined || time > m.userData.nextTurnTime) {
                        m.userData.patrolAngle = Math.random() * Math.PI * 2;
                        m.userData.nextTurnTime = time + Math.random() * 4 + 2;
                    }

                    let angleDiff = m.userData.patrolAngle - m.rotation.y;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    m.rotation.y += angleDiff * delta * 2;

                    let moveX = m.position.x + Math.sin(m.rotation.y) * delta * 2.5; 
                    let moveZ = m.position.z + Math.cos(m.rotation.y) * delta * 2.5;

                    let hitWall = false;
                    if (!checkWallCollision(moveX, m.position.z, mutantRadius)) {
                        m.position.x = moveX;
                    } else { hitWall = true; }
                    
                    if (!checkWallCollision(m.position.x, moveZ, mutantRadius)) {
                        m.position.z = moveZ;
                    } else { hitWall = true; }

                    if (hitWall) m.userData.nextTurnTime = 0; 

                    if (m.userData.model) m.userData.model.rotation.z = Math.sin(time * 5) * 0.05;
                }
            } 
            else if (m.userData.state === 'alerting') {
                if (m.userData.model) {
                    m.userData.model.position.x = (Math.random() - 0.5) * 0.2;
                    m.userData.model.position.z = (Math.random() - 0.5) * 0.2;
                }
                if (time - m.userData.alertStartTime > 0.5) {
                    m.userData.state = 'chasing';
                    if (m.userData.model) { 
                        m.userData.model.position.x = 0;
                        m.userData.model.position.z = 0;
                    }
                }
            }
            else if (m.userData.state === 'chasing') {
                let targetRot = Math.atan2(yawObject.position.x - m.position.x, yawObject.position.z - m.position.z);
                
                // Более резкий поворот
                let angleDiff = targetRot - m.rotation.y;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                m.rotation.y += angleDiff * delta * 12; 

                let dist2D = Math.hypot(yawObject.position.x - m.position.x, yawObject.position.z - m.position.z);

                if (m.userData.isJumping) {
                    let jumpProgress = (time - m.userData.jumpStartTime) / 0.4; // Быстрее прыжок
                    if (jumpProgress < 1.0) {
                        let newX = m.userData.jumpStartX + (m.userData.jumpTargetX - m.userData.jumpStartX) * jumpProgress;
                        let newZ = m.userData.jumpStartZ + (m.userData.jumpTargetZ - m.userData.jumpStartZ) * jumpProgress;
                        if (!checkWallCollision(newX, m.position.z, mutantRadius)) m.position.x = newX;
                        if (!checkWallCollision(m.position.x, newZ, mutantRadius)) m.position.z = newZ;
                        m.position.y = m.userData.baseY + Math.sin(jumpProgress * Math.PI) * 3.0;
                        
                        // Наклон при прыжке
                        if (m.userData.model) m.userData.model.rotation.x = -Math.sin(jumpProgress * Math.PI) * 0.5;
                    } else {
                        m.userData.isJumping = false; m.position.y = m.userData.baseY;
                        if (m.userData.model) m.userData.model.rotation.x = 0;
                        if (dist2D < 6.0) { playerHealth -= 35; updateHUD(); playSound('hurt'); flashDamage(); if (playerHealth <= 0) gameOver(); }
                        m.userData.isRebounding = true; m.userData.reboundStartTime = time;
                    }
                } else if (m.userData.isRebounding) {
                    let reboundProgress = (time - m.userData.reboundStartTime) / 0.25; 
                    if (reboundProgress < 1.0) {
                        let backX = m.position.x - Math.sin(targetRot) * delta * 20.0;
                        let backZ = m.position.z - Math.cos(targetRot) * delta * 20.0;
                        if (!checkWallCollision(backX, m.position.z, mutantRadius)) m.position.x = backX;
                        if (!checkWallCollision(m.position.x, backZ, mutantRadius)) m.position.z = backZ;
                    } else { m.userData.isRebounding = false; m.userData.lastAttack = time; }
                } else if (dist2D > 4.5) { 
                    // Хаотичное стрейфинг (боковое движение)
                    if (m.userData.strafeDir === undefined || time > m.userData.nextStrafeTime) {
                        m.userData.strafeDir = (Math.random() - 0.5) * 2;
                        m.userData.nextStrafeTime = time + Math.random() * 1.5 + 0.5;
                    }

                    // Переменная скорость (рывками)
                    let speedPulse = 1.0 + Math.sin(time * 10) * 0.3;
                    let moveSpeed = 16.0 * speedPulse;
                    
                    let moveX = m.position.x + Math.sin(targetRot) * delta * moveSpeed; 
                    let moveZ = m.position.z + Math.cos(targetRot) * delta * moveSpeed;
                    
                    // Добавляем стрейф
                    moveX += Math.cos(targetRot) * m.userData.strafeDir * delta * 8.0;
                    moveZ -= Math.sin(targetRot) * m.userData.strafeDir * delta * 8.0;

                    if (!checkWallCollision(moveX, m.position.z, mutantRadius)) m.position.x = moveX;
                    if (!checkWallCollision(m.position.x, moveZ, mutantRadius)) m.position.z = moveZ;
                    
                    // Органичное покачивание и наклон в сторону движения
                    if (m.userData.model) {
                        m.userData.model.rotation.z = Math.sin(time * 20) * 0.15 + (m.userData.strafeDir * 0.1);
                        m.userData.model.position.y = 2.4 + Math.abs(Math.sin(time * 20)) * 0.3; // Подпрыгивание при беге
                    }
                } else {
                    if (time - (m.userData.lastAttack || 0) > 0.3) {
                        m.userData.isJumping = true; m.userData.jumpStartTime = time;
                        m.userData.jumpStartX = m.position.x; m.userData.jumpStartZ = m.position.z;
                        
                        let attackDirX = yawObject.position.x - m.position.x;
                        let attackDirZ = yawObject.position.z - m.position.z;
                        let attackLen = Math.hypot(attackDirX, attackDirZ);
                        let safeDist = 3.0;
                        if (attackLen > 0) {
                            attackDirX /= attackLen;
                            attackDirZ /= attackLen;
                        }
                        m.userData.jumpTargetX = yawObject.position.x - attackDirX * safeDist;
                        m.userData.jumpTargetZ = yawObject.position.z - attackDirZ * safeDist;
                        
                        m.userData.baseY = m.position.y;
                        playSound('monster_aggro'); // Повторный рык при атаке
                    }
                }
            }
        });

        newEnemies.forEach(n => {
            if (n.userData.dead) return;
            
            let dirToPlayer = new THREE.Vector3().subVectors(yawObject.position, n.position);
            let dist = dirToPlayer.length();
            dirToPlayer.normalize();
            
            let playerForward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
            let dot = playerForward.dot(dirToPlayer.clone().negate());
            let isIlluminated = (dist < 28 && dot > 0.85); 
            let isTooClose = (dist < 8); 

            if (n.userData.state === 'patrol') {
                // Проверка на обнаружение игрока
                if (isIlluminated || isTooClose) {
                    raycaster.set(n.position, dirToPlayer);
                    let intersects = raycaster.intersectObjects(walls);
                    let sightClear = true; 
                    if (intersects.length > 0 && intersects[0].distance < dist) sightClear = false;

                    if (sightClear) {
                        n.userData.state = 'chase';
                        playSound('monster_aggro');
                        
                        // Переключаем анимацию на бег
                        if (newEnemyAnimations['run'] && n.userData.mixer) {
                            const runAction = n.userData.mixer.clipAction(newEnemyAnimations['run']);
                            runAction.reset().play();
                            if (n.userData.currentAction) {
                                n.userData.currentAction.crossFadeTo(runAction, 0.5, true);
                            }
                            n.userData.currentAction = runAction;
                        }
                    }
                }

                if (n.userData.state === 'patrol') {
                    if (n.userData.patrolAngle === undefined) {
                        // Выбираем одно из 4 направлений (вдоль коридоров)
                        n.userData.patrolAngle = Math.floor(Math.random() * 4) * (Math.PI / 2);
                        n.userData.nextTurnTime = time + Math.random() * 4 + 2;
                    }

                    // Проверяем, свободен ли путь впереди
                    let checkDist = 2.5;
                    let forwardX = n.position.x + Math.sin(n.userData.patrolAngle) * checkDist;
                    let forwardZ = n.position.z + Math.cos(n.userData.patrolAngle) * checkDist;
                    let hitWallAhead = checkWallCollision(forwardX, n.position.z, mutantRadius) || checkWallCollision(n.position.x, forwardZ, mutantRadius);

                    if (hitWallAhead || time > n.userData.nextTurnTime) {
                        let possibleAngles = [0, Math.PI/2, Math.PI, Math.PI*1.5];
                        possibleAngles.sort(() => Math.random() - 0.5); // Случайный порядок
                        for (let a of possibleAngles) {
                            let cx = n.position.x + Math.sin(a) * checkDist;
                            let cz = n.position.z + Math.cos(a) * checkDist;
                            if (!checkWallCollision(cx, n.position.z, mutantRadius) && !checkWallCollision(n.position.x, cz, mutantRadius)) {
                                n.userData.patrolAngle = a;
                                break;
                            }
                        }
                        n.userData.nextTurnTime = time + Math.random() * 4 + 2;
                    }

                    let angleDiff = n.userData.patrolAngle - n.rotation.y;
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                    n.rotation.y += angleDiff * delta * 3; // Плавный поворот

                    let moveX = n.position.x + Math.sin(n.rotation.y) * delta * 3.5; 
                    let moveZ = n.position.z + Math.cos(n.rotation.y) * delta * 3.5;

                    if (!checkWallCollision(moveX, n.position.z, mutantRadius)) {
                        n.position.x = moveX;
                    }
                    if (!checkWallCollision(n.position.x, moveZ, mutantRadius)) {
                        n.position.z = moveZ;
                    }
                }
            } 
            
            if (n.userData.state === 'chase') {
                let targetRot = Math.atan2(yawObject.position.x - n.position.x, yawObject.position.z - n.position.z);
                
                let angleDiff = targetRot - n.rotation.y;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                n.rotation.y += angleDiff * delta * 10; 

                let moveX = n.position.x + Math.sin(n.rotation.y) * delta * 8.0; // Бежит быстрее
                let moveZ = n.position.z + Math.cos(n.rotation.y) * delta * 8.0;

                if (!checkWallCollision(moveX, n.position.z, mutantRadius)) {
                    n.position.x = moveX;
                }
                if (!checkWallCollision(n.position.x, moveZ, mutantRadius)) {
                    n.position.z = moveZ;
                }

                // Нанесение урона игроку
                if (dist < 2.5 && time - lastDamageTime > 1.0) {
                    playerHP -= 20;
                    lastDamageTime = time;
                    playSound('player_hurt');
                    updateHUD();
                    
                    const dmgOverlay = document.getElementById('damage-overlay');
                    if (dmgOverlay) {
                        dmgOverlay.style.opacity = '1';
                        setTimeout(() => { dmgOverlay.style.opacity = '0'; }, 300);
                    }

                    if (playerHP <= 0) {
                        isDead = true;
                        if(audioCtx && audioCtx.state === 'running') audioCtx.suspend();
                        const deathScreen = document.getElementById('death-screen');
                        if (deathScreen) deathScreen.style.display = 'flex';
                        document.exitPointerLock();
                    }
                }
            }

            if (n.userData.model) {
                if (n.userData.baseY === undefined) {
                    n.userData.baseY = n.userData.model.position.y;
                }
                // Removed procedural crawling animation since we now use Mixamo animation
                n.userData.model.position.y = n.userData.baseY;
            }
        });

        newEnemyMixers.forEach(mixer => mixer.update(delta));

        drawMinimap();
        renderer.render(scene, camera);
    }

    return () => {
        isCleanedUp = true;
        cancelAnimationFrame(animationId);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('resize', onWindowResize);
        if (btnStart) btnStart.removeEventListener('click', () => startGame());
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close();
        }
        renderer.dispose();
    };
}
