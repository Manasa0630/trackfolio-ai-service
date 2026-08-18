require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // check console.groq.com for current available models

app.get('/', (req, res) => {
    res.json({ status: 'Trackfolio AI microservice is running' });
});

// POST /analyze
// Body: { jobDescription: string, skills: string[] }
// Returns: { matchedSkills, missingSkills, suggestedTopics, prepPlan }
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
  "matchPercent": 65,
  "topics": [
    {
      "topic": "topic name",
      "priority": "High",
      "estimatedHours": 5,
      "reason": "one short sentence on why this matters for this JD",
      "studyPoints": ["sub-concept 1", "sub-concept 2", "sub-concept 3"]
    }
  ],
  "prepPlan": "A short 2-3 sentence prioritized prep plan."
}

Rules:
- matchPercent = roughly what percentage of the JD's required skills the candidate already has (0-100 integer).
- priority must be exactly one of: "High", "Medium", "Low" — based on how central the topic is to the JD.
- List topics in priority order (High first).
- Include at most 5 topics.
- IMPORTANT — handling alternatives: when the JD lists alternative/equivalent skills using "or" (e.g. "ReactJS or VueJS", "Python, Django or Flask OR Java"), treat that as ONE combined requirement, not separate mandatory items.
  - If the candidate already has ANY ONE of the alternatives, count the whole requirement as matched — do not list the other alternatives as missing (e.g. if the candidate knows React, do not list VueJS as missing).
  - If the candidate has NONE of the alternatives, list only the single most standard/common alternative as missing (e.g. prefer listing "Python" over listing "Python", "Django", and "Flask" as three separate missing items for one requirement).
  - Never list more than one missing skill per single "X or Y" requirement in the JD.`;

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

        // Strip accidental markdown code fences before parsing, just in case
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

// POST /roadmap
// Body: { jobDescription: string, missingSkills: string[] }
// Returns: { days: [{ dayNumber, title, tasks: [string] }] }
app.post('/roadmap', async (req, res) => {
    const { jobDescription, missingSkills } = req.body;

    if (!jobDescription || !missingSkills) {
        return res.status(400).json({ error: 'jobDescription and missingSkills are required' });
    }

    const prompt = `You are a placement preparation coach. Given a job description and a list of skills the candidate is missing, create a focused 7-day study roadmap.

Job Description:
"""
${jobDescription}
"""

Missing skills to prioritize: ${missingSkills.join(', ')}

Respond with ONLY a valid JSON object (no markdown, no code fences, no extra text) in exactly this shape:
{
  "days": [
    {
      "dayNumber": 1,
      "title": "short day title, e.g. JavaScript Fundamentals",
      "tasks": ["specific task 1", "specific task 2", "specific task 3"]
    }
  ]
}

Rules:
- Exactly 7 days.
- Each day should have 2-4 concrete, specific tasks (not vague like "study X" — say what to actually do).
- Front-load the highest priority missing skills into earlier days.
- Day 7 should include a mock assessment or revision of weak areas.`;

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
            console.error('Failed to parse roadmap response as JSON:', rawContent);
            return res.status(502).json({ error: 'AI response was not valid JSON', raw: rawContent });
        }

        res.json(parsed);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Roadmap generation failed' });
    }
});

const PORT = process.env.PORT || 6001;
app.listen(PORT, () => {
    console.log(`Trackfolio AI microservice listening on port ${PORT}`);
});