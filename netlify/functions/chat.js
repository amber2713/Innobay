exports.handler = async (event) => {
    let apiKey = null;
    let apiBase = null;
    let modelId = null;

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
        // 读取环境变量
        apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY || process.env.XUNFEI_API_KEY || process.env.SPARK_API_KEY;
        apiBase = process.env.API_BASE || process.env.OPENAI_BASE_URL || process.env.XUNFEI_API_BASE || process.env.XUNFEI_BASE_URL || process.env.SPARK_API_BASE;
        modelId = process.env.MODEL_ID || process.env.OPENAI_MODEL || process.env.XUNFEI_MODEL_ID || process.env.SPARK_MODEL_ID;

        // 基础验证
        if (!apiKey || !apiBase || !modelId) {
            throw new Error("AI 配置不完整，请在 Netlify 环境变量中设置您的 API_KEY、API_BASE 和 MODEL_ID。")
        }
    } catch (err) {
        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({ error: err.message })
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
            // 如果前端由于高频计算未完成，传过来了空 payload，提供一组默认安全兜底值
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

        // 3. 拼接并标准化请求 Endpoint
        const safeApiBase = apiBase || "";
        const endpoint = safeApiBase.includes('/chat/completions')
            ? safeApiBase
            : `${safeApiBase.replace(/\/$/, '')}/chat/completions`;

        // 环境兼容性防御检查
        if (typeof fetch !== 'function') {
            throw new Error("当前 Node 环境不支持原生 fetch。请在 Netlify 后台确保 NODE_VERSION 环境变量已设置为 18 或 20 以上。");
        }

        // 4. 呼叫 AI 远端接口
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: finalMessages,
                temperature: 0.7,
                max_tokens: 2048
            })
        });

        // 5. 健壮接收：先转成文本，防止接口非标准返回（如 502/504 报错网页）导致 JSON 解析直接炸掉
        const responseText = await response.text();
        let data = {};
        try {
            data = JSON.parse(responseText);
        } catch(e) {
            throw new Error(`AI 服务未返回标准的 JSON 格式。状态码: ${response.status}，原始响应截取: ${responseText.substring(0, 150)}`);
        }

        // 6. 远端业务报错拦截
        if (!response.ok || data.error) {
            const errorMsg = data.error?.message || data.error || responseText;
            throw new Error(`AI 供应商返回异常 (状态码 ${response.status}): ${typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg}`);
        }

        const aiContent = data.choices?.[0]?.message?.content || data.content || '';

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({
                content: aiContent
            })
        };

    } catch (err) {
        // 后端真正崩溃时，捕获异常并在控制台打印
        console.error("====== 后端执行异常 ======", err);
        return {
            statusCode: 500,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" 
            },
            body: JSON.stringify({ 
                error: err.message,
                stack: err.stack // 把具体的崩溃详情带回前端，方便联调
            })
        };
    }
};
