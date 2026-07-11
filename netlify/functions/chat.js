const { OpenAI } = require("openai");

// 初始化 OpenAI 客户端（会自动读取环境变量）
const client = new OpenAI({
    apiKey: process.env.API_KEY || process.env.OPENAI_API_KEY || process.env.XUNFEI_API_KEY || process.env.SPARK_API_KEY,
    baseURL: process.env.API_BASE || process.env.OPENAI_BASE_URL || process.env.XUNFEI_API_BASE || process.env.SPARK_API_BASE
});

exports.handler = async (event) => {
    // 1. 处理跨域预检请求
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Methods": "POST, OPTIONS"
            }
        };
    }

    try {
        // 2. 解析前端发来的请求体
        const requestData = JSON.parse(event.body || "{}");
        const type = requestData.type || "free_chat";
        const payload = requestData.payload || null;
        const messages = requestData.messages || [];

        let finalMessages = [];

        // ================= 场景 1: 肌肉生理数据自动分析 =================
        if (type === "analyze_muscle") {
            const size = payload ? (payload.size || "38.5") : "38.5";
            const fatigue = payload ? (payload.fatigue || "50.0") : "50.0";
            const excitement = payload ? (payload.excitement || "65.0") : "65.0";
            const strength = payload ? (payload.strength || "90.0") : "90.0";
            
            // 规避星火大模型对 system 角色的引擎报错，直接注入 user 
            finalMessages = [
                {
                    role: "user",
                    content: `【教练全局指令】
你是一个顶级的运动生理学专家与智能AI教练。
你的任务是根据用户提供的肌肉生理指标数据进行精确分析，并给出最终的训练行动指令。
你必须在回答的开头或者醒目位置，明确给出以下核心指令之一：【建议继续训练】、【加大重量】、【减少重量】、【停止训练】。
接着，给出具体的【休息时间建议】以及简短的科学原理解释。

【当前实测指标数据】
- 肌肉大小/围度 (Size): ${size} cm
- 肌肉疲劳度 (Fatigue): ${fatigue}%
- 肌肉兴奋程度 (Excitement): ${excitement}%
- 肌肉当前力量输出 (Strength): ${strength} N`
                }
            ];
        } 
        // ================= 场景 3 (新增): 5日肌肉围度纵向复盘 =================
        else if (type === "analyze_trend") {
            const historySizes = payload && payload.history_sizes ? payload.history_sizes : [37.8, 38.0, 38.3, 38.2];
            const todaySize = payload ? (payload.today_size || "38.5") : "38.5";
            const todayFatigue = payload ? (payload.today_fatigue || "50.0") : "50.0";
            const todayStrength = payload ? (payload.today_strength || "90.0") : "90.0";

            finalMessages = [
                {
                    role: "user",
                    content: `【专家纵向诊断指令】
你是一个高级运动生理学专家与超量恢复（Supercompensation）评定顾问。
请针对用户提供的【5日肌肉围度演变趋势】以及【今日实时体征】，进行深度的多周期纵向对比分析。

你的回答应当包含以下模块（使用清晰的排版）：
1. 【趋势评定】：明确判断用户当前的肌肉状态是属于【高效充血期】、【超量恢复生长期】、【疲劳水肿期】还是【增肌平台期】。
2. 【数据交叉比对】：结合前4天的历史围度 [${historySizes.join("cm, ")}cm] 与今天的最新围度 ${todaySize}cm，同时参考今日肌电输出力量（${todayStrength}N）与疲劳度（${todayFatigue}%），解释产生该趋势的深层生理学逻辑。
3. 【周期性策略调整】：针对接下来的 48-72 小时，给出精确的训练强度调整（如：是否引入 De-load 减量周、维持原计划还是寻求极限突破）与饮食营养补充策略。`
                }
            ];
        }
        // ================= 场景 2: 自由 AI 问答交互 =================
        else {
            finalMessages = [
                {
                    role: "user",
                    content: process.env.AI_IDENTITY_PROMPT || "你是一个专业的智能运动健康助手，负责解答用户关于健身、肌肉训练相关的疑问。请保持专业和严谨。"
                },
                ...messages
            ];
        }

        // 3. 使用官方 SDK 呼叫大模型
        const completion = await client.chat.completions.create({
            model: process.env.MODEL_ID || process.env.OPENAI_MODEL || process.env.XUNFEI_MODEL_ID || "generalv3.5",
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 2048
        });

        // 4. 返回标准结果给前端
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                content: completion.choices[0].message.content
            })
        };

    } catch (err) {
        console.error("====== 后端执行异常 ======", err);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ 
                error: err.message,
                stack: err.stack 
            })
        };
    }
};
