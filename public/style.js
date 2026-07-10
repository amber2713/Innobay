// public/style.js

let currentStep = 1;
let hardwareTimer = null;
let chatHistory = []; // 保存与AI自由对话的上下文

// DOM 获取
const searchLoader = document.getElementById('search-loader');
const connectionStatus = document.getElementById('connection-status');
const connectBtn = document.getElementById('connect-btn');
const btnGoMetrics = document.getElementById('btn-go-metrics');
const btnGoChat = document.getElementById('btn-go-chat');
const backBtn = document.getElementById('back-btn');
const btnTriggerAi = document.getElementById('btn-trigger-ai');

const valStrength = document.getElementById('val-strength');
const valFatigue = document.getElementById('val-fatigue');
const valExcitement = document.getElementById('val-excitement');
const valSize = document.getElementById('val-size');
const aiAdviceContainer = document.getElementById('ai-advice-container');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// 1. 扫描动画
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
if (btnGoChat) btnGoChat.addEventListener('click', () => { switchStep(3); startHardwareSim(); });
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

// 3. 硬件传感器数据模拟流动 (肌肉力量、疲劳、兴奋度、大小)
function startHardwareSim() {
    clearInterval(hardwareTimer);
    hardwareTimer = setInterval(() => {
        // 模拟力量：在 40N ~ 150N 之间产生生理波动
        valStrength.innerText = (85 + Math.sin(Date.now() / 2000) * 35 + Math.random() * 10).toFixed(1);
        // 模拟疲劳度：随着时间产生正弦震荡 (20% ~ 85%)
        valFatigue.innerText = (50 + Math.sin(Date.now() / 10000) * 30 + Math.random() * 4).toFixed(1);
        // 模拟兴奋度：在 40% ~ 95% 之间
        valExcitement.innerText = (65 + Math.cos(Date.now() / 4000) * 20 + Math.random() * 5).toFixed(1);
        // 维度：相对稳定
        valSize.innerText = (38.2 + Math.sin(Date.now() / 50000) * 0.3).toFixed(1);
    }, 400);
}

// 4. 接入讯飞星火：模块一：发送指标自动生成 AI Advice 建议
if (btnTriggerAi) {
    btnTriggerAi.addEventListener('click', async () => {
        btnTriggerAi.disabled = true;
        const originalText = btnTriggerAi.innerText;
        btnTriggerAi.innerText = "✦ 星火大脑全速分析中...";
        aiAdviceContainer.innerHTML = `<p class="text-cyan-400 font-mono animate-pulse">正在提取生理特征值，调用云端大模型接口...</p>`;

        const payloadData = {
            size: valSize.innerText,
            fatigue: valFatigue.innerText,
            excitement: valExcitement.innerText,
            strength: valStrength.innerText
        };

        try {
            // Netlify Functions 的本地/线上相对调用路径为 /.netlify/functions/函数名
            // 对应前端修改后的分析数据部分 (style.js 约第 82 行)
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
                // 这里改用 data.content 来读取
                aiAdviceContainer.innerHTML = `<div class="space-y-2 text-slate-200">${data.content.replace(/\n/g, '<br>')}</div>`;
            }
        } catch (err) {
            aiAdviceContainer.innerHTML = `<p class="text-rose-400">连接 Functions 失败，请检查部署状态。</p>`;
        } finally {
            btnTriggerAi.disabled = false;
            btnTriggerAi.innerText = originalText;
        }
    });
}

// 5. 接入讯飞星火：模块二：自由问答交谈区
if (chatSendBtn) {
    chatSendBtn.addEventListener('click', handleUserChat);
}
if (chatInput) {
    chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUserChat(); });
}

async function handleUserChat() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = "";
    // 将用户发言推入界面
    appendChatMessage("USER", text, "text-cyan-400");
    
    // 推入历史记录发送给 API
    chatHistory.push({ role: "user", content: text });

    // 显示思考状态
    const thinkingId = appendChatMessage("COACH AI", "正在思考中...", "text-purple-400 animate-pulse");

    try {
        // 对应前端自由问答部分 (style.js 约第 127 行)
            const response = await fetch("/.netlify/functions/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "free_chat",
                    messages: chatHistory // 字段名对齐你后端解构的 messages
                })
            });
            const data = await response.json();
            
            // 移除思考状态后...
            if (data.error) {
                appendChatMessage("SYSTEM ERROR", data.error, "text-rose-400");
            } else {
                // 这里同样改用 data.content 来读取
                appendChatMessage("COACH AI", data.content, "text-purple-400");
                chatHistory.push({ role: "assistant", content: data.content });
            }
        // 移除思考占位符
        const deleteTarget = document.getElementById(thinkingId);
        if (deleteTarget) deleteTarget.remove();

        if (data.error) {
            appendChatMessage("SYSTEM ERROR", data.error, "text-rose-400");
        } else {
            appendChatMessage("COACH AI", data.result, "text-purple-400");
            chatHistory.push({ role: "assistant", content: data.result });
        }

    } catch (err) {
        const deleteTarget = document.getElementById(thinkingId);
        if (deleteTarget) deleteTarget.remove();
        appendChatMessage("SYSTEM ERROR", "无法连接网络服务", "text-rose-400");
    }
}

function appendChatMessage(sender, content, colorClass) {
    const id = "msg-" + Date.now() + Math.random().toString(36).substr(2, 5);
    const msgDiv = document.createElement('div');
    msgDiv.id = id;
    msgDiv.className = "bg-slate-950 p-2.5 rounded-lg border border-slate-800/60 max-w-[85%] text-slate-300";
    msgDiv.innerHTML = `<span class="${colorClass} font-bold font-mono">${sender}:</span> ${content.replace(/\n/g, '<br>')}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}
