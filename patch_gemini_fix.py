with open('services/router.js', 'rb') as f:
    raw = f.read()

uses_crlf = b'\r\n' in raw
c = raw.decode('utf-8')

def adapt(s):
    return s.replace('\n', '\r\n') if uses_crlf else s

patches = []

# Fix 1: callGemini function definition - model name
old1 = "    model: 'gemini-3-flash-preview',\n    systemInstruction: systemPrompt,\n    generationConfig: {\n      temperature: 0.1,\n      topP: 0.8,\n      maxOutputTokens: 2048\n    }\n  });"
new1 = "    model: 'gemini-2.5-flash',\n    systemInstruction: systemPrompt,\n    generationConfig: {\n      temperature: 0.1,\n      topP: 0.8,\n      maxOutputTokens: 2048\n    }\n  });"
patches.append((old1, new1, 'callGemini function model name'))

# Fix 2: the broken inline duplicate in /chat route - replace entire block with a call to the real callGemini function
old2 = """      try {
        console.log('🌊 Using Gemini 3 Flash Preview');
        const geminiModel = genAI.getGenerativeModel({
          model: 'gemini-3-flash-preview',
          systemInstruction: systemPrompt,
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        });
        const chat = geminiModel.startChat({ history: [] });
        const result = await chat.sendMessage(message);
        reply = result.response.text();
      } catch (geminiError) {"""
new2 = """      try {
        console.log('🌊 Using Gemini 2.5 Flash');
        reply = await callGemini(message, history, systemPrompt);
      } catch (geminiError) {"""
patches.append((old2, new2, '/chat route inline Gemini block (fixes missing history bug)'))

# Fix 3: /models route - id and name
old3 = "      { id: 'gemini-3-flash-preview', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },"
new3 = "      { id: 'gemini-2.5-flash', name: 'NES AI Fast', provider: 'NES AI', context: '1M', speed: 'Fastest' },"
patches.append((old3, new3, '/models route id'))

# Fix 4: /models route - default
old4 = "    default: 'gemini-3-flash-preview'"
new4 = "    default: 'gemini-2.5-flash'"
patches.append((old4, new4, '/models route default'))

applied = 0
for old, new, label in patches:
    old_a = adapt(old)
    new_a = adapt(new)
    if old_a in c:
        c = c.replace(old_a, new_a)
        applied += 1
        print(f'PATCHED: {label}')
    else:
        print(f'NOT FOUND: {label}')

with open('services/router.js', 'wb') as f:
    f.write(c.encode('utf-8'))

print(f'\nTotal patches applied: {applied}/4')
