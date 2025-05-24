'use strict'

var FluidParticles = (function () {
    var FOV = Math.PI / 3;

    var State = {
        EDITING: 0,
        SIMULATING: 1
    };

    var GRID_WIDTH = 40,
        GRID_HEIGHT = 20,
        GRID_DEPTH = 20;

    var PARTICLES_PER_CELL = 10;

    // 性能和质量设置
    var QualitySettings = {
        LOW: {
            particlesPerCell: 5,
            gridMultiplier: 0.7,
            maxParticles: 50000,
            renderScale: 0.8,
            enableAdvancedEffects: false
        },
        MEDIUM: {
            particlesPerCell: 10,
            gridMultiplier: 1.0,
            maxParticles: 100000,
            renderScale: 1.0,
            enableAdvancedEffects: true
        },
        HIGH: {
            particlesPerCell: 15,
            gridMultiplier: 1.3,
            maxParticles: 200000,
            renderScale: 1.0,
            enableAdvancedEffects: true
        },
        ULTRA: {
            particlesPerCell: 20,
            gridMultiplier: 1.5,
            maxParticles: 500000,
            renderScale: 1.0,
            enableAdvancedEffects: true
        }
    };

    var currentQuality = 'MEDIUM';

    function FluidParticles () {

        var canvas = this.canvas = document.getElementById('canvas');
        var wgl = this.wgl = new WrappedGL(canvas);

        window.wgl = wgl;

        this.projectionMatrix = Utilities.makePerspectiveMatrix(new Float32Array(16), FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);
        this.camera = new Camera(this.canvas, [GRID_WIDTH / 2, GRID_HEIGHT / 3, GRID_DEPTH / 2]);

        // 性能监控
        this.performanceMonitor = new PerformanceMonitor();
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 60;
        
        // 高级参数
        this.advancedParams = {
            surfaceTension: 0.1,
            viscosity: 0.01,
            gridResolution: 40,
            interactionStrength: 50
        };

        var boxEditorLoaded = false,
            simulatorRendererLoaded = false;

        this.boxEditor = new BoxEditor.BoxEditor(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            boxEditorLoaded = true;
            if (boxEditorLoaded && simulatorRendererLoaded) {
                start.call(this);
            }
        }).bind(this),
        (function () {
            this.redrawUI(); 
        }).bind(this));

        this.simulatorRenderer = new SimulatorRenderer(this.canvas, this.wgl, this.projectionMatrix, this.camera, [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH], (function () {
            simulatorRendererLoaded = true;
            if (boxEditorLoaded && simulatorRendererLoaded) {
                start.call(this);
            }
        }).bind(this));

        function start(programs) {
            this.state = State.EDITING;

            this.startButton = document.getElementById('start-button');

            this.startButton.addEventListener('click', (function () {
                if (this.state === State.EDITING) {
                    if (this.boxEditor.boxes.length > 0) {
                        this.startSimulation();
                    }
                    this.redrawUI();
                } else if (this.state === State.SIMULATING) {
                    this.stopSimulation();
                    this.redrawUI();
                }
            }).bind(this));

            this.currentPresetIndex = 0;
            this.editedSinceLastPreset = false; //whether the user has edited the last set preset
            var PRESETS = [
                //dam break
                [
                    new BoxEditor.AABB([0, 0, 0], [15, 20, 20]) 
                ],

                //block drop
                [
                    new BoxEditor.AABB([0, 0, 0], [40, 7, 20]),
                    new BoxEditor.AABB([12, 12, 5], [28, 20, 15]) 
                ],

                //double splash
                [
                    new BoxEditor.AABB([0, 0, 0], [10, 20, 15]),
                    new BoxEditor.AABB([30, 0, 5], [40, 20, 20]) 
                ],

            ];
            
            this.presetButton = document.getElementById('preset-button');
            this.presetButton.addEventListener('click', (function () {
                this.editedSinceLastPreset = false;

                this.boxEditor.boxes.length = 0;

                var preset = PRESETS[this.currentPresetIndex];
                for (var i = 0; i < preset.length; ++i) {
                    this.boxEditor.boxes.push(preset[i].clone());
                }

                this.currentPresetIndex = (this.currentPresetIndex + 1) % PRESETS.length; 

                this.redrawUI();

            }).bind(this));



            ////////////////////////////////////////////////////////
            // parameters/sliders

            //using gridCellDensity ensures a linear relationship to particle count
            this.gridCellDensity = 0.5; //simulation grid cell density per world space unit volume

            this.timeStep = 1.0 / 60.0;

            // 使用原生滑块，直接操作DOM元素
            this.densitySliderElement = document.getElementById('density-slider');
            this.densityValueElement = document.getElementById('density-value');
            
            // 设置密度滑块初始值和事件
            this.densitySliderElement.value = this.gridCellDensity;
            this.densityValueElement.textContent = this.gridCellDensity.toFixed(2);
            this.densitySliderElement.addEventListener('input', (function(event) {
                this.gridCellDensity = parseFloat(event.target.value);
                this.densityValueElement.textContent = this.gridCellDensity.toFixed(2);
                this.redrawUI();
            }).bind(this));

            this.fluiditySliderElement = document.getElementById('fluidity-slider');
            this.fluidityValueElement = document.getElementById('fluidity-value');
            
            // 设置流动性滑块初始值和事件
            this.fluiditySliderElement.value = this.simulatorRenderer.simulator.flipness;
            this.fluidityValueElement.textContent = this.simulatorRenderer.simulator.flipness.toFixed(2);
            this.fluiditySliderElement.addEventListener('input', (function(event) {
                this.simulatorRenderer.simulator.flipness = parseFloat(event.target.value);
                this.fluidityValueElement.textContent = parseFloat(event.target.value).toFixed(2);
            }).bind(this));

            this.speedSliderElement = document.getElementById('speed-slider');
            this.speedValueElement = document.getElementById('speed-value');
            
            // 设置速度滑块初始值和事件 (转换为FPS)
            var initialFPS = Math.round(1 / this.timeStep);
            this.speedSliderElement.value = initialFPS;
            this.speedValueElement.textContent = initialFPS + ' FPS';
            this.speedSliderElement.addEventListener('input', (function(event) {
                var fps = parseInt(event.target.value);
                this.timeStep = 1.0 / fps;
                this.speedValueElement.textContent = fps + ' FPS';
            }).bind(this));

            // 高级参数滑块
            this.setupAdvancedSliders();


            this.redrawUI();

            // 设置质量控制按钮
            this.setupQualityControls();
            
            // 设置高级设置面板
            this.setupAdvancedPanel();

            // 设置性能监控更新
            this.setupPerformanceMonitoring();

            this.presetButton.click();

            ///////////////////////////////////////////////////////
            // interaction state stuff

            canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
            canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));

            document.addEventListener('keydown', this.onKeyDown.bind(this));
            document.addEventListener('keyup', this.onKeyUp.bind(this));

            window.addEventListener('resize', this.onResize.bind(this));
            this.onResize();


            ////////////////////////////////////////////////////
            // start the update loop

            var lastTime = 0;
            var update = (function (currentTime) {
                var deltaTime = currentTime - lastTime || 0;
                lastTime = currentTime;

                this.update(deltaTime);

                requestAnimationFrame(update);
            }).bind(this);
            update();


        }
    }

    FluidParticles.prototype.onResize = function (event) {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        Utilities.makePerspectiveMatrix(this.projectionMatrix, FOV, this.canvas.width / this.canvas.height, 0.1, 100.0);

        this.simulatorRenderer.onResize(event);
    }

    FluidParticles.prototype.onMouseMove = function (event) {
        event.preventDefault();

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseMove(event);

            if (this.boxEditor.interactionState !== null) {
                this.editedSinceLastPreset = true;
            }
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.onMouseMove(event);
        }
    };

    FluidParticles.prototype.onMouseDown = function (event) {
        event.preventDefault();

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseDown(event);
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.onMouseDown(event);
        }
    };

    FluidParticles.prototype.onMouseUp = function (event) {
        event.preventDefault();

        if (this.state === State.EDITING) {
            this.boxEditor.onMouseUp(event);
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.onMouseUp(event);
        }
    };

    FluidParticles.prototype.onKeyDown = function (event) {
        if (this.state === State.EDITING) {
            this.boxEditor.onKeyDown(event);
        }
    };

    FluidParticles.prototype.onKeyUp = function (event) {
        if (this.state === State.EDITING) {
            this.boxEditor.onKeyUp(event);
        }
    };

    //the UI elements are all created in the constructor, this just updates the DOM elements
    //should be called every time state changes
    FluidParticles.prototype.redrawUI = function () {

        var simulatingElements = document.querySelectorAll('.simulating-ui');
        var editingElements = document.querySelectorAll('.editing-ui');


        if (this.state === State.SIMULATING) {
            for (var i = 0; i < simulatingElements.length; ++i) {
                simulatingElements[i].style.display = 'block';
            }

            for (var i = 0; i < editingElements.length; ++i) {
                editingElements[i].style.display = 'none';
            }


            document.getElementById('start-text').textContent = '编辑模式';
            this.startButton.className = 'primary-button';
        } else if (this.state === State.EDITING) {
            for (var i = 0; i < simulatingElements.length; ++i) {
                simulatingElements[i].style.display = 'none';
            }

            for (var i = 0; i < editingElements.length; ++i) {
                editingElements[i].style.display = 'block';
            }

            document.getElementById('particle-count').innerHTML = this.getParticleCount().toFixed(0) + ' particles';

            if (this.boxEditor.boxes.length >= 2 ||
                this.boxEditor.boxes.length === 1 && (this.boxEditor.interactionState === null || this.boxEditor.interactionState.mode !== BoxEditor.InteractionMode.EXTRUDING && this.boxEditor.interactionState.mode !== BoxEditor.InteractionMode.DRAWING)) { 
                this.startButton.className = 'primary-button';
                this.startButton.style.opacity = '1';
                this.startButton.style.pointerEvents = 'auto';
            } else {
                this.startButton.className = 'primary-button';
                this.startButton.style.opacity = '0.5';
                this.startButton.style.pointerEvents = 'none';
            }

            document.getElementById('start-text').textContent = '开始模拟';

            if (this.editedSinceLastPreset) {
                this.presetButton.querySelector('span').textContent = '使用预设';
            } else {
                this.presetButton.querySelector('span').textContent = '下个预设';
            }
        }

        // 更新原生滑块的值（如果需要的话）
        if (this.fluiditySliderElement) {
            this.fluiditySliderElement.value = this.simulatorRenderer.simulator.flipness;
            this.fluidityValueElement.textContent = this.simulatorRenderer.simulator.flipness.toFixed(2);
        }
        if (this.densitySliderElement) {
            this.densitySliderElement.value = this.gridCellDensity;
            this.densityValueElement.textContent = this.gridCellDensity.toFixed(2);
        }
        if (this.speedSliderElement) {
            var fps = Math.round(1 / this.timeStep);
            this.speedSliderElement.value = fps;
            this.speedValueElement.textContent = fps + ' FPS';
        }
    }


    //compute the number of particles for the current boxes and grid density
    FluidParticles.prototype.getParticleCount = function () {
        var boxEditor = this.boxEditor;

        var gridCells = GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

        //assuming x:y:z ratio of 2:1:1
        var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
        var gridResolutionZ = gridResolutionY * 1;
        var gridResolutionX = gridResolutionY * 2;

        var totalGridCells = gridResolutionX * gridResolutionY * gridResolutionZ;


        var totalVolume = 0;
        var cumulativeVolume = []; //at index i, contains the total volume up to and including box i (so index 0 has volume of first box, last index has total volume)

        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            var box = boxEditor.boxes[i];
            var volume = box.computeVolume();

            totalVolume += volume;
            cumulativeVolume[i] = totalVolume;
        }

        var fractionFilled = totalVolume / (GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH);

        var desiredParticleCount = fractionFilled * totalGridCells * PARTICLES_PER_CELL; //theoretical number of particles

        return desiredParticleCount;
    }

    //begin simulation using boxes from box editor
    //EDITING -> SIMULATING
    FluidParticles.prototype.startSimulation = function () {
        this.state = State.SIMULATING;

        var desiredParticleCount = this.getParticleCount(); //theoretical number of particles
        var particlesWidth = 512; //we fix particlesWidth
        var particlesHeight = Math.ceil(desiredParticleCount / particlesWidth); //then we calculate the particlesHeight that produces the closest particle count

        var particleCount = particlesWidth * particlesHeight;
        var particlePositions = [];
        
        var boxEditor = this.boxEditor;

        var totalVolume = 0;
        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            totalVolume += boxEditor.boxes[i].computeVolume();
        }

        var particlesCreatedSoFar = 0;
        for (var i = 0; i < boxEditor.boxes.length; ++i) {
            var box = boxEditor.boxes[i];
            
            var particlesInBox = 0;
            if (i < boxEditor.boxes.length - 1) { 
                particlesInBox = Math.floor(particleCount * box.computeVolume() / totalVolume);
            } else { //for the last box we just use up all the remaining particles
                particlesInBox = particleCount - particlesCreatedSoFar;
            }

            for (var j = 0; j < particlesInBox; ++j) {
                var position = box.randomPoint();
                particlePositions.push(position);
            }

            particlesCreatedSoFar += particlesInBox;
        }

        var gridCells = GRID_WIDTH * GRID_HEIGHT * GRID_DEPTH * this.gridCellDensity;

        //assuming x:y:z ratio of 2:1:1
        var gridResolutionY = Math.ceil(Math.pow(gridCells / 2, 1.0 / 3.0));
        var gridResolutionZ = gridResolutionY * 1;
        var gridResolutionX = gridResolutionY * 2;


        var gridSize = [GRID_WIDTH, GRID_HEIGHT, GRID_DEPTH];
        var gridResolution = [gridResolutionX, gridResolutionY, gridResolutionZ];

        var sphereRadius = 7.0 / gridResolutionX;
        this.simulatorRenderer.reset(particlesWidth, particlesHeight, particlePositions, gridSize, gridResolution, PARTICLES_PER_CELL, sphereRadius);

        this.camera.setBounds(0, Math.PI / 2);
    }

    //go back to box editing
    //SIMULATING -> EDITING
    FluidParticles.prototype.stopSimulation = function () {
        this.state = State.EDITING;

        this.camera.setBounds(-Math.PI / 4, Math.PI / 4);
    }

    FluidParticles.prototype.update = function (deltaTime) {
        // 性能监控更新
        this.updatePerformanceMonitoring(deltaTime);
        
        if (this.state === State.EDITING) {
            this.boxEditor.draw();
        } else if (this.state === State.SIMULATING) {
            this.simulatorRenderer.update(this.timeStep);
        }
    }

    // 设置高级参数滑块
    FluidParticles.prototype.setupAdvancedSliders = function() {
        // 网格分辨率滑块
        this.resolutionSliderElement = document.getElementById('resolution-slider');
        this.resolutionValueElement = document.getElementById('resolution-value');
        if (this.resolutionSliderElement) {
            this.resolutionSliderElement.value = this.advancedParams.gridResolution;
            this.resolutionValueElement.textContent = this.advancedParams.gridResolution;
            this.resolutionSliderElement.addEventListener('input', (function(event) {
                this.advancedParams.gridResolution = parseInt(event.target.value);
                GRID_WIDTH = this.advancedParams.gridResolution;
                GRID_HEIGHT = Math.round(this.advancedParams.gridResolution * 0.5);
                GRID_DEPTH = Math.round(this.advancedParams.gridResolution * 0.5);
                this.resolutionValueElement.textContent = this.advancedParams.gridResolution;
                this.redrawUI();
            }).bind(this));
        }

        // 表面张力滑块
        this.tensionSliderElement = document.getElementById('tension-slider');
        this.tensionValueElement = document.getElementById('tension-value');
        if (this.tensionSliderElement) {
            this.tensionSliderElement.value = this.advancedParams.surfaceTension;
            this.tensionValueElement.textContent = this.advancedParams.surfaceTension.toFixed(2);
            this.tensionSliderElement.addEventListener('input', (function(event) {
                this.advancedParams.surfaceTension = parseFloat(event.target.value);
                this.tensionValueElement.textContent = this.advancedParams.surfaceTension.toFixed(2);
                if (this.simulatorRenderer && this.simulatorRenderer.simulator) {
                    this.simulatorRenderer.simulator.surfaceTension = this.advancedParams.surfaceTension;
                }
            }).bind(this));
        }

        // 粘性滑块
        this.viscositySliderElement = document.getElementById('viscosity-slider');
        this.viscosityValueElement = document.getElementById('viscosity-value');
        if (this.viscositySliderElement) {
            this.viscositySliderElement.value = this.advancedParams.viscosity;
            this.viscosityValueElement.textContent = this.advancedParams.viscosity.toFixed(3);
            this.viscositySliderElement.addEventListener('input', (function(event) {
                this.advancedParams.viscosity = parseFloat(event.target.value);
                this.viscosityValueElement.textContent = this.advancedParams.viscosity.toFixed(3);
                if (this.simulatorRenderer && this.simulatorRenderer.simulator) {
                    this.simulatorRenderer.simulator.viscosity = this.advancedParams.viscosity;
                }
            }).bind(this));
        }
    };

    // 设置质量控制
    FluidParticles.prototype.setupQualityControls = function() {
        const qualityBtns = document.querySelectorAll('.quality-btn');
        qualityBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const quality = e.target.getAttribute('data-quality').toUpperCase();
                this.setQuality(quality);
                
                // 更新按钮状态
                qualityBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
    };

    // 设置质量级别
    FluidParticles.prototype.setQuality = function(quality) {
        if (!QualitySettings[quality]) return;
        
        currentQuality = quality;
        const settings = QualitySettings[quality];
        
        PARTICLES_PER_CELL = settings.particlesPerCell;
        
        // 更新渲染比例
        if (settings.renderScale !== 1.0) {
            this.canvas.style.transform = `scale(${settings.renderScale})`;
            this.canvas.style.transformOrigin = 'top left';
        } else {
            this.canvas.style.transform = '';
        }
        
        // 如果正在模拟，重新启动以应用新设置
        if (this.state === State.SIMULATING) {
            this.stopSimulation();
            setTimeout(() => {
                this.startSimulation();
            }, 100);
        }
        
        this.redrawUI();
    };

    // 设置高级设置面板
    FluidParticles.prototype.setupAdvancedPanel = function() {
        const toggleBtn = document.getElementById('toggle-advanced');
        const panel = document.getElementById('advanced-panel');
        
        if (toggleBtn && panel) {
            toggleBtn.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
                toggleBtn.querySelector('span').textContent = isVisible ? '高级设置' : '隐藏设置';
            });
        }

        // 交互强度滑块
        const interactionSlider = document.getElementById('interaction-strength');
        if (interactionSlider) {
            interactionSlider.addEventListener('input', (e) => {
                this.advancedParams.interactionStrength = parseInt(e.target.value);
                if (this.simulatorRenderer) {
                    this.simulatorRenderer.interactionStrength = this.advancedParams.interactionStrength / 100;
                }
            });
        }
    };

    // 设置性能监控
    FluidParticles.prototype.setupPerformanceMonitoring = function() {
        this.fpsDisplay = document.getElementById('fps-display');
        this.particleDisplay = document.getElementById('particle-display');
        this.memoryDisplay = document.getElementById('memory-display');
        
        // 定期更新性能显示
        setInterval(() => {
            this.updatePerformanceDisplay();
        }, 1000);
    };

    // 更新性能监控
    FluidParticles.prototype.updatePerformanceMonitoring = function(deltaTime) {
        this.frameCount++;
        const currentTime = performance.now();
        
        if (currentTime - this.lastFrameTime >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime));
            this.frameCount = 0;
            this.lastFrameTime = currentTime;
        }
    };

    // 更新性能显示
    FluidParticles.prototype.updatePerformanceDisplay = function() {
        if (this.fpsDisplay) {
            this.fpsDisplay.textContent = this.fps;
            this.fpsDisplay.style.color = this.fps >= 45 ? '#22c55e' : this.fps >= 25 ? '#f59e0b' : '#ef4444';
        }
        
        if (this.particleDisplay && this.simulatorRenderer) {
            const particleCount = this.getParticleCount();
            this.particleDisplay.textContent = Math.round(particleCount).toLocaleString();
        }
        
        if (this.memoryDisplay && this.wgl && this.wgl.getExtension) {
            try {
                const ext = this.wgl.getExtension('WEBGL_debug_renderer_info');
                if (ext) {
                    // 估算GPU内存使用量
                    const estimatedMemory = Math.round(this.getParticleCount() * 64 / (1024 * 1024)); // 粗略估计
                    this.memoryDisplay.textContent = estimatedMemory + ' MB';
                }
            } catch(e) {
                this.memoryDisplay.textContent = 'N/A';
            }
        }
    };

    // 性能监控类
    function PerformanceMonitor() {
        this.frameTimeHistory = [];
        this.maxHistoryLength = 60;
        this.gpuMemoryUsage = 0;
    }

    PerformanceMonitor.prototype.recordFrameTime = function(frameTime) {
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > this.maxHistoryLength) {
            this.frameTimeHistory.shift();
        }
    };

    PerformanceMonitor.prototype.getAverageFPS = function() {
        if (this.frameTimeHistory.length === 0) return 60;
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length;
        return Math.round(1000 / avgFrameTime);
    };

    return FluidParticles;
}());

