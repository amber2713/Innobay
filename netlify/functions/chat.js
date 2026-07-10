const { OpenAI } = require("openai");

// 初始化讯飞星辰客户端（使用你原有的环境变量命名）
const client = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.API_BASE
});

exports.handler = async (event) => {
    // 处理跨域请求（避免前端联调时产生跨域报错）
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
        // 解析前端传来的请求体
        const { type, payload, messages = [] } = JSON.parse(event.body || "{}");
        
        let finalMessages = [];

        // ================= 场景 1: 肌肉生理数据自动分析 =================
        if (type === "analyze_muscle") {
            const { size, fatigue, excitement, strength } = payload;
            
            finalMessages = [
                {
                    role: "system",
                    content: `你是一个顶级的运动生理学专家与智能AI教练。
你的任务是根据用户提供的肌肉生理指标数据进行精确分析，并给出最终的训练行动指令。
你必须在回答的开头或者醒目位置，明确给出以下核心指令之一：【建议继续训练】、【加大重量】、【减少重量】、【停止训练】。
接着，给出具体的【休息时间建议】以及简短的科学原理解释。`
                },
                {
                    role: "user",
                    content: `请评估我当前的肌肉状态并给出教练建议。当前指标数据如下：
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
                    role: "system",
                    content: process.env.AI_IDENTITY_PROMPT || "你是一个专业的智能运动健康助手，负责解答用户关于健身、肌肉训练、伤病防护和饮食相关的疑问。请保持专业、亲切、严谨。"
                },
                ...messages // 直接继承你之前代码的上下文透传
            ];
        }

        // 调用大模型
        const completion = await client.chat.completions.create({
            model: process.env.MODEL_ID,
            messages: finalMessages,
            temperature: 0.7,
            max_tokens: 2048
        });

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({
                // 保持与你旧项目一致的字段名 content
                content: completion.choices[0].message.content
            })
        };
    } catch (err) {
        console.error("Chat error:", err);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({ error: err.message })
        };
    }
};
