// public/style.js

// 1. 状态机轮询系统：严格遵循网页打开/刷新顺序
const LEVER_STATES = ['high_fatigue', 'low_fatigue', 'mid_fatigue'];
let globalStatePointer = localStorage.getItem('biomonitor_pointer') 
    ? parseInt(localStorage.getItem('biomonitor_pointer')) : 0;

let currentCycleMode = LEVER_STATES[globalStatePointer];
console.log(`[状态机激活] 打开序列号: ${globalStatePointer} | 目标分析锁定模式: ${currentCycleMode}`);

// 锁定下次打开的状态指针进行循环
localStorage.setItem('biomonitor_pointer', (globalStatePointer + 1) % 3);

let currentStep = 1;
let samplingTimer = null; // 10Hz 高频物理采样器

// 前端图表展示队列 (1Hz 均值波形点，存放 20 个历史跨度)
let queueStrength = Array(20).fill(0);
let queueFatigue = Array(20).fill(0);
let queueExcitement = Array(20).fill(0);
let queueSize = Array(20).fill(0);

// 10Hz 物理采样的高频临时缓冲区（每存满 10 个数据进行一次均值计算）
let bufferStrength = [];
let bufferFatigue = [];
let bufferExcitement = [];
let bufferSize = [];

let chatHistory = []; 

// DOM 获取
const searchLoader = document.getElementById('search-loader');
const connectionStatus = document.getElementById('connection-status');
const connectBtn = document.getElementById('connect-btn');
const btnGotoMetrics = document.getElementById('btn-goto-metrics');
const btnGotoChat = document.getElementById('btn-goto-chat');
const backToHubBtns = document.querySelectorAll('.back-to-hub');

const btnSyncMetrics = document.getElementById('btn-sync-data-metrics');
const btnSyncChat = document.getElementById('btn-sync-data-chat');
const chatSyncTip = document.getElementById('chat-sync-tip');

const streamValStrength = document.getElementById('stream-val-strength');
const streamValFatigue = document.getElementById('stream-val-fatigue');
const streamValExcitement = document.getElementById('stream-val-excitement');
const streamValSize = document.getElementById('stream-val-size');

const panelMetricsAi = document.getElementById('panel-metrics-ai');
const metricsAiContent = document.getElementById('metrics-ai-content');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// 雷达扫描动画
let dots = 0;
setInterval(() => {
    if (currentStep === 1 && searchLoader) {
        dots = (dots + 1) % 4;
        searchLoader.innerText = `SCANNING${'.'.repeat(dots)}`;
    }
}, 400);

if (connectBtn) {
    connectBtn.addEventListener('click', () => {
        connectBtn.disabled = true;
        connectBtn.innerText = "物理通道对准中...";
        setTimeout(() => {
            if (connectionStatus) {
                connectionStatus.innerText = "● 链路就绪: SAKURA_BLE";
                connectionStatus.className = "text-sm font-mono bg-cyan-950/40 px-3 py-1 rounded-full text-cyan-400 border border-cyan-500/30";
            }
            switchStep(2);
        }, 1000);
    });
}

if (btnGotoMetrics) btnGotoMetrics.addEventListener('click', () => { switchStep(3); startDualSpeedDataEngine(); });
if (btnGotoChat) btnGotoChat.addEventListener('click', () => { switchStep(4); clearInterval(samplingTimer); });

backToHubBtns.forEach(btn => {
    btn.addEventListener('click', () => switchStep(2));
});

function switchStep(step) {
    currentStep = step;
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-3-metrics').classList.add('hidden');
    document.getElementById('step-4-chat').classList.add('hidden');

    if (step === 3) document.getElementById('step-3-metrics').classList.remove('hidden');
    else if (step === 4) document.getElementById('step-4-chat').classList.remove('hidden');
    else document.getElementById(`step-${step}`).classList.remove('hidden');

    if (step !== 3) {
        clearInterval(samplingTimer);
    }
}

// 模拟状态机的基础物理输出
function generateRawHardwareFrame() {
    switch(currentCycleMode) {
        case 'high_fatigue': // 1. 高疲劳度
            return {
                fatigue: 83 + Math.sin(Date.now() / 2000) * 4 + Math.random() * 2,
                strength: 38 + Math.random() * 6,
                excitement: 22 + Math.random() * 8,
                size: 38.4
            };
        case 'low_fatigue':  // 2. 低疲劳度
            return {
                fatigue: 16 + Math.sin(Date.now() / 3000) * 3 + Math.random() * 2,
                strength: 148 + Math.random() * 12,
                excitement: 91 + Math.random() * 5,
                size: 39.1
            };
        case 'mid_fatigue':  // 3. 中间疲劳度
        default:
            return {
                fatigue: 49 + Math.sin(Date.now() / 4000) * 3 + Math.random() * 2,
                strength: 96 + Math.random() * 8,
                excitement: 62 + Math.random() * 6,
                size: 38.6
            };
    }
}

// 核心计算引擎：10Hz高频采样处理 + 1Hz算术平均沉淀展示
function startDualSpeedDataEngine() {
    clearInterval(samplingTimer);
    
    bufferStrength = []; bufferFatigue = []; bufferExcitement = []; bufferSize = [];

    // 先给界面塞一个与之状态机对应的初始合法字串，防止第0秒空白触发空引用
    const initFrame = generateRawHardwareFrame();
    streamValStrength.innerText = initFrame.strength.toFixed(1);
    streamValFatigue.innerText = initFrame.fatigue.toFixed(1);
    streamValExcitement.innerText = initFrame.excitement.toFixed(1);
    streamValSize.innerText = initFrame.size.toFixed(1);

    // 100ms 定时器开启 (一秒内高频处理 10 个原始数据包)
    samplingTimer = setInterval(() => {
        const rawFrame = generateRawHardwareFrame();

        bufferStrength.push(rawFrame.strength);
        bufferFatigue.push(rawFrame.fatigue);
        bufferExcitement.push(rawFrame.excitement);
        bufferSize.push(rawFrame.size);

        // 当高速缓冲区攒满 10 个数据（即经历了一整秒），触发均值计算并展示更新
        if (bufferStrength.length >= 10) {
            
            const avgStrength = calcArrayAverage(bufferStrength);
            const avgFatigue = calcArrayAverage(bufferFatigue);
            const avgExcitement = calcArrayAverage(bufferExcitement);
            const avgSize = calcArrayAverage(bufferSize);

            // 1. 刷新界面可观测文本（大字号展示）
            streamValStrength.innerText = avgStrength.toFixed(1);
            streamValFatigue.innerText = avgFatigue.toFixed(1);
            streamValExcitement.innerText = avgExcitement.toFixed(1);
            streamValSize.innerText = avgSize.toFixed(1);

            // 2. 将1秒均值压入前端对应的滚动队列中
            pushAndShift(queueStrength, avgStrength);
            pushAndShift(queueFatigue, avgFatigue);
            pushAndShift(queueExcitement, avgExcitement);
            pushAndShift(queueSize, avgSize);

            // 3. 动态重绘 4 个指标各自专属的 1Hz 独立滚动波形图
            renderSingleChart('container-wave-strength', queueStrength, 'bg-cyan-500');
            renderSingleChart('container-wave-fatigue', queueFatigue, 'bg-emerald-500');
            renderSingleChart('container-wave-excitement', queueExcitement, 'bg-amber-500');
            renderSingleChart('container-wave-size', queueSize, 'bg-purple-500');

            // 4. 重置高频缓冲区
            bufferStrength = []; bufferFatigue = []; bufferExcitement = []; bufferSize = [];
        }

    }, 100); // 100ms = 10Hz
}

function calcArrayAverage(arr) {
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
}

function pushAndShift(queue, val) {
    queue.push(val);
    queue.shift();
}

// 独立波形数据流单轨渲染器
function renderSingleChart(containerId, dataQueue, colorClass) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const max = Math.max(...dataQueue, 1);
    const min = Math.min(...dataQueue, 0) * 0.95; 

    dataQueue.forEach((val, i) => {
        const heightPercent = max === min ? 50 : ((val - min) / (max - min)) * 85 + 15;
        const bar = document.createElement('div');
        bar.style.height = `${heightPercent}%`;
        
        const alpha = (i + 1) / dataQueue.length;
        bar.className = `flex-1 ${colorClass} rounded-t transition-all duration-300`;
        bar.style.opacity = alpha;

        if (i === dataQueue.length - 1) {
            bar.classList.add('shadow-[0_0_10px_rgba(255,255,255,0.5)]');
        }
        container.appendChild(bar);
    });
}

// ================= 核心业务：直接使用旧版经测试验证的最稳健抓取模式 =================
if (btnSyncMetrics) {
    btnSyncMetrics.addEventListener('click', async () => {
        btnSyncMetrics.disabled = true;
        const oldText = btnSyncMetrics.innerText;
        btnSyncMetrics.innerText = "传输中...";
        
        panelMetricsAi.classList.remove('hidden');
        metricsAiContent.innerHTML = `<span class="text-cyan-400 font-mono animate-pulse">正在提取当前均值，调用大模型诊断服务...</span>`;

        // 像旧版代码一样，直接读取显示在界面上的 innerText 字符串，保证最稳健的数据安全对接！
        const payloadData = {
            size: streamValSize.innerText,
            fatigue: streamValFatigue.innerText,
            excitement: streamValExcitement.innerText,
            strength: streamValStrength.innerText
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
                metricsAiContent.innerHTML = `<span class="text-rose-400">分析失败: ${data.error}</span>`;
            } else {
                metricsAiContent.innerHTML = data.content.replace(/\n/g, '<br>');
            }
        } catch (err) {
            metricsAiContent.innerHTML = `<span class="text-rose-400">连接微服务失败，请检查配置。</span>`;
        } finally {
            btnSyncMetrics.disabled = false;
            btnSyncMetrics.innerText = oldText;
        }
    });
}

// 独立问答舱内的生理包同步
if (btnSyncChat) {
    btnSyncChat.addEventListener('click', async () => {
        btnSyncChat.disabled = true;
        const oldText = btnSyncChat.innerText;
        btnSyncChat.innerText = "同步中...";
        chatSyncTip.innerHTML = `<span class="text-purple-400 font-mono animate-pulse">正在打包当前时刻参数同步至AI环境上下文...</span>`;

        // 确保非数据流大屏切过来的临界状态同样具有基础数据支持
        let s = streamValStrength ? streamValStrength.innerText : "90.0";
        let f = streamValFatigue ? streamValFatigue.innerText : "50.0";
        let e = streamValExcitement ? streamValExcitement.innerText : "65.0";
        let z = streamValSize ? streamValSize.innerText : "38.5";

        if (s === "0.0") {
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
                chatSyncTip.innerHTML = `<span class="text-rose-400">同步失败: ${data.error}</span>`;
            } else {
                chatSyncTip.className = "bg-purple-950/40 border border-purple-500/30 px-4 py-3 rounded-xl text-xs text-purple-300 font-mono leading-relaxed";
                chatSyncTip.innerHTML = `[同步成功] 已将当前1Hz均值体征注入AI记忆中：<br>力量: ${s}N | 疲劳: ${f}% | 兴奋: ${e}% | 维度: ${z}cm。<br>模型已被激活，可以在下方对其提出相关疑问。`;
                
                chatHistory.push({
                    role: "system",
                    content: `用户刚才主动同步了当前的平均肌肉生理特征包：力量为 ${s} N，疲劳度为 ${f}%，兴奋度为 ${e}%，肌肉围度为 ${z} cm。请在接下来的问答中，以此数据作为他的身体背景知识，专业、科学、合理地回答他的训练疑问。`
                });
            }
        } catch (err) {
            chatSyncTip.innerHTML = `<span class="text-rose-400">同步链路发生异常错误</span>`;
        } finally {
            btnSyncChat.disabled = false;
            btnSyncChat.innerText = oldText;
        }
    });
}

// AI 交互舱自由会话逻辑
if (chatSendBtn) chatSendBtn.addEventListener('click', processUserChat);
if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') processUserChat(); });

async function processUserChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = "";
    appendChatBubble("USER", text, "text-cyan-400");
    chatHistory.push({ role: "user", content: text });

    const thinkingId = appendChatBubble("COACH AI", "正在翻阅运动生理学模型...", "text-purple-400 animate-pulse");

    try {
        const response = await fetch("/.netlify/functions/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: "free_chat",
                messages: chatHistory
            })
        });
        const data = await response.json();
        
        const deleteEl = document.getElementById(thinkingId);
        if (deleteEl) deleteEl.remove();

        if (data.error) {
            appendChatBubble("SYSTEM ERROR", data.error, "text-rose-400");
        } else {
            appendChatBubble("COACH AI", data.content, "text-purple-400");
            chatHistory.push({ role: "assistant", content: data.content });
        }
    } catch (e) {
        const deleteEl = document.getElementById(thinkingId);
        if (deleteEl) deleteEl.remove();
        appendChatBubble("SYSTEM ERROR", "微服务连接失败", "text-rose-400");
    }
}

function appendChatBubble(sender, content, colorClass) {
    const id = "msg-node-" + Math.random().toString(36).substr(2, 4);
    const div = document.createElement('div');
    div.id = id;
    div.className = "bg-slate-900 p-3 rounded-2xl border border-slate-800/80 text-slate-200 max-w-[90%] leading-relaxed animate-fade-in";
    div.innerHTML = `<span class="${colorClass} font-bold font-mono">${sender}:</span> ${content.replace(/\n/g, '<br>')}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}
