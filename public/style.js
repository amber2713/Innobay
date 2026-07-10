// public/style.js

// 1. 状态机轮询系统：打开/进入时依次锁定状态
// 状态序列：高疲劳度 -> 低疲劳度 -> 中疲劳度
const LEVER_STATES = ['high_fatigue', 'low_fatigue', 'mid_fatigue'];
let globalStatePointer = localStorage.getItem('biomonitor_pointer') 
    ? parseInt(localStorage.getItem('biomonitor_pointer')) : 0;

// 获取当前打开对应的确定性参数类型
let currentCycleMode = LEVER_STATES[globalStatePointer];
console.log(`[状态机激活] 当前打开序列索引: ${globalStatePointer}，锁定模式为: ${currentCycleMode}`);

// 为了下一次打开页面时自动轮询，将指针加一后存入本地
localStorage.setItem('biomonitor_pointer', (globalStatePointer + 1) % 3);

let currentStep = 1;
let hardwareTimer = null;
let chatHistory = []; 

// 独立数据流队列 (每组分配30个点采样)
let queueStrength = Array(25).fill(0);
let queueFatigue = Array(25).fill(0);
let queueExcitement = Array(25).fill(0);
let queueSize = Array(25).fill(0);

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

// 初始化扫描动画
let dots = 0;
setInterval(() => {
    if (currentStep === 1 && searchLoader) {
        dots = (dots + 1) % 4;
        searchLoader.innerText = `SCANNING${'.'.repeat(dots)}`;
    }
}, 400);

// 绑定事件
if (connectBtn) {
    connectBtn.addEventListener('click', () => {
        connectBtn.disabled = true;
        connectBtn.innerText = "正在接入通道...";
        setTimeout(() => {
            if (connectionStatus) {
                connectionStatus.innerText = "● SAKURA_ARM";
                connectionStatus.className = "text-[10px] font-mono bg-cyan-950/40 px-2.5 py-0.5 rounded-full text-cyan-400 border border-cyan-500/30";
            }
            switchStep(2);
        }, 1000);
    });
}

if (btnGotoMetrics) btnGotoMetrics.addEventListener('click', () => { switchStep(3); start10HzHardwareStream(); });
if (btnGotoChat) btnGotoChat.addEventListener('click', () => { switchStep(4); clearInterval(hardwareTimer); });

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
        clearInterval(hardwareTimer);
    }
}

// 核心逻辑：提供符合要求的状态机制定基础值
function getBaseMetricsByMode() {
    switch(currentCycleMode) {
        case 'high_fatigue':
            // 高疲劳度：疲劳度 80~95，力量衰减，兴奋度萎靡
            return {
                fatigue: 85 + Math.sin(Date.now() / 3000) * 5,
                strength: 42 + Math.random() * 8,
                excitement: 25 + Math.random() * 10,
                size: 38.8
            };
        case 'low_fatigue':
            // 低疲劳度：疲劳度 15~28，力量爆表，兴奋度极高 (建议加重量)
            return {
                fatigue: 18 + Math.sin(Date.now() / 4000) * 4,
                strength: 145 + Math.random() * 15,
                excitement: 88 + Math.random() * 6,
                size: 39.2
            };
        case 'mid_fatigue':
        default:
            // 中间疲劳度：疲劳度 45~55，各项平稳 (建议继续训练)
            return {
                fatigue: 48 + Math.sin(Date.now() / 5000) * 3,
                strength: 95 + Math.random() * 10,
                excitement: 60 + Math.random() * 8,
                size: 38.5
            };
    }
}

// 采样率设为 100 毫秒一次 (精确 10Hz 真实帧频率)
function start10HzHardwareStream() {
    clearInterval(hardwareTimer);
    hardwareTimer = setInterval(() => {
        const metrics = getBaseMetricsByMode();

        // 刷新视图数值
        streamValStrength.innerText = metrics.strength.toFixed(1);
        streamValFatigue.innerText = metrics.fatigue.toFixed(1);
        streamValExcitement.innerText = metrics.excitement.toFixed(1);
        streamValSize.innerText = metrics.size.toFixed(1);

        // 压入各对应独立的波形队列
        pushAndShift(queueStrength, metrics.strength);
        pushAndShift(queueFatigue, metrics.fatigue);
        pushAndShift(queueExcitement, metrics.excitement);
        pushAndShift(queueSize, metrics.size);

        // 分别重绘各自的 10Hz 滚动图表
        renderSingleChart('container-wave-strength', queueStrength, 'bg-cyan-500');
        renderSingleChart('container-wave-fatigue', queueFatigue, 'bg-emerald-500');
        renderSingleChart('container-wave-excitement', queueExcitement, 'bg-amber-500');
        renderSingleChart('container-wave-size', queueSize, 'bg-purple-500');

    }, 100); 
}

function pushAndShift(queue, val) {
    queue.push(val);
    queue.shift();
}

// 单个独立轨道高频连续波形渲染器
function renderSingleChart(containerId, dataQueue, colorClass) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    const max = Math.max(...dataQueue, 1);
    const min = Math.min(...dataQueue, 0) * 0.9; // 稍微向下垫底突出起伏感

    dataQueue.forEach((val, i) => {
        const heightPercent = max === min ? 50 : ((val - min) / (max - min)) * 90 + 10;
        const bar = document.createElement('div');
        bar.style.height = `${heightPercent}%`;
        
        // 拖尾渐亮效果
        const alpha = (i + 1) / dataQueue.length;
        bar.className = `flex-1 ${colorClass} rounded-t`;
        bar.style.opacity = alpha;

        if (i === dataQueue.length - 1) {
            bar.classList.add('shadow-[0_0_8px_rgba(255,255,255,0.6)]');
        }
        el.appendChild(bar);
    });
}

// 统一核心业务：传输数据给星火大模型
async function requestAiDiagnosis(triggerBtn, outputContainer, callbackSuccess = null) {
    triggerBtn.disabled = true;
    const oldText = triggerBtn.innerText;
    triggerBtn.innerText = "传输中...";

    // 实时读取当前对应的模拟数值
    const baseMetrics = getBaseMetricsByMode();
    const payloadData = {
        size: baseMetrics.size.toFixed(1),
        fatigue: baseMetrics.fatigue.toFixed(1),
        excitement: baseMetrics.excitement.toFixed(1),
        strength: baseMetrics.strength.toFixed(1)
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
            outputContainer.innerHTML = `<span class="text-rose-400">同步故障: ${data.error}</span>`;
        } else {
            outputContainer.innerHTML = data.content.replace(/\n/g, '<br>');
            if (callbackSuccess) callbackSuccess(payloadData);
        }
    } catch (err) {
        outputContainer.innerHTML = `<span class="text-rose-400">无法连接前端本地或云端 Functions 端点。</span>`;
    } finally {
        triggerBtn.disabled = false;
        triggerBtn.innerText = oldText;
    }
}

// 绑定大屏界面数据传输
if (btnSyncMetrics) {
    btnSyncMetrics.addEventListener('click', () => {
        panelMetricsAi.classList.remove('hidden');
        requestAiDiagnosis(btnSyncMetrics, metricsAiContent);
    });
}

// 绑定独立对话界面的数据同步
if (btnSyncChat) {
    btnSyncChat.addEventListener('click', () => {
        requestAiDiagnosis(btnSyncChat, chatSyncTip, (payload) => {
            chatSyncTip.className = "bg-purple-950/40 border border-purple-500/30 px-3 py-2 rounded-lg text-[10px] text-purple-300 font-mono";
            chatSyncTip.innerHTML = `[同步成功] 已将当前生理特征包注入AI记忆流：<br>力量: ${payload.strength}N | 疲劳: ${payload.fatigue}% | 兴奋: ${payload.excitement}%。你可以继续往下追问。`;
            // 追加进聊天历史供后续自由问答引用
            chatHistory.push({
                role: "system",
                content: `用户刚才同步了最新的肌肉生理状态数据：力量：${payload.strength}N，疲劳度：${payload.fatigue}%，兴奋度：${payload.excitement}%，维度：${payload.size}cm。请在后续对话中基于此背景解答他的疑问。`
            });
        });
    });
}

// 独立AI自由问答机制
if (chatSendBtn) chatSendBtn.addEventListener('click', handleFreeUserChat);
if (chatInput) chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleFreeUserChat(); });

async function handleFreeUserChat() {
    const prompt = chatInput.value.trim();
    if (!prompt) return;

    chatInput.value = "";
    appendMessageHTML("USER", prompt, "text-cyan-400");
    chatHistory.push({ role: "user", content: prompt });

    const thinkId = appendMessageHTML("COACH AI", "正在整合运动生理知识库...", "text-purple-400 animate-pulse");

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
        
        const target = document.getElementById(thinkId);
        if (target) target.remove();

        if (data.error) {
            appendMessageHTML("SYSTEM", data.error, "text-rose-400");
        } else {
            appendMessageHTML("COACH AI", data.content, "text-purple-400");
            chatHistory.push({ role: "assistant", content: data.content });
        }
    } catch (e) {
        const target = document.getElementById(thinkId);
        if (target) target.remove();
        appendMessageHTML("SYSTEM", "连接故障", "text-rose-400");
    }
}

function appendMessageHTML(sender, text, colorClass) {
    const id = "chat-m-" + Math.random().toString(36).substr(2, 4);
    const box = document.createElement('div');
    box.id = id;
    box.className = "bg-slate-900/90 p-2.5 rounded-xl border border-slate-800/80 text-slate-300 max-w-[95%] leading-relaxed";
    box.innerHTML = `<span class="${colorClass} font-bold font-mono">${sender}:</span> ${text.replace(/\n/g, '<br>')}`;
    chatMessages.appendChild(box);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}
