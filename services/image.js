const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateImage(prompt, size = '1024x1024', quality = 'standard') {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size,
    quality,
  });

  return {
    url: response.data[0].url,
    revisedPrompt: response.data[0].revised_prompt || prompt,
  };
}

module.exports = { generateImage };
