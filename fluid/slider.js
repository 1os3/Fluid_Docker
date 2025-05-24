'use strict'

var Slider = (function () {

    // 高级滑块组件，支持实时数值显示、动画和性能优化
    var Slider = function (element, initial, min, max, changeCallback, options) {
        this.value = initial;
        this.min = min;
        this.max = max;
        this.options = Object.assign({
            precision: 2,
            step: 0.01,
            animationDuration: 200,
            showTooltip: false, // 默认禁用工具提示
            formatter: null,
            unit: '',
            logarithmic: false
        }, options || {});

        this.div = element;
        this.changeCallback = changeCallback;
        this.mousePressed = false;
        this.isAnimating = false;

        // 创建现代化滑块结构
        this.createSliderElements();
        
        // 查找关联的数值显示元素
        this.valueDisplay = this.findValueDisplay();
        
        // 设置事件监听器
        this.setupEventListeners();
        
        // 初始化显示
        this.redraw();
        this.updateValueDisplay();

        // 性能优化：使用 RAF 进行平滑更新
        this.rafId = null;
        this.pendingUpdate = false;
    };

    Slider.prototype.createSliderElements = function() {
        // 检查是否已经有内容，如果有就使用现有结构
        if (this.div.children.length > 0) {
            // 使用旧的滑块结构
            this.innerDiv = this.div.children[0];
            if (!this.innerDiv) {
                this.innerDiv = document.createElement('div');
                this.innerDiv.style.position = 'absolute';
                this.innerDiv.style.height = this.div.offsetHeight + 'px';
                this.div.appendChild(this.innerDiv);
            }
            return;
        }
        
        // 创建简化的滑块结构，兼容原有CSS
        this.innerDiv = document.createElement('div');
        this.innerDiv.style.position = 'absolute';
        this.innerDiv.style.height = this.div.offsetHeight + 'px';
        this.innerDiv.style.background = 'linear-gradient(90deg, var(--primary-color), var(--accent-color))';
        this.innerDiv.style.borderRadius = '4px';
        this.innerDiv.style.transition = 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
        
        this.div.appendChild(this.innerDiv);

        // 默认禁用工具提示以避免显示问题
        if (this.options.showTooltip && false) {
            this.tooltip = document.createElement('div');
            this.tooltip.className = 'slider-tooltip';
            this.tooltip.style.position = 'absolute';
            this.tooltip.style.bottom = '130%';
            this.tooltip.style.left = '50%';
            this.tooltip.style.transform = 'translateX(-50%) translateY(-100%) scale(0.8)';
            this.tooltip.style.background = 'var(--bg-primary)';
            this.tooltip.style.color = 'var(--text-primary)';
            this.tooltip.style.padding = '4px 8px';
            this.tooltip.style.borderRadius = 'var(--border-radius-sm)';
            this.tooltip.style.fontSize = '11px';
            this.tooltip.style.fontFamily = 'var(--font-family-mono)';
            this.tooltip.style.whiteSpace = 'nowrap';
            this.tooltip.style.opacity = '0';
            this.tooltip.style.transition = 'var(--transition-fast)';
            this.tooltip.style.pointerEvents = 'none';
            this.tooltip.style.boxShadow = 'var(--shadow-md)';
            this.tooltip.style.border = '1px solid var(--border-color)';
            this.tooltip.style.zIndex = '1000';
            
            this.div.appendChild(this.tooltip);
        }
    };

    // 已移除createTicks方法以避免冲突

    Slider.prototype.findValueDisplay = function() {
        // 查找具有相应ID的数值显示元素
        const sliderId = this.div.id;
        if (sliderId) {
            const valueId = sliderId.replace('-slider', '-value');
            return document.getElementById(valueId);
        }
        return null;
    };

    Slider.prototype.setupEventListeners = function() {
        // 鼠标事件
        this.div.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));

        // 触摸事件支持
        this.div.addEventListener('touchstart', this.onTouchStart.bind(this));
        document.addEventListener('touchend', this.onTouchEnd.bind(this));
        document.addEventListener('touchmove', this.onTouchMove.bind(this));

        // 键盘事件
        this.div.addEventListener('keydown', this.onKeyDown.bind(this));
        this.div.setAttribute('tabindex', '0');

        // 滚轮事件
        this.div.addEventListener('wheel', this.onWheel.bind(this));

        // 鼠标进入/离开事件
        this.div.addEventListener('mouseenter', this.onMouseEnter.bind(this));
        this.div.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    };

    Slider.prototype.onMouseDown = function (event) {
        event.preventDefault();
        this.mousePressed = true;
        this.div.classList.add('active');
        this.onChange(event);
        
        // 添加视觉反馈
        this.div.style.transform = 'scale(1.02)';
    };

    Slider.prototype.onMouseUp = function (event) {
        this.mousePressed = false;
        this.div.classList.remove('active');
        this.div.style.transform = '';
    };

    Slider.prototype.onMouseMove = function (event) {
        if (this.mousePressed) {
            this.onChange(event);
        }
    };

    Slider.prototype.onTouchStart = function (event) {
        event.preventDefault();
        this.mousePressed = true;
        this.div.classList.add('active');
        this.onChange(event.touches[0]);
    };

    Slider.prototype.onTouchEnd = function (event) {
        this.mousePressed = false;
        this.div.classList.remove('active');
    };

    Slider.prototype.onTouchMove = function (event) {
        if (this.mousePressed) {
            event.preventDefault();
            this.onChange(event.touches[0]);
        }
    };

    Slider.prototype.onKeyDown = function (event) {
        let delta = 0;
        const stepSize = (this.max - this.min) * 0.01;
        
        switch (event.keyCode) {
            case 37: // 左箭头
            case 40: // 下箭头
                delta = -stepSize;
                break;
            case 39: // 右箭头
            case 38: // 上箭头
                delta = stepSize;
                break;
            case 36: // Home
                this.setValue(this.min);
                return;
            case 35: // End
                this.setValue(this.max);
                return;
            default:
                return;
        }
        
        event.preventDefault();
        this.setValue(this.value + delta);
    };

    Slider.prototype.onWheel = function (event) {
        if (this.div.matches(':hover')) {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -0.01 : 0.01;
            const stepSize = (this.max - this.min) * delta;
            this.setValue(this.value + stepSize);
        }
    };

    Slider.prototype.onMouseEnter = function () {
        this.div.classList.add('hover');
        // 移除工具提示显示逻辑以避免显示问题
    };

    Slider.prototype.onMouseLeave = function () {
        this.div.classList.remove('hover');
        // 移除工具提示隐藏逻辑以避免显示问题
    };

    Slider.prototype.redraw = function () {
        if (this.isAnimating) return;
        
        const fraction = this.logarithmic ? 
            this.getLogarithmicFraction() : 
            (this.value - this.min) / (this.max - this.min);
        
        // 使用 RAF 进行平滑动画
        if (!this.pendingUpdate) {
            this.pendingUpdate = true;
            this.rafId = requestAnimationFrame(() => {
                this.updateSliderPosition(fraction);
                this.pendingUpdate = false;
            });
        }
    };

    Slider.prototype.updateSliderPosition = function(fraction) {
        const percentage = fraction * 100;
        
        // 更新内部div的宽度（兼容旧版结构）
        if (this.innerDiv) {
            this.innerDiv.style.width = percentage + '%';
        }
        
        // 移除工具提示更新逻辑以避免显示问题
    };

    Slider.prototype.getLogarithmicFraction = function() {
        const logMin = Math.log(this.min);
        const logMax = Math.log(this.max);
        const logValue = Math.log(this.value);
        return (logValue - logMin) / (logMax - logMin);
    };

    Slider.prototype.getLogarithmicValue = function(fraction) {
        const logMin = Math.log(this.min);
        const logMax = Math.log(this.max);
        return Math.exp(logMin + fraction * (logMax - logMin));
    };

    Slider.prototype.onChange = function (event) {
        const rect = this.div.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const fraction = Utilities.clamp(mouseX / rect.width, 0, 1);
        
        let newValue;
        if (this.options.logarithmic) {
            newValue = this.getLogarithmicValue(fraction);
        } else {
            newValue = fraction * (this.max - this.min) + this.min;
        }
        
        // 应用步长
        if (this.options.step > 0) {
            newValue = Math.round(newValue / this.options.step) * this.options.step;
        }
        
        this.setValue(newValue);
    };

    Slider.prototype.setValue = function(value, animate = false) {
        const oldValue = this.value;
        this.value = Utilities.clamp(value, this.min, this.max);
        
        if (animate && Math.abs(this.value - oldValue) > 0.001) {
            this.animateToValue(oldValue, this.value);
        } else {
            this.redraw();
            this.updateValueDisplay();
            this.changeCallback(this.value);
        }
    };

    Slider.prototype.animateToValue = function(fromValue, toValue) {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        const startTime = performance.now();
        const duration = this.options.animationDuration;
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // 使用缓动函数
            const easedProgress = this.easeOutCubic(progress);
            const currentValue = fromValue + (toValue - fromValue) * easedProgress;
            
            this.value = currentValue;
            this.redraw();
            this.updateValueDisplay();
            this.changeCallback(this.value);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
            }
        };
        
        requestAnimationFrame(animate);
    };

    Slider.prototype.easeOutCubic = function(t) {
        return 1 - Math.pow(1 - t, 3);
    };

    Slider.prototype.formatValue = function(value) {
        if (this.options.formatter) {
            return this.options.formatter(value);
        }
        
        let formatted = value.toFixed(this.options.precision);
        
        // 移除不必要的零
        if (this.options.precision > 0) {
            formatted = parseFloat(formatted).toString();
        }
        
        return formatted + this.options.unit;
    };

    Slider.prototype.updateValueDisplay = function() {
        if (this.valueDisplay) {
            this.valueDisplay.textContent = this.formatValue(this.value);
            
            // 添加数值变化动画
            this.valueDisplay.classList.add('value-updated');
            setTimeout(() => {
                this.valueDisplay.classList.remove('value-updated');
            }, 300);
        }
    };

    // 销毁方法
    Slider.prototype.destroy = function() {
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
        
        // 清除事件监听器
        this.div.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mouseup', this.onMouseUp);
        document.removeEventListener('mousemove', this.onMouseMove);
        // ... 其他事件监听器
        
        // 清除DOM元素
        this.div.innerHTML = '';
    };

    return Slider;
}());
