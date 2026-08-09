require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

app.get('/', (req, res) => {
    res.json({ status: 'Trackfolio AI microservice is running' });
});

app.post('/analyze', async (req, res) => {
    const { jobDescription, skills } = req.body;

    if (!jobDescription || !skills) {
        return res.status(400).json({ error: 'jobDescription and skills are required' });
    }

    const prompt = `You are a placement preparation assistant. Given a job description and a candidate's current skills, analyze the fit.

Job Description:
"""
${jobDescription}
"""

Candidate's current skills: ${skills.join(', ')}

Respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) in exactly this shape:
{
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "suggestedTopics": ["topic1", "topic2"],
  "prepPlan": "A short 2-3 sentence prioritized prep plan."
}`;

    try {
        const groqResponse = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
            }),
        });

        if (!groqResponse.ok) {
            const errText = await groqResponse.text();
            console.error('Groq API error:', errText);
            return res.status(502).json({ error: 'AI provider request failed' });
        }

        const data = await groqResponse.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        const cleaned = rawContent.replace(/```json|```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (parseErr) {
            console.error('Failed to parse AI response as JSON:', rawContent);
            return res.status(502).json({ error: 'AI response was not valid JSON', raw: rawContent });
        }

        res.json(parsed);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'AI analysis failed' });
    }
});

const PORT = process.env.PORT || 6000;
app.listen(PORT, () => {
    console.log(`Trackfolio AI microservice listening on port ${PORT}`);
});