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
            
            // 【已修复】将 role 从 "system" 改为 "user"，防止讯飞星火引擎报 Bad Request
            chatHistory.push({
                role: "user",
                content: `【系统自动提示：以下是我的当前身体背景数据】
我刚才通过硬件同步了最新的平均肌肉生理特征包：力量为 ${payload.strength} N，疲劳度为 ${payload.fatigue}%，兴奋度为 ${payload.excitement}%，肌肉围度为 ${payload.size} cm。请记住这些数据作为接下来的健康背景，并在回答我后续的问题时结合这些指标进行分析。`
            });

            // 紧接着让 AI 假装回复一句收到，让上下文逻辑更顺畅
            chatHistory.push({
                role: "assistant",
                content: `【系统核心注入成功】我已经成功锁定你当前的体征包。力量：${payload.strength}N，疲劳度：${payload.fatigue}%。请问有什么我可以帮你的？`
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
// public/style.js 

// ... 前面原有的状态机、缓冲区、队列定义保持原样 ...

// ==================== 新增：第三功能核心历史静态特征库 ====================
const PRESET_HISTORY_SIZE = [37.8, 38.0, 38.3, 38.2]; // 前4天固定的肌肉围度数据 (cm)

// DOM 获取追加
const btnGotoHistory = document.getElementById('btn-goto-history');
const historyTodayVal = document.getElementById('history-today-val');
const historyChartContainer = document.getElementById('history-chart-container');
const btnSyncHistoryAi = document.getElementById('btn-sync-history-ai');
const panelHistoryAi = document.getElementById('panel-history-ai');
const historyAiContent = document.getElementById('history-ai-content');


// 在原本的 switchStep(step) 函数中，将新 Section 纳入显示/隐藏管理：
function switchStep(step) {
    currentStep = step;
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-3-metrics').classList.add('hidden');
    document.getElementById('step-4-chat').classList.add('hidden');
    document.getElementById('step-5-history').classList.add('hidden'); // 新增

    if (step === 3) document.getElementById('step-3-metrics').classList.remove('hidden');
    else if (step === 4) document.getElementById('step-4-chat').classList.remove('hidden');
    else if (step === 5) document.getElementById('step-5-history').classList.remove('hidden'); // 新增
    else document.getElementById(`step-${step}`).classList.remove('hidden');

    // 只要不是去数据大屏，就关掉高频物理刷新，防止浪费开销
    if (step !== 3 && step !== 5) { 
        clearInterval(samplingTimer);
    }
}

// 绑定第三个入口按钮的点击事件
if (btnGotoHistory) {
    btnGotoHistory.addEventListener('click', () => {
        switchStep(5);
        
        // 如果当前完全没跑过图表大屏（没有均值），则依据当前轮询状态机强行生成一个今日均值，防止显示0
        if (latestAveragedMetrics.size === 0) {
            const staticFrame = generateRawHardwareFrame();
            latestAveragedMetrics.size = staticFrame.size;
            latestAveragedMetrics.fatigue = staticFrame.fatigue;
            latestAveragedMetrics.strength = staticFrame.strength;
            latestAveragedMetrics.excitement = staticFrame.excitement;
        }
        
        // 渲染5日大屏
        refreshHistoryTrendScreen();
    });
}

// 渲染5日纵向对比图表引擎
function refreshHistoryTrendScreen() {
    if (!historyTodayVal || !historyChartContainer) return;

    const currentTodaySize = latestAveragedMetrics.size > 0 ? latestAveragedMetrics.size : 38.5;
    historyTodayVal.innerText = currentTodaySize.toFixed(1);

    // 组合前4天与今天，构成完整5天序列
    const fiveDaysData = [...PRESET_HISTORY_SIZE, currentTodaySize];
    
    // 清空画布并重新构建柱体 HTML
    historyChartContainer.innerHTML = '';
    
    const maxVal = Math.max(...fiveDaysData, 40);
    const minVal = Math.min(...fiveDaysData, 35) * 0.98; // 动态拉高视差

    fiveDaysData.forEach((val, index) => {
        const heightPercent = ((val - minVal) / (maxVal - minVal)) * 80 + 20; // 保证最低高度
        
        // 创建外层对齐容器
        const barWrapper = document.createElement('div');
        barWrapper.className = "flex-1 flex flex-col justify-end items-center h-full relative group";
        
        // 创建内部柱状图形
        const bar = document.createElement('div');
        bar.style.height = `${heightPercent}%`;
        
        // 第5天(今天)高亮着色，前4天灰色暗调科技感
        if (index === 4) {
            bar.className = "w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t shadow-[0_0_12px_rgba(245,158,11,0.4)] transition-all duration-500";
        } else {
            bar.className = "w-full bg-slate-800 border border-slate-700/60 rounded-t hover:bg-slate-700 transition-all duration-300";
        }
        
        // 浮动悬停大字数值提示
        const tooltip = document.createElement('span');
        tooltip.className = "absolute -top-6 text-[10px] font-mono text-slate-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-slate-950 px-1 rounded border border-slate-800";
        tooltip.innerText = `${val.toFixed(1)}cm`;

        barWrapper.appendChild(tooltip);
        barWrapper.appendChild(bar);
        historyChartContainer.appendChild(barWrapper);
    });
}

// 触发第三功能：5日纵向对比诊断 AI 提问请求
if (btnSyncHistoryAi) {
    btnSyncHistoryAi.addEventListener('click', async () => {
        panelHistoryAi.classList.remove('hidden');
        btnSyncHistoryAi.disabled = true;
        const oldText = btnSyncHistoryAi.innerText;
        btnSyncHistoryAi.innerText = "正在打包纵向分析轴...";

        historyAiContent.innerHTML = `<span class="text-amber-400 font-mono animate-pulse">正在提取[D1-D4]历史围度快照并合并今日1Hz均值，正在向讯飞星辰请求周期健康建议...</span>`;

        const currentTodaySize = latestAveragedMetrics.size > 0 ? latestAveragedMetrics.size.toFixed(1) : "38.5";

        // 构建符合纵向对比背景的 Payload 包传给后台
        const payloadData = {
            history_sizes: PRESET_HISTORY_SIZE, // [37.8, 38.0, 38.3, 38.2]
            today_size: currentTodaySize,
            today_fatigue: latestAveragedMetrics.fatigue > 0 ? latestAveragedMetrics.fatigue.toFixed(1) : "50.0",
            today_strength: latestAveragedMetrics.strength > 0 ? latestAveragedMetrics.strength.toFixed(1) : "90.0"
        };

        try {
            const response = await fetch("/.netlify/functions/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "analyze_trend", // 专门给云端识别的处理逻辑类型
                    payload: payloadData
                })
            });
            const data = await response.json();
            if (data.error) {
                historyAiContent.innerHTML = `<span class="text-rose-400">纵向链诊断失败: ${data.error}</span>`;
            } else {
                historyAiContent.innerHTML = data.content.replace(/\n/g, '<br>');
            }
        } catch (err) {
            historyAiContent.innerHTML = `<span class="text-rose-400">微服务未响应，请检查云端端点配置。</span>`;
        } finally {
            btnSyncHistoryAi.disabled = false;
            btnSyncHistoryAi.innerText = oldText;
        }
    });
}
