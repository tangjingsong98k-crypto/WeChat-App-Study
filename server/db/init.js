const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'tree-game.db');

let db;

function getDb() {
  if (!db) {
    db = initDatabase();
  }
  return db;
}

function initDatabase(dbPath) {
  const database = new Database(dbPath || DB_PATH);

  // Enable WAL mode for better concurrent read performance
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  createTables(database);
  seedData(database);

  return database;
}

function createTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      water_count INTEGER NOT NULL DEFAULT 50,
      last_water_recover_time INTEGER NOT NULL,
      fertilize_count INTEGER NOT NULL DEFAULT 0,
      last_login_date TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      species TEXT NOT NULL CHECK(species IN ('apple', 'cherry', 'oak')),
      level INTEGER NOT NULL DEFAULT 0,
      grow_score INTEGER NOT NULL DEFAULT 0,
      health_score INTEGER NOT NULL DEFAULT 30,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS card_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      set_name TEXT NOT NULL,
      effect_description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_name TEXT NOT NULL,
      card_icon TEXT NOT NULL,
      card_quality TEXT NOT NULL CHECK(card_quality IN ('common', 'rare', 'epic', 'legendary')),
      card_possibility REAL NOT NULL,
      card_set_id INTEGER NOT NULL DEFAULT -1
    );

    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      owned_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (card_id) REFERENCES cards(id)
    );

    CREATE TABLE IF NOT EXISTS user_rankings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      participate INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function seedData(database) {
  // Only seed if cards table is empty
  const cardCount = database.prepare('SELECT COUNT(*) as count FROM cards').get();
  if (cardCount.count > 0) {
    return;
  }

  const insertSet = database.prepare(
    'INSERT INTO card_sets (set_name, effect_description) VALUES (?, ?)'
  );

  const insertCard = database.prepare(
    'INSERT INTO cards (card_name, card_icon, card_quality, card_possibility, card_set_id) VALUES (?, ?, ?, ?, ?)'
  );

  const seedTransaction = database.transaction(() => {
    // Insert card sets
    insertSet.run('四季之歌', '集齐后浇水成长值翻倍持续1小时');
    insertSet.run('森林守护者', '集齐后每日健康值扣除减半持续3天');
    insertSet.run('彩虹花园', '集齐后获得稀有卡牌概率提升50%持续1天');

    // Insert cards - 四季之歌 set (id=1)
    insertCard.run('春之芽', '/images/cards/spring_bud.png', 'common', 30, 1);
    insertCard.run('夏之花', '/images/cards/summer_flower.png', 'common', 25, 1);
    insertCard.run('秋之果', '/images/cards/autumn_fruit.png', 'rare', 15, 1);
    insertCard.run('冬之雪', '/images/cards/winter_snow.png', 'rare', 10, 1);

    // Insert cards - 森林守护者 set (id=2)
    insertCard.run('小松鼠', '/images/cards/squirrel.png', 'common', 28, 2);
    insertCard.run('猫头鹰', '/images/cards/owl.png', 'rare', 12, 2);
    insertCard.run('小鹿', '/images/cards/deer.png', 'epic', 5, 2);
    insertCard.run('独角兽', '/images/cards/unicorn.png', 'legendary', 2, 2);

    // Insert cards - 彩虹花园 set (id=3)
    insertCard.run('红玫瑰', '/images/cards/red_rose.png', 'common', 26, 3);
    insertCard.run('蓝铃花', '/images/cards/bluebell.png', 'rare', 14, 3);
    insertCard.run('金向日葵', '/images/cards/sunflower.png', 'epic', 6, 3);
    insertCard.run('紫水晶兰', '/images/cards/crystal_orchid.png', 'legendary', 1, 3);

    // Insert cards - no set (card_set_id = -1)
    insertCard.run('幸运草', '/images/cards/lucky_clover.png', 'common', 20, -1);
    insertCard.run('流星', '/images/cards/shooting_star.png', 'rare', 8, -1);
    insertCard.run('彩虹', '/images/cards/rainbow.png', 'epic', 4, -1);
    insertCard.run('凤凰羽', '/images/cards/phoenix_feather.png', 'legendary', 1, -1);
  });

  seedTransaction();
}

function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  initDatabase,
  closeDatabase,
};
