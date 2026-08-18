import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('data/raw_messages_264201832492957698.json', 'utf8'));

console.log('--- ESTATÍSTICAS DO DATASET EXPANDIDO ---');
console.log('Total Mensagens:', data.messages.length);
console.log('Total Diálogos:', data.dialogues.length);

const userStats = {};
for (const d of data.dialogues) {
  userStats[d.otherUser] = (userStats[d.otherUser] || 0) + 1;
}

console.log('\n--- DIÁLOGOS POR INTERLOCUTOR ---');
console.table(Object.entries(userStats).sort((a,b) => b[1] - a[1]));

console.log('\n--- AMOSTRA DE 25 DIÁLOGOS AUTÊNTICOS DO DATASET ---');
data.dialogues.slice(0, 25).forEach((d, i) => {
  console.log(`${i+1}. [${d.otherUser}] "${d.otherMessage}"\n   -> Jinchi: "${d.targetResponse}"\n`);
});
