// 全局状态管理
let currentStep = 1;
let selectedType = 'strength'; // 'strength' | 'fatigue'
let dataTimer = null;
let mockHistoryData = Array(12).fill(0); // 存放最近的模拟数据线

// DOM 元素获取
const searchLoader = document.getElementById('search-loader');
const connectionStatus = document.getElementById('connection-status');
const connectBtn = document.getElementById('connect-btn');
const selectStrengthBtn = document.getElementById('select-strength-btn');
const selectFatigueBtn = document.getElementById('select-fatigue-btn');
const backToTypesBtn = document.getElementById('back-to-types-btn');
const tabBtnStrength = document.getElementById('tab-btn-strength');
const tabBtnFatigue = document.getElementById('tab-btn-fatigue');

// 初始化加载效果 (三个点的点缀动画)
let searchDots = 0;
setInterval(() => {
    if (currentStep === 1 && searchLoader) {
        searchDots = (searchDots + 1) % 4;
        searchLoader.innerText = `等待答复信号${'.'.repeat(searchDots)}`;
    }
}, 500);

// 事件监听器绑定
if (connectBtn) connectBtn.addEventListener('click', connectDevice);
if (selectStrengthBtn) selectStrengthBtn.addEventListener('click', () => showDataDashboard('strength'));
if (selectFatigueBtn) selectFatigueBtn.addEventListener('click', () => showDataDashboard('fatigue'));
if (backToTypesBtn) backToTypesBtn.addEventListener('click', goBackToTypes);
if (tabBtnStrength) tabBtnStrength.addEventListener('click', () => switchDataType('strength'));
if (tabBtnFatigue) tabBtnFatigue.addEventListener('click', () => switchDataType('fatigue'));

// 模拟步骤1：连接设备
function connectDevice() {
    if (!connectBtn) return;
    connectBtn.disabled = true;
    connectBtn.innerText = "正在握手配对...";
    
    // 模拟1.2秒的硬件握手延迟
    setTimeout(() => {
        if (connectionStatus) {
            connectionStatus.innerText = "● 已连接: BLE_SENSOR_X1";
            connectionStatus.classList.remove('text-rose-400', 'border-rose-500/30');
            connectionStatus.classList.add('text-cyan-400', 'border-cyan-500/30', 'bg-cyan-950/30');
        }
        // 切换到界面2
        switchStep(2);
    }, 1200);
}

// 界面切换核心控制器
function switchStep(step) {
    currentStep = step;
    
    document.getElementById('step-1').classList.add('hidden');
    document.getElementById('step-2').classList.add('hidden');
    document.getElementById('step-3').classList.add('hidden');

    document.getElementById(`step-${step}`).classList.remove('hidden');
    
    // 如果离开数据流看板界面，清除数据刷新定时器
    if (step !== 3) {
        clearInterval(dataTimer);
    }
}

// 模拟步骤2：选择数据类型并进入界面3
function showDataDashboard(type) {
    selectedType = type;
    switchStep(3);
    updateDashboardMeta();
    startMockDataStream();
}

// 在数据界面内直接切换标签页
function switchDataType(type) {
    selectedType = type;
    updateDashboardMeta();
    // 重置最大峰值
    const maxValEl = document.getElementById('max-value');
    if (maxValEl) maxValEl.innerText = '0.0';
}

function goBackToTypes() {
    switchStep(2);
}

// 更新仪表盘的标题、单位和高亮Tab样式
function updateDashboardMeta() {
    const titleEl = document.getElementById('dashboard-title');
    const unitEl = document.getElementById('realtime-unit');
    
    if (!tabBtnStrength || !tabBtnFatigue) return;

    // 恢复未选中状态的基础样式
    tabBtnStrength.className = "px-3 py-1.5 rounded transition-colors text-slate-400 hover:text-slate-200 cursor-pointer";
    tabBtnFatigue.className = "px-3 py-1.5 rounded transition-colors text-slate-400 hover:text-slate-200 cursor-pointer";

    if (selectedType === 'strength') {
        if (titleEl) titleEl.innerText = "肌肉力量数据流";
        if (unitEl) unitEl.innerText = "N (牛顿)";
        tabBtnStrength.className = "px-3 py-1.5 rounded transition-colors bg-cyan-600 text-slate-950 font-medium";
    } else {
        if (titleEl) titleEl.innerText = "疲劳度实时分析";
        if (unitEl) unitEl.innerText = "% (疲劳比率)";
        tabBtnFatigue.className = "px-3 py-1.5 rounded transition-colors bg-emerald-600 text-slate-950 font-medium";
    }
}

// 模拟步骤3：生成实时波形与数值数据流
function startMockDataStream() {
    clearInterval(dataTimer);
    let maxValue = 0;
    mockHistoryData = Array(12).fill(0); // 清空历史

    dataTimer = setInterval(() => {
        let currentVal = 0;
        
        if (selectedType === 'strength') {
            // 模拟力量爆发和回落 (40N - 120N 之间波动)
            currentVal = (60 + Math.sin(Date.now() / 1000) * 20 + Math.random() * 15).toFixed(1);
        } else {
            // 模拟疲劳度缓慢上升加微幅抖动
            currentVal = (30 + (Date.now() % 60000) / 1000 * 0.8 + Math.random() * 4).toFixed(1);
        }

        // 更新当前实时值
        const rtValEl = document.getElementById('realtime-value');
        if (rtValEl) rtValEl.innerText = currentVal;
        
        // 更新最大值
        const maxValEl = document.getElementById('max-value');
        if (maxValEl && parseFloat(currentVal) > maxValue) {
            maxValue = parseFloat(currentVal);
            maxValEl.innerText = maxValue.toFixed(1);
        }

        // 压入历史队列并重新渲染柱状图
        mockHistoryData.push(parseFloat(currentVal));
        mockHistoryData.shift();
        renderChartBars(maxValue);

    }, 250); // 每250ms刷新一次
}

// 动态渲染能量柱状图
function renderChartBars(max) {
    const container = document.getElementById('chart-bars-container');
    if (!container) return;
    container.innerHTML = ''; // 清空上一帧
    
    const activeColor = selectedType === 'strength' ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]';

    mockHistoryData.forEach(val => {
        const percent = max > 0 ? (val / max) * 100 : 0;
        const bar = document.createElement('div');
        bar.className = `flex-1 ${activeColor} rounded-t transition-all duration-200`;
        bar.style.height = `${Math.max(percent, 5)}%`; // 保证基础高度
        container.appendChild(bar);
    });
}