const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testAPI() {
  try {
    console.log('Testing OpenAI API...');
    console.log('API Key:', process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 20) + '...' : 'NOT SET');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Say "API is working!"' }
      ],
      max_tokens: 10
    });
    
    console.log('✅ Success!');
    console.log('Response:', response.choices[0].message.content);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Status:', error.status);
    console.error('Type:', error.type);
  }
}

testAPI();
