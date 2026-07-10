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

// 前端图表展示队列 (1Hz 均值波形点，存放 20 秒的历史跨度)
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

// 统一保存当前通过 1Hz 计算出的最新有效均值数据，供随时同步给 AI
let latestAveragedMetrics = { strength: 0, fatigue: 0, excitement: 0, size: 0 };

// 扫描连击特效动画
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

// 根据要求的状态机模式，输出对应的参数模型
function generateRawHardwareFrame() {
    switch(currentCycleMode) {
        case 'high_fatigue': // 1. 高疲劳度 -> 给出停止/休息建议
            return {
                fatigue: 83 + Math.sin(Date.now() / 2000) * 4 + Math.random() * 2,
                strength: 38 + Math.random() * 6,
                excitement: 22 + Math.random() * 8,
                size: 38.4
            };
        case 'low_fatigue':  // 2. 低疲劳度 -> 建议加大重量
            return {
                fatigue: 16 + Math.sin(Date.now() / 3000) * 3 + Math.random() * 2,
                strength: 148 + Math.random() * 12,
                excitement: 91 + Math.random() * 5,
                size: 39.1
            };
        case 'mid_fatigue':  // 3. 中间疲劳度 -> 建议继续训练
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
    
    // 清空历史残余缓存
    bufferStrength = []; bufferFatigue = []; bufferExcitement = []; bufferSize = [];

    // 100ms 定时器开启 (一秒内高频处理并吞噬 10 个物理数据包)
    samplingTimer = setInterval(() => {
        const rawFrame = generateRawHardwareFrame();

        // 压入临时数据高速缓冲区
        bufferStrength.push(rawFrame.strength);
        bufferFatigue.push(rawFrame.fatigue);
        bufferExcitement.push(rawFrame.excitement);
        bufferSize.push(rawFrame.size);

        // 当高速缓冲区攒满 10 个数据（即经历了一整秒），触发算术平均值融合
        if (bufferStrength.length >= 10) {
            
            latestAveragedMetrics.strength = calcArrayAverage(bufferStrength);
            latestAveragedMetrics.fatigue = calcArrayAverage(bufferFatigue);
            latestAveragedMetrics.excitement = calcArrayAverage(bufferExcitement);
            latestAveragedMetrics.size = calcArrayAverage(bufferSize);

            // 1. 刷新界面大字号文本数据
            streamValStrength.innerText = latestAveragedMetrics.strength.toFixed(1);
            streamValFatigue.innerText = latestAveragedMetrics.fatigue.toFixed(1);
            streamValExcitement.innerText = latestAveragedMetrics.excitement.toFixed(1);
            streamValSize.innerText = latestAveragedMetrics.size.toFixed(1);

            // 2. 将计算出来的1秒均值压入前端滚动展示序列
            pushAndShift(queueStrength, latestAveragedMetrics.strength);
            pushAndShift(queueFatigue, latestAveragedMetrics.fatigue);
            pushAndShift(queueExcitement, latestAveragedMetrics.excitement);
            pushAndShift(queueSize, latestAveragedMetrics.size);

            // 3. 动态绘制每一个生理维度专属的 1Hz 独立滚动图表
            renderSingleChart('container-wave-strength', queueStrength, 'bg-cyan-500');
            renderSingleChart('container-wave-fatigue', queueFatigue, 'bg-emerald-500');
            renderSingleChart('container-wave-excitement', queueExcitement, 'bg-amber-500');
            renderSingleChart('container-wave-size', queueSize, 'bg-purple-500');

            // 4. 重置高频物理缓冲区，等待下一秒的 10 个数据包
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

// 独立波形数据流渲染器
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
        
        // 数据流向左滚动的渐亮淡出视觉
        const alpha = (i + 1) / dataQueue.length;
        bar.className = `flex-1 ${colorClass} rounded-t transition-all duration-300`;
        bar.style.opacity = alpha;

        if (i === dataQueue.length - 1) {
            bar.classList.add('shadow-[0_0_10px_rgba(255,255,255,0.5)]');
        }
        container.appendChild(bar);
    });
}

// 发起大模型接口诊断调用
async function executeAiRequest(triggerBtn, outputContainer, callbackSuccess = null) {
    triggerBtn.disabled = true;
    const oldText = triggerBtn.innerText;
    triggerBtn.innerText = "同步打包中...";

    // 随时抓取最新的 1Hz 有效均值包
    const payloadData = {
        size: latestAveragedMetrics.size > 0 ? latestAveragedMetrics.size.toFixed(1) : "38.5",
        fatigue: latestAveragedMetrics.fatigue > 0 ? latestAveragedMetrics.fatigue.toFixed(1) : "50.0",
        excitement: latestAveragedMetrics.excitement > 0 ? latestAveragedMetrics.excitement.toFixed(1) : "65.0",
        strength: latestAveragedMetrics.strength > 0 ? latestAveragedMetrics.strength.toFixed(1) : "90.0"
    };

    outputContainer.innerHTML = `<span class="text-cyan-400 font-mono animate-pulse">正在提取均值包，调用讯飞星辰大模型诊断端点...</span>`;

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
            outputContainer.innerHTML = `<span class="text-rose-400">调用失败: ${data.error}</span>`;
        } else {
            // 对齐旧项目的 data.content 字段进行渲染
            outputContainer.innerHTML = data.content.replace(/\n/g, '<br>');
            if (callbackSuccess) callbackSuccess(payloadData);
        }
    } catch (err) {
        outputContainer.innerHTML = `<span class="text-rose-400">网络故障，请确保 Netlify Functions 正常运行。</span>`;
    } finally {
        triggerBtn.disabled = false;
        triggerBtn.innerText = oldText;
    }
}

// 看数据大屏界面 -> 触发AI诊断
if (btnSyncMetrics) {
    btnSyncMetrics.addEventListener('click', () => {
        panelMetricsAi.classList.remove('hidden');
        executeAiRequest(btnSyncMetrics, metricsAiContent);
    });
}

// 独立问答界面 -> 点击同步肌肉信息
if (btnSyncChat) {
    btnSyncChat.addEventListener('click', () => {
        // 如果是从控制中心直接进入的问答，还没有跑起大屏引擎，就手动生成一个与之状态对应的静态特征包
        if (latestAveragedMetrics.strength === 0) {
            const staticFrame = generateRawHardwareFrame();
            latestAveragedMetrics = staticFrame;
        }

        executeAiRequest(btnSyncChat, chatSyncTip, (payload) => {
            chatSyncTip.className = "bg-purple-950/40 border border-purple-500/30 px-4 py-3 rounded-xl text-xs text-purple-300 font-mono leading-relaxed";
            chatSyncTip.innerHTML = `[同步成功] 已锁定当前1Hz均值体征包传入AI上下文中：<br>力量: ${payload.strength}N | 疲劳: ${payload.fatigue}% | 兴奋: ${payload.excitement}% | 维度: ${payload.size}cm。<br>模型已被激活，请在下方自由追问。`;
            
            // 压入系统级提示词，确保星火大模型在自由对话里知道这些同步过来的肌肉平均数据
            chatHistory.push({
                role: "system",
                content: `用户刚才主动同步了当前的平均肌肉生理特征包：力量为 ${payload.strength} N，疲劳度为 ${payload.fatigue}%，兴奋度为 ${payload.excitement}%，肌肉围度为 ${payload.size} cm。请在接下来的问答中，以此数据作为他的身体背景知识，专业、科学、合理地回答他的训练疑问。`
            });
        });
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
