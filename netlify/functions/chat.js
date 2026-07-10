const { OpenAI } = require("openai");

// 初始化讯飞星辰客户端
const client = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.API_BASE
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
        // 2. 严谨解析请求体，防止无效或空的 JSON 触发崩溃
        const requestData = JSON.parse(event.body || "{}");
        const type = requestData.type || "free_chat";
        const payload = requestData.payload || null;          // 做空值保护
        const messages = requestData.messages || [];

        let finalMessages = [];

        // ================= 场景 1: 肌肉生理数据自动分析 =================
        if (type === "analyze_muscle") {
            // 如果前端由于高频计算未完成，传过来了空 payload，提供一组默认安全兜底值，不至于让后端 500
            const size = payload ? (payload.size || "38.5") : "38.5";
            const fatigue = payload ? (payload.fatigue || "50.0") : "50.0";
            const excitement = payload ? (payload.excitement || "65.0") : "65.0";
            const strength = payload ? (payload.strength || "90.0") : "90.0";
            
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
                ...messages // 透传前端聊天历史上下文
            ];
        }

        // 3. 呼叫大模型
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
                content: completion.choices[0].message.content
            })
        };

    } catch (err) {
        // 后端真正崩溃时，捕获异常，并在日志中打印详细的调用栈
        console.error("====== 后端执行异常 ======", err);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({ 
                error: err.message,
                stack: err.stack // 把具体的崩溃详情也带回前端控制台，方便本地联调一眼看清
            })
        };
    }
};
