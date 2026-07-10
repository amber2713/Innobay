// public/style.js

let currentStep = 1;
let hardwareTimer = null;
let waveDataQueue = Array(32).fill(0); // 增加队列长度至32帧，使图表流动更细腻

// DOM 获取
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

// 2. 连接按钮
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

// 3. 每一帧高频硬件流数据模拟
function startHardwareSim() {
    clearInterval(hardwareTimer);
    
    // 提高刷新帧率（每200ms一帧），创造极其流畅的动态波形感
    hardwareTimer = setInterval(() => {
        // 生成生理波动纯数据
        const strength = (85 + Math.sin(Date.now() / 2000) * 35 + Math.random() * 10).toFixed(1);
        const fatigue = (50 + Math.sin(Date.now() / 10000) * 30 + Math.random() * 4).toFixed(1);
        const excitement = (65 + Math.cos(Date.now() / 4000) * 20 + Math.random() * 5).toFixed(1);
        const size = (38.2 + Math.sin(Date.now() / 50000) * 0.3).toFixed(1);

        // 渲染文本数值
        if (valStrength) valStrength.innerText = strength;
        if (valFatigue) valFatigue.innerText = fatigue;
        if (valExcitement) valExcitement.innerText = excitement;
        if (valSize) valSize.innerText = size;

        // 计算当前帧波形的混合权重值 (力量主导，疲劳为负抑制)
        const frameMixValue = Math.max(10, parseFloat(strength) * 0.7 + parseFloat(excitement) * 0.3 - parseFloat(fatigue) * 0.1);
        
        // 推入数据流队列并移动帧
        waveDataQueue.push(frameMixValue);
        waveDataQueue.shift();

        // 重新渲染图表线
        renderWaveBars();
    }, 200);
}

// 4. 高频渲染动态波形柱
function renderWaveBars() {
    if (!chartBarsContainer) return;
    chartBarsContainer.innerHTML = ''; // 擦除旧帧
    
    const maxInQueue = Math.max(...waveDataQueue, 1);

    waveDataQueue.forEach((val, idx) => {
        const percent = (val / maxInQueue) * 100;
        const bar = document.createElement('div');
        
        // 随着数据越靠后（最新帧），颜色越亮，做出从暗到明的发光流式拖尾效果
        const opacityRatio = (idx + 1) / waveDataQueue.length; 
        
        bar.className = 'flex-1 bg-cyan-500 rounded-t transition-all duration-150';
        bar.style.height = `${Math.max(percent, 4)}%`;
        bar.style.opacity = opacityRatio;
        // 最后一帧（最新数据）增加特殊强发光外圈
        if (idx === waveDataQueue.length - 1) {
            bar.className = 'flex-1 bg-cyan-400 rounded-t transition-all duration-150 shadow-[0_0_12px_#22d3ee]';
        }

        chartBarsContainer.appendChild(bar);
    });
}

// 5. 诊断：发送当前截切数据包至星火 AI 生成静态处方
if (btnTriggerAi) {
    btnTriggerAi.addEventListener('click', async () => {
        btnTriggerAi.disabled = true;
        const originalText = btnTriggerAi.innerText;
        btnTriggerAi.innerText = "✦ 正在打包数据并请求星火诊断...";
        aiAdviceContainer.innerHTML = `<p class="text-cyan-400 font-mono animate-pulse">正在截取当前帧体征特征，调用云端接口...</p>`;

        const payloadData = {
            size: valSize.innerText,
            fatigue: valFatigue.innerText,
            excitement: valExcitement.innerText,
            strength: valStrength.innerText
        };

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
            } else {
                // 读取旧项目一致的 data.content 字段
                aiAdviceContainer.innerHTML = `<div class="space-y-2 text-slate-200 leading-relaxed">${data.content.replace(/\n/g, '<br>')}</div>`;
            }
        } catch (err) {
            aiAdviceContainer.innerHTML = `<p class="text-rose-400">连接后台微服务失败，请检查配置。</p>`;
        } finally {
            btnTriggerAi.disabled = false;
            btnTriggerAi.innerText = originalText;
        }
    });
}
