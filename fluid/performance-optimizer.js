'use strict';

// 高性能优化工具集
var PerformanceOptimizer = (function() {
    
    // 数学优化函数集合
    var MathUtils = {
        // 高精度平方根（牛顿法）
        fastSqrt: function(x) {
            if (x === 0) return 0;
            let guess = x;
            let prev = 0;
            while (Math.abs(guess - prev) > 1e-10) {
                prev = guess;
                guess = (guess + x / guess) * 0.5;
            }
            return guess;
        },

        // 快速反平方根（用于向量归一化）
        fastInvSqrt: function(x) {
            const threehalfs = 1.5;
            let x2 = x * 0.5;
            let y = x;
            
            // 位操作优化（在JavaScript中模拟）
            let i = new Float32Array([y]);
            let iView = new Uint32Array(i.buffer);
            iView[0] = 0x5f3759df - (iView[0] >> 1);
            y = i[0];
            
            y = y * (threehalfs - (x2 * y * y));
            y = y * (threehalfs - (x2 * y * y)); // 第二次迭代提高精度
            return y;
        },

        // 插值函数优化
        lerp: function(a, b, t) {
            return a + t * (b - a);
        },

        smoothstep: function(edge0, edge1, x) {
            const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
            return t * t * (3 - 2 * t);
        },

        // 向量操作优化
        vec3: {
            create: function() {
                return new Float32Array(3);
            },
            
            set: function(out, x, y, z) {
                out[0] = x;
                out[1] = y;
                out[2] = z;
                return out;
            },
            
            add: function(out, a, b) {
                out[0] = a[0] + b[0];
                out[1] = a[1] + b[1];
                out[2] = a[2] + b[2];
                return out;
            },
            
            subtract: function(out, a, b) {
                out[0] = a[0] - b[0];
                out[1] = a[1] - b[1];
                out[2] = a[2] - b[2];
                return out;
            },
            
            scale: function(out, a, s) {
                out[0] = a[0] * s;
                out[1] = a[1] * s;
                out[2] = a[2] * s;
                return out;
            },
            
            dot: function(a, b) {
                return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
            },
            
            length: function(a) {
                return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
            },
            
            normalize: function(out, a) {
                const len = this.length(a);
                if (len > 0) {
                    const invLen = 1 / len;
                    out[0] = a[0] * invLen;
                    out[1] = a[1] * invLen;
                    out[2] = a[2] * invLen;
                }
                return out;
            },
            
            cross: function(out, a, b) {
                const ax = a[0], ay = a[1], az = a[2];
                const bx = b[0], by = b[1], bz = b[2];
                
                out[0] = ay * bz - az * by;
                out[1] = az * bx - ax * bz;
                out[2] = ax * by - ay * bx;
                return out;
            }
        }
    };

    // 内存池管理器
    var ObjectPool = function(createFn, resetFn, initialSize) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.pool = [];
        this.active = [];
        
        // 预分配对象
        for (let i = 0; i < (initialSize || 100); i++) {
            this.pool.push(this.createFn());
        }
    };

    ObjectPool.prototype.acquire = function() {
        let obj;
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        this.active.push(obj);
        return obj;
    };

    ObjectPool.prototype.release = function(obj) {
        const index = this.active.indexOf(obj);
        if (index !== -1) {
            this.active.splice(index, 1);
            if (this.resetFn) {
                this.resetFn(obj);
            }
            this.pool.push(obj);
        }
    };

    ObjectPool.prototype.releaseAll = function() {
        while (this.active.length > 0) {
            this.release(this.active[0]);
        }
    };

    // GPU资源管理器
    var GPUResourceManager = function(wgl) {
        this.wgl = wgl;
        this.textures = new Map();
        this.buffers = new Map();
        this.programs = new Map();
        this.memoryUsage = 0;
        this.maxMemoryUsage = 0;
    };

    GPUResourceManager.prototype.createTexture = function(id, width, height, format, type) {
        if (this.textures.has(id)) {
            this.deleteTexture(id);
        }
        
        const texture = this.wgl.createTexture();
        this.wgl.bindTexture(this.wgl.TEXTURE_2D, texture);
        this.wgl.texImage2D(this.wgl.TEXTURE_2D, 0, format, width, height, 0, format, type, null);
        
        const memorySize = this.calculateTextureMemory(width, height, format, type);
        this.textures.set(id, {
            texture: texture,
            width: width,
            height: height,
            format: format,
            type: type,
            memorySize: memorySize
        });
        
        this.memoryUsage += memorySize;
        this.maxMemoryUsage = Math.max(this.maxMemoryUsage, this.memoryUsage);
        
        return texture;
    };

    GPUResourceManager.prototype.deleteTexture = function(id) {
        const textureInfo = this.textures.get(id);
        if (textureInfo) {
            this.wgl.deleteTexture(textureInfo.texture);
            this.memoryUsage -= textureInfo.memorySize;
            this.textures.delete(id);
        }
    };

    GPUResourceManager.prototype.calculateTextureMemory = function(width, height, format, type) {
        let bytesPerPixel = 4; // 默认RGBA
        
        // 根据格式和类型计算实际字节数
        if (type === this.wgl.HALF_FLOAT_OES) {
            bytesPerPixel *= 2;
        } else if (type === this.wgl.FLOAT) {
            bytesPerPixel *= 4;
        }
        
        return width * height * bytesPerPixel;
    };

    GPUResourceManager.prototype.getMemoryUsage = function() {
        return {
            current: this.memoryUsage,
            max: this.maxMemoryUsage,
            currentMB: (this.memoryUsage / (1024 * 1024)).toFixed(2),
            maxMB: (this.maxMemoryUsage / (1024 * 1024)).toFixed(2)
        };
    };

    // 渲染优化器
    var RenderOptimizer = function(wgl) {
        this.wgl = wgl;
        this.lastProgram = null;
        this.lastTextures = new Array(16).fill(null);
        this.lastBuffers = new Array(16).fill(null);
        this.stateChanges = 0;
        this.drawCalls = 0;
    };

    RenderOptimizer.prototype.useProgram = function(program) {
        if (this.lastProgram !== program) {
            this.wgl.useProgram(program);
            this.lastProgram = program;
            this.stateChanges++;
        }
    };

    RenderOptimizer.prototype.bindTexture = function(unit, target, texture) {
        if (this.lastTextures[unit] !== texture) {
            this.wgl.activeTexture(this.wgl.TEXTURE0 + unit);
            this.wgl.bindTexture(target, texture);
            this.lastTextures[unit] = texture;
            this.stateChanges++;
        }
    };

    RenderOptimizer.prototype.bindBuffer = function(target, buffer) {
        const key = target === this.wgl.ARRAY_BUFFER ? 'array' : 'element';
        if (this.lastBuffers[key] !== buffer) {
            this.wgl.bindBuffer(target, buffer);
            this.lastBuffers[key] = buffer;
            this.stateChanges++;
        }
    };

    RenderOptimizer.prototype.drawArrays = function(mode, first, count) {
        this.wgl.drawArrays(mode, first, count);
        this.drawCalls++;
    };

    RenderOptimizer.prototype.resetStats = function() {
        this.stateChanges = 0;
        this.drawCalls = 0;
    };

    RenderOptimizer.prototype.getStats = function() {
        return {
            stateChanges: this.stateChanges,
            drawCalls: this.drawCalls
        };
    };

    // 自适应质量控制器
    var AdaptiveQualityController = function(targetFPS) {
        this.targetFPS = targetFPS || 60;
        this.currentFPS = 60;
        this.frameTimeHistory = [];
        this.qualityLevel = 1.0;
        this.minQuality = 0.3;
        this.maxQuality = 1.0;
        this.adjustmentRate = 0.05;
        this.stableFrameCount = 0;
        this.unstableFrameCount = 0;
        this.stableThreshold = 30; // 30帧稳定后才调整
    };

    AdaptiveQualityController.prototype.update = function(frameTime) {
        this.frameTimeHistory.push(frameTime);
        if (this.frameTimeHistory.length > 60) {
            this.frameTimeHistory.shift();
        }
        
        const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b) / this.frameTimeHistory.length;
        this.currentFPS = 1000 / avgFrameTime;
        
        const targetFrameTime = 1000 / this.targetFPS;
        const performance = targetFrameTime / avgFrameTime;
        
        if (performance < 0.9) { // 性能不足
            this.unstableFrameCount++;
            this.stableFrameCount = 0;
            
            if (this.unstableFrameCount > 10) {
                this.qualityLevel = Math.max(this.minQuality, 
                    this.qualityLevel - this.adjustmentRate);
            }
        } else if (performance > 1.2) { // 性能过剩
            this.stableFrameCount++;
            this.unstableFrameCount = 0;
            
            if (this.stableFrameCount > this.stableThreshold) {
                this.qualityLevel = Math.min(this.maxQuality, 
                    this.qualityLevel + this.adjustmentRate * 0.5);
                this.stableFrameCount = 0;
            }
        } else {
            this.stableFrameCount++;
            this.unstableFrameCount = 0;
        }
        
        return this.qualityLevel;
    };

    AdaptiveQualityController.prototype.getQualitySettings = function() {
        return {
            particleScale: this.qualityLevel,
            gridScale: Math.sqrt(this.qualityLevel),
            renderScale: Math.max(0.5, this.qualityLevel),
            enableAdvancedEffects: this.qualityLevel > 0.7
        };
    };

    // WebGL扩展检查和优化
    var WebGLExtensions = function(wgl) {
        this.wgl = wgl;
        this.extensions = {};
        this.checkExtensions();
    };

    WebGLExtensions.prototype.checkExtensions = function() {
        const requiredExtensions = [
            'ANGLE_instanced_arrays',
            'WEBGL_depth_texture',
            'OES_texture_float',
            'OES_texture_float_linear',
            'OES_texture_half_float',
            'OES_texture_half_float_linear',
            'WEBGL_debug_renderer_info',
            'WEBGL_lose_context',
            'OES_vertex_array_object'
        ];
        
        const optionalExtensions = [
            'EXT_color_buffer_float',
            'WEBGL_color_buffer_float',
            'EXT_texture_filter_anisotropic',
            'WEBKIT_WEBGL_compressed_texture_s3tc',
            'MOZ_WEBGL_compressed_texture_s3tc'
        ];
        
        requiredExtensions.forEach(name => {
            this.extensions[name] = this.wgl.getExtension(name);
        });
        
        optionalExtensions.forEach(name => {
            this.extensions[name] = this.wgl.getExtension(name);
        });
    };

    WebGLExtensions.prototype.isSupported = function(extensionName) {
        return !!this.extensions[extensionName];
    };

    WebGLExtensions.prototype.get = function(extensionName) {
        return this.extensions[extensionName];
    };

    WebGLExtensions.prototype.getSupportedFeatures = function() {
        return {
            instancing: this.isSupported('ANGLE_instanced_arrays'),
            floatTextures: this.isSupported('OES_texture_float'),
            halfFloatTextures: this.isSupported('OES_texture_half_float'),
            depthTextures: this.isSupported('WEBGL_depth_texture'),
            vertexArrayObjects: this.isSupported('OES_vertex_array_object'),
            anisotropicFiltering: this.isSupported('EXT_texture_filter_anisotropic'),
            textureCompression: this.isSupported('WEBKIT_WEBGL_compressed_texture_s3tc') || 
                               this.isSupported('MOZ_WEBGL_compressed_texture_s3tc')
        };
    };

    // 主优化器类
    var PerformanceOptimizer = function(wgl) {
        this.wgl = wgl;
        this.mathUtils = MathUtils;
        this.gpuResourceManager = new GPUResourceManager(wgl);
        this.renderOptimizer = new RenderOptimizer(wgl);
        this.adaptiveQuality = new AdaptiveQualityController(60);
        this.webglExtensions = new WebGLExtensions(wgl);
        
        // 对象池
        this.vec3Pool = new ObjectPool(
            () => new Float32Array(3),
            (obj) => obj.fill(0),
            1000
        );
        
        this.matrixPool = new ObjectPool(
            () => new Float32Array(16),
            (obj) => obj.fill(0),
            100
        );
    };

    PerformanceOptimizer.prototype.optimize = function(settings) {
        const features = this.webglExtensions.getSupportedFeatures();
        const qualitySettings = this.adaptiveQuality.getQualitySettings();
        
        return {
            useHalfFloat: features.halfFloatTextures && qualitySettings.enableAdvancedEffects,
            useInstancing: features.instancing,
            particleCount: Math.floor(settings.baseParticleCount * qualitySettings.particleScale),
            gridResolution: {
                x: Math.floor(settings.baseGridResolution.x * qualitySettings.gridScale),
                y: Math.floor(settings.baseGridResolution.y * qualitySettings.gridScale),
                z: Math.floor(settings.baseGridResolution.z * qualitySettings.gridScale)
            },
            renderScale: qualitySettings.renderScale,
            enableAdvancedEffects: qualitySettings.enableAdvancedEffects
        };
    };

    PerformanceOptimizer.prototype.getMemoryInfo = function() {
        return this.gpuResourceManager.getMemoryUsage();
    };

    PerformanceOptimizer.prototype.getRenderStats = function() {
        return this.renderOptimizer.getStats();
    };

    PerformanceOptimizer.prototype.updatePerformance = function(frameTime) {
        return this.adaptiveQuality.update(frameTime);
    };

    return PerformanceOptimizer;
})();

// 全局导出
if (typeof window !== 'undefined') {
    window.PerformanceOptimizer = PerformanceOptimizer;
} 