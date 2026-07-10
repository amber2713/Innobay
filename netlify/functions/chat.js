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
            
            // 特别注意：这里直接使用 user 角色，把教练指令和数据合并，完美避开星火对 system 角色的引擎报错
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
