// public/style.js

// 1. 状态机轮询系统：严格遵循原版对应的状态切换
const LEVER_STATES = ['high_fatigue', 'low_fatigue', 'mid_fatigue'];
let globalStatePointer = localStorage.getItem('biomonitor_pointer') 
    ? parseInt(localStorage.getItem('biomonitor_pointer')) : 0;

let currentCycleMode = LEVER_STATES[globalStatePointer];
console.log(`[状态机激活] 序列号: ${globalStatePointer} | 锁定数据模式: ${currentCycleMode}`);
localStorage.setItem('biomonitor_pointer', (globalStatePointer + 1) % 3);

let currentStep = 1;
let hardwareTimer = null; // 核心采样定时器

// 1Hz 均值波形点存放队列 (维持原版 chart-bars-container 细腻的流动感)
let waveDataQueue = Array(32).fill(0); 

// 10Hz 高频物理采样临时缓冲区（存满 10 个算一次平均值，降低大模型接收空值的概率）
let bufferStrength = [];
let bufferFatigue = [];
let bufferExcitement = [];
let bufferSize = [];

// DOM 获取 (严格与你发过来的原版 index 元素 ID 保持百分之百对齐)
const searchLoader = document.getElementById('search-loader');
const connectionStatus = document.getElementById('connection-status');
const connectBtn = document.getElementById('connect-btn');
const btnGoMetrics = document.getElementById('btn-go-metrics');
const backBtn = document.getElementById('back-btn');
const btnTriggerAi = document.getElementById('btn-trigger-ai');

const valStrength = document.getElementById('val-strength');
const valFatigue = document.getElementById('val-fatigue');
const valExcitement = document.getElementById('val-excitement');
const valSize = document.getElementById('val-size');
const aiAdviceContainer = document.getElementById('ai-advice-container');
const chartBarsContainer = document.getElementById('chart-bars-container');

// 1. 雷达扫描文本动画
let dots = 0;
setInterval(() => {
    if (currentStep === 1 && searchLoader) {
        dots = (dots + 1) % 4;
        searchLoader.innerText = `SCANNING${'.'.repeat(dots)}`;
    }
}, 500);

// 2. 连接按钮事件
if (connectBtn) {
    connectBtn.addEventListener('click', () => {
        connectBtn.disabled = true;
        connectBtn.innerText = "正在建立安全通道...";
        setTimeout(() => {
            if (connectionStatus) {
                connectionStatus.innerText = "● 已连接: SAKURA_BLE_ARM";
                connectionStatus.className = "text-xs font-mono bg-cyan-950/40 px-3 py-1 rounded-full text-cyan-400 border border-cyan-500/30";
            }
            switchStep(2);
        }, 1200);
    });
}

// 路由控制
if (btnGoMetrics) btnGoMetrics.addEventListener('click', () => { switchStep(3); startHardwareSim(); });
if (backBtn) backBtn.addEventListener('click', () => switchStep(2));

function switchStep(step) {
    currentStep = step;
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-3').classList.add('hidden');
    document.getElementById(`step-${step}`).classList.remove('hidden');

    if (step !== 3) {
        clearInterval(hardwareTimer);
    }
}

// 模拟状态机基础底座
function generateRawHardwareFrame() {
    switch(currentCycleMode) {
        case 'high_fatigue':
            return {
                fatigue: 83 + Math.sin(Date.now() / 2000) * 4 + Math.random() * 2,
                strength: 38 + Math.random() * 6,
                excitement: 22 + Math.random() * 8,
                size: 38.4
            };
        case 'low_fatigue':
            return {
                fatigue: 16 + Math.sin(Date.now() / 3000) * 3 + Math.random() * 2,
                strength: 148 + Math.random() * 12,
                excitement: 91 + Math.random() * 5,
                size: 39.1
            };
        case 'mid_fatigue':
        default:
            return {
                fatigue: 49 + Math.sin(Date.now() / 4000) * 3 + Math.random() * 2,
                strength: 96 + Math.random() * 8,
                excitement: 62 + Math.random() * 6,
                size: 38.6
            };
    }
}

// 3. 核心双速数据引擎：10Hz高频底层硬件流 ➔ 1Hz（10帧聚合）算术均值渲染展示
function startHardwareSim() {
    clearInterval(hardwareTimer);
    
    // 初始化清空缓冲区
    bufferStrength = []; bufferFatigue = []; bufferExcitement = []; bufferSize = [];

    // 设置初试占位字符，保障界面没有虚假空白
    const initFrame = generateRawHardwareFrame();
    if (valStrength) valStrength.innerText = initFrame.strength.toFixed(1);
    if (valFatigue) valFatigue.innerText = initFrame.fatigue.toFixed(1);
    if (valExcitement) valExcitement.innerText = initFrame.excitement.toFixed(1);
    if (valSize) valSize.innerText = initFrame.size.toFixed(1);

    // 100ms (10Hz) 高频连续捕捉原始波动数据
    hardwareTimer = setInterval(() => {
        const rawFrame = generateRawHardwareFrame();

        bufferStrength.push(rawFrame.strength);
        bufferFatigue.push(rawFrame.fatigue);
        bufferExcitement.push(rawFrame.excitement);
        bufferSize.push(rawFrame.size);

        // 每攒满 10 帧数据（即经历了 1 整秒），融合并沉淀出平稳的均值更新到 DOM
        if (bufferStrength.length >= 10) {
            const avgStrength = bufferStrength.reduce((a, b) => a + b, 0) / bufferStrength.length;
            const avgFatigue = bufferFatigue.reduce((a, b) => a + b, 0) / bufferFatigue.length;
            const avgExcitement = bufferExcitement.reduce((a, b) => a + b, 0) / bufferExcitement.length;
            const avgSize = bufferSize.reduce((a, b) => a + b, 0) / bufferSize.length;

            // 渲染1秒均值到对应的原版节点上
            if (valStrength) valStrength.innerText = avgStrength.toFixed(1);
            if (valFatigue) valFatigue.innerText = avgFatigue.toFixed(1);
            if (valExcitement) valExcitement.innerText = avgExcitement.toFixed(1);
            if (valSize) valSize.innerText = avgSize.toFixed(1);

            // 计算图表波形需要的混合权重值并滚动队列
            const frameMixValue = Math.max(10, avgStrength * 0.7 + avgExcitement * 0.3 - avgFatigue * 0.1);
            waveDataQueue.push(frameMixValue);
            waveDataQueue.shift();

            // 重新重绘下方的连续流图表
            renderWaveBars();

            // 释放缓冲区
            bufferStrength = []; bufferFatigue = []; bufferExcitement = []; bufferSize = [];
        }
    }, 100);
}

// 4. 渲染波形柱动画
function renderWaveBars() {
    if (!chartBarsContainer) return;
    chartBarsContainer.innerHTML = ''; 
    
    const maxInQueue = Math.max(...waveDataQueue, 1);

    waveDataQueue.forEach((val, idx) => {
        const percent = (val / maxInQueue) * 100;
        const bar = document.createElement('div');
        
        const opacityRatio = (idx + 1) / waveDataQueue.length; 
        
        bar.className = 'flex-1 bg-cyan-500 rounded-t transition-all duration-150';
        bar.style.height = `${Math.max(percent, 4)}%`;
        bar.style.opacity = opacityRatio;

        if (idx === waveDataQueue.length - 1) {
            bar.className = 'flex-1 bg-cyan-400 rounded-t transition-all duration-150 shadow-[0_0_12px_#22d3ee]';
        }

        chartBarsContainer.appendChild(bar);
    });
}

// 5. 核心诊断事件：采用原本经测试绝对安全的 innerText 读取对接模式
if (btnTriggerAi) {
    btnTriggerAi.addEventListener('click', async () => {
        btnTriggerAi.disabled = true;
        const originalText = btnTriggerAi.innerText;
        btnTriggerAi.innerText = "✦ 正在打包数据并请求星火诊断...";
        aiAdviceContainer.innerHTML = `<p class="text-cyan-400 font-mono animate-pulse">正在截取当前帧体征特征，调用云端接口...</p>`;

        // 终极安全抓取：双重判断防御机制，如果节点内容由于加载未完全显示，提供默认合法值，完全断绝 500 后端死机的可能
        let s = valStrength ? valStrength.innerText : "90.0";
        let f = valFatigue ? valFatigue.innerText : "50.0";
        let e = valExcitement ? valExcitement.innerText : "65.0";
        let z = valSize ? valSize.innerText : "38.5";

        if (s === "0.0" || !s) {
            const fallback = generateRawHardwareFrame();
            s = fallback.strength.toFixed(1);
            f = fallback.fatigue.toFixed(1);
            e = fallback.excitement.toFixed(1);
            z = fallback.size.toFixed(1);
        }

        const payloadData = { size: z, fatigue: f, excitement: e, strength: s };

        try {
            const response = await fetch("/.netlify/functions/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "analyze_muscle",
                    payload: payloadData
                })
            });

            const data = await response.json();
            if (data.error) {
                aiAdviceContainer.innerHTML = `<p class="text-rose-400">分析失败: ${data.error}</p>`;
            } else if (data.content) {
                aiAdviceContainer.innerHTML = `<div class="space-y-2 text-slate-200 leading-relaxed">${data.content.replace(/\n/g, '<br>')}</div>`;
            } else {
                aiAdviceContainer.innerHTML = `<p class="text-rose-400">未收到合法回答，请检查云端函数日志</p>`;
            }
        } catch (err) {
            aiAdviceContainer.innerHTML = `<p class="text-rose-400">连接后台微服务失败，请检查本地配置。</p>`;
        } finally {
            btnTriggerAi.disabled = false;
            btnTriggerAi.innerText = originalText;
        }
    });
}
