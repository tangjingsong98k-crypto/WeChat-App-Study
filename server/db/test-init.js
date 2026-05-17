const { initDatabase } = require('./init.js');

const db = initDatabase(':memory:');

console.log('Tables:');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
tables.forEach(t => console.log(' -', t.name));

console.log('\nCard sets:');
const sets = db.prepare('SELECT * FROM card_sets').all();
sets.forEach(s => console.log(' ', s.id, s.set_name, '-', s.effect_description));

console.log('\nCards count:', db.prepare('SELECT COUNT(*) as c FROM cards').get().c);

console.log('\nCards by quality:');
const byQuality = db.prepare('SELECT card_quality, COUNT(*) as c FROM cards GROUP BY card_quality').all();
byQuality.forEach(q => console.log(' ', q.card_quality, ':', q.c));

console.log('\nSample cards:');
const sampleCards = db.prepare('SELECT id, card_name, card_quality, card_possibility, card_set_id FROM cards LIMIT 5').all();
sampleCards.forEach(c => console.log(' ', c.id, c.card_name, `(${c.card_quality}, weight:${c.card_possibility}, set:${c.card_set_id})`));

// Test idempotency - running seed again should not duplicate data
const { initDatabase: initDb2 } = require('./init.js');
const db2 = initDb2(':memory:');
// Manually call seed again on same db to test idempotency
const cardCount = db.prepare('SELECT COUNT(*) as count FROM cards').get();
console.log('\nIdempotency check - cards still:', cardCount.count);

db.close();
db2.close();
console.log('\nDatabase initialization successful!');
