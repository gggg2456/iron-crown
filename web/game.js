/* 铁与王冠 · 简易中世纪 RTS
   采金、造兵、建塔、守住主堡并摧毁黑鸦主堡。 */
(() => {
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);

const TILE_W = 64, TILE_H = 32, HW = 32, HH = 16;
const MAP = 56;
const MAP_PX_W = MAP * 2 * HW, MAP_PX_H = MAP * 2 * HH;
const ORIGIN = MAP * HW;
const PLAYER = 'player', ENEMY = 'enemy', ALLY = 'ally';

const CAMPAIGN_GOLD = 1200;
// 农民征召：临时民兵（不花金币，征召期不产金，20 秒后自动复原，最多同时 3 个）
const MILITIA = { dmg: 8, hp: 100, range: 1.2, time: 20, max: 3 };
/* ===== 1. DATA TABLES ===== */
const DIFFS = {
  squire: { first: 70, every: 65, base: 2, grow: 1.0, train: 19, max: 14 },
  knight: { first: 55, every: 50, base: 3, grow: 1.3, train: 16, max: 18 },
  king:   { first: 45, every: 40, base: 4, grow: 1.6, train: 13, max: 22 }
};

const B = {
  keep: {
    name: '赤蔷薇主堡', enemyName: '黑鸦主堡', w: 3, d: 3, hp: 2600, h: 126,
    attack: { range: 6.4, dmg: 9, cd: 1.45 }, dropoff: true, produces: ['peasant'],
    desc: '王国的心脏。自动向附近敌人射箭，也是农民存放金币的地方。'
  },
  house: {
    name: '农舍', enemyName: '黑鸦农舍', w: 2, d: 2, hp: 480, h: 58, pop: 6, garrison: 4,
    cost: 80, desc: '增加 6 点人口上限。可驻守 4 名步兵，驻军中的弓手会从窗口射击。'
  },
  barracks: {
    name: '兵营', enemyName: '黑鸦兵营', w: 2, d: 2, hp: 820, h: 80,
    cost: 120, produces: ['spearman', 'swordsman', 'crossbowman', 'archer', 'knight', 'halberdier', 'priest'],
    desc: '训练长矛兵、剑士、重弩手、长弓手、骑士、戟兵与祭司。每多一座兵营，训练速度额外 +50%（可叠加）。'
  },
  tower: {
    name: '箭塔', enemyName: '黑鸦箭塔', w: 2, d: 2, hp: 620, h: 108,
    cost: 100, attack: { range: 6.8, dmg: 11, cd: 1.15 },
    desc: '自动射击射程内的敌人。建在矿脉或主堡前方，能拖住一整波攻势。'
  },
  watchtower: {
    name: '瞭望塔', enemyName: '黑鸦瞭望塔', w: 2, d: 2, hp: 540, h: 100, icon: 'tower',
    cost: 300, radar: true,
    desc: 'T2 雷达建筑。提供全场雷达视野，移除战争迷雾，并显示敌方建筑与部队。'
  },
  wall: {
    name: '城墙', enemyName: '黑鸦城墙', w: 1, d: 1, hp: 420, h: 40,
    cost: 30, desc: '便宜的石头墙段，可阻挡并拖延敌军，为箭塔争取射击时间。'
  },
  fountain: {
    name: '圣泉', enemyName: '圣泉', w: 2, d: 2, hp: 440, h: 56, icon: 'store',
    cost: 110, heal: { range: 4.3, amount: 4, cd: .8 },
    desc: '持续治疗周围的友军。放置在主堡或箭塔后方，让防线更持久。'
  },
  armory: {
    name: '军械库', enemyName: '黑鸦军械库', w: 2, d: 2, hp: 560, h: 64, icon: 'store',
    cost: 160, pop: 8,
    desc: '增加 8 点人口上限，并让全军训练速度额外 +15%。'
  },
  workshop: {
    name: '车厂', enemyName: '黑鸦车厂', w: 3, d: 3, hp: 900, h: 78, icon: 'workshop',
    cost: 220, produces: ['ram', 'catapult', 'scorpion'],
    desc: '制造中世纪攻城车辆：冲车、投石车与弩车。车辆缓慢，但能撕开城墙与密集阵型。'
  },
  market: {
    name: '市场', enemyName: '黑鸦市集', w: 2, d: 2, hp: 620, h: 64, icon: 'store',
    cost: 160, income: { amount: 7, cd: 6 },
    desc: '每 6 秒带来 7 金币的贸易收入。越早建造，后期经济越稳。'
  },
  cathedral: {
    name: '大教堂', enemyName: '黑鸦大教堂', w: 3, d: 3, hp: 1100, h: 118, icon: 'castle',
    cost: 320, pop: 10, bless: { amount: 6, cd: 6 }, garrison: 6,
    desc: '主要建筑。增加 10 点人口上限，每 6 秒为全场友军恢复 6 点生命。可驻守 6 名步兵，弓手会从塔楼射击。'
  },
  ballista: {
    name: '弩炮塔', enemyName: '黑鸦弩炮塔', w: 2, d: 2, hp: 700, h: 104, icon: 'catapult',
    cost: 180, attack: { range: 9.2, dmg: 34, cd: 2.2 },
    desc: '射程极远的重型弩炮，专门撕开重甲单位与攻城部队。'
  },
  mill: {
    name: '磨坊', enemyName: '黑鸦磨坊', w: 2, d: 2, hp: 500, h: 72, icon: 'house',
    cost: 90, pop: 4, income: { amount: 4, cd: 7 },
    desc: 'T1 经济建筑。增加 4 点人口，并每 7 秒带来 4 金币收入。'
  },
  forge: {
    name: '铁匠铺', enemyName: '黑鸦铁匠铺', w: 2, d: 2, hp: 680, h: 68, icon: 'workshop',
    cost: 180, pop: 4,
    desc: 'T2 后勤建筑。增加 4 点人口，并提高车厂与兵营的训练效率。'
  },
  sunAltar: {
    name: '天火祭坛', enemyName: '黑鸦天火祭坛', w: 2, d: 2, hp: 880, h: 112, icon: 'catapult',
    cost: 360, superBuilding: 'fire',
    desc: 'T3 超武建筑。建成后才能选择并建造「天火圣裁」。'
  },
  stormSpire: {
    name: '雷霆尖塔', enemyName: '黑鸦雷霆尖塔', w: 2, d: 2, hp: 820, h: 116, icon: 'tower',
    cost: 340, superBuilding: 'storm',
    desc: 'T3 超武建筑。建成后才能选择「雷霆审判」。'
  },
  plagueWell: {
    name: '瘟疫之井', enemyName: '黑鸦瘟疫之井', w: 2, d: 2, hp: 760, h: 86, icon: 'store',
    cost: 320, superBuilding: 'plague',
    desc: 'T3 超武建筑。建成后才能选择「瘟疫之息」。'
  },
  drumTower: {
    name: '战鼓台', enemyName: '黑鸦战鼓台', w: 2, d: 2, hp: 700, h: 88, icon: 'flag',
    cost: 260, mini: true, miniRadius: 5.5, miniCd: 45,
    desc: '小超武建筑：每 45 秒可敲响战鼓，范围内友军 +30% 移速 / +20% 伤害，敌军 −30% 移速 / −20% 伤害，持续 12 秒。'
  }
};

const U = {
  peasant: {
    name: '农民', enemyName: '黑鸦农奴', hp: 60, speed: 2.45, dmg: 3, range: .9,
    cd: 1.3, aggro: 0, pop: 1, cost: 50, time: 3, h: 22, producer: 'keep', icon: 'peasant',
    role: '经济单位', desc: '采集金矿并运回主堡。左键点击金矿即可指派，自动往返。'
  },
  swordsman: {
    name: '剑士', enemyName: '黑鸦剑士', hp: 125, speed: 1.9, dmg: 12, range: 1.05,
    cd: 1.0, aggro: 5.5, pop: 1, cost: 80, time: 5, h: 27, producer: 'barracks', icon: 'sword',
    role: '近战步兵', desc: '能扛能打的剑盾步兵，适合顶在阵线最前方。'
  },
  archer: {
    name: '长弓手', enemyName: '黑鸦长弓手', hp: 78, speed: 2.0, dmg: 8, range: 5.6,
    cd: 1.3, aggro: 6.2, pop: 1, cost: 70, time: 5, h: 25, producer: 'barracks', icon: 'archer',
    role: '远程步兵', desc: '射程很远但怕近身。让剑士挡在前面，弓手在后方输出。'
  },
  knight: {
    name: '骑士', enemyName: '黑鸦骑士', hp: 230, speed: 2.8, dmg: 20, range: 1.15,
    cd: 1.1, aggro: 6, pop: 2, cost: 150, time: 8, h: 36, producer: 'barracks', icon: 'knight',
    role: '重装骑兵', desc: '昂贵但强壮的骑兵，冲锋时能迅速撕开敌方弓手。'
  },
  hero: {
    name: '狮心英雄', enemyName: '黑鸦冠军', hp: 820, speed: 2.65, dmg: 44, range: 1.25,
    cd: 1.05, aggro: 7.2, pop: 3, cost: 280, time: 18, h: 46, producer: 'keep', icon: 'hero',
    req: 'cathedral',
    role: '英雄单位（唯一）',
    desc: '需要先建成大教堂（T3）才能受封。全场只能拥有一名；普攻每 8 秒触发「裂地斩」，脱战 5 秒后持续自愈。'
  },
  spearman: {
    name: '长矛兵', enemyName: '黑鸦长矛兵', hp: 140, speed: 1.85, dmg: 14, range: 1.3,
    cd: 1.15, aggro: 5.5, pop: 1, cost: 75, time: 5, h: 28, producer: 'barracks', icon: 'sword',
    role: '反骑步兵', desc: '长矛对骑兵造成 1.6 倍伤害，是阻挡黑鸦骑士冲锋的中坚。'
  },
  crossbowman: {
    name: '重弩手', enemyName: '黑鸦重弩手', hp: 90, speed: 1.8, dmg: 18, range: 5.0,
    cd: 2.0, aggro: 6, pop: 1, cost: 85, time: 6, h: 26, producer: 'barracks', icon: 'archer',
    role: '重弩步兵', desc: '射速较慢但单发威力高，对建筑额外造成 15% 伤害。'
  },
  halberdier: {
    name: '长戟兵', enemyName: '黑鸦长戟兵', hp: 210, speed: 1.7, dmg: 28, range: 1.45,
    cd: 1.25, aggro: 6, pop: 2, cost: 130, time: 9, h: 32, producer: 'barracks', icon: 'sword',
    role: '重装戟兵', desc: '身披重甲的精锐步兵。对骑兵与建筑造成 1.4 倍伤害。'
  },
  priest: {
    name: '战地祭司', enemyName: '黑鸦祭司', hp: 100, speed: 2.1, dmg: 8, range: 4.8,
    cd: 1.6, aggro: 5.5, pop: 2, cost: 140, time: 9, h: 28, producer: 'barracks', icon: 'scroll',
    role: '战地祭司', desc: '发射圣光弹，并持续治疗周围的友军。英雄最好的搭档。'
  },
  ram: {
    name: '冲车', enemyName: '黑鸦冲车', hp: 480, speed: 1.05, dmg: 55, range: 1.4,
    cd: 2.4, aggro: 6, pop: 3, cost: 180, time: 12, h: 44, producer: 'workshop', icon: 'catapult',
    role: '攻城车', desc: '笨重的木制冲车，对建筑造成 2.6 倍伤害，但几乎追不上步兵。'
  },
  catapult: {
    name: '投石车', enemyName: '黑鸦投石车', hp: 240, speed: .95, dmg: 46, range: 7.5,
    cd: 4.0, aggro: 7, pop: 3, cost: 240, time: 15, h: 42, producer: 'workshop', icon: 'catapult',
    role: '攻城器械', desc: '抛射巨石，落点周围敌军受到 55% 溅射伤害；对建筑伤害更高。'
  },
  scorpion: {
    name: '弩车', enemyName: '黑鸦弩车', hp: 210, speed: 1.3, dmg: 32, range: 6.6,
    cd: 2.3, aggro: 6.5, pop: 2, cost: 190, time: 11, h: 36, producer: 'workshop', icon: 'archer',
    role: '弩车', desc: '装在木车上的重型弩，射程远、单发高，适合掩护冲车推进。'
  },
  baseVehicle: {
    name: '基地车', enemyName: '黑鸦基地车', hp: 420, speed: 1.35, dmg: 0, range: .9,
    cd: 1.5, aggro: 0, pop: 0, cost: 300, time: 12, h: 44, producer: 'workshop', icon: 'workshop',
    role: '移动基地', deployable: true,
    desc: '无武装的移动基地。开到空地后部署，可展开成一座新的赤蔷薇主堡，重新获得存兵、采金与建造能力。'
  },
  assassin: {
    name: '黑鸦刺客', enemyName: '黑鸦刺客', hp: 90, speed: 3.55, dmg: 16, range: .95,
    cd: .72, aggro: 7, pop: 1, cost: 0, time: 1, h: 25, producer: 'barracks', icon: 'sword',
    role: '疾袭单位', desc: '披着黑兜帽的快速刺客，会从侧翼扑向落单的部队。'
  },
  shaman: {
    name: '黑鸦巫师', enemyName: '黑鸦巫师', hp: 115, speed: 1.9, dmg: 12, range: 5.2,
    cd: 1.5, aggro: 6, pop: 1, cost: 0, time: 1, h: 28, producer: 'barracks', icon: 'scroll',
    role: '施法单位', desc: '投掷腐蚀魔弹，并持续治疗周围的黑鸦部队。'
  },
  dog: {
    name: '猎犬', enemyName: '黑鸦猎犬', hp: 45, speed: 3.5, dmg: 4, range: .9,
    cd: 1.2, aggro: 0, pop: 0, cost: 25, time: 2, h: 16, producer: 'barracks', icon: 'peasant',
    role: '侦察单位', desc: '跑得最快、视野最远（10 格），不主动交战。便宜，用来探路和开视野。'
  },
  lancer: {
    name: '枪骑兵', enemyName: '黑鸦枪骑兵', hp: 190, speed: 3.0, dmg: 18, range: 1.2,
    cd: 1.05, aggro: 6.2, pop: 2, cost: 120, time: 7, h: 34, producer: 'barracks', icon: 'knight',
    role: '轻装骑兵', desc: '比重装骑士便宜，冲锋快，专门追杀弓手与农民。'
  },
  javelineer: {
    name: '掷矛手', enemyName: '黑鸦掷矛手', hp: 70, speed: 2.2, dmg: 9, range: 3.6,
    cd: 1.5, aggro: 5.5, pop: 1, cost: 55, time: 3, h: 24, producer: 'barracks', icon: 'archer',
    role: '廉价远程', desc: '射程短、伤害低，但开局面便宜好用，适合前期骚扰。'
  }
};

// 战斗加成表：数值全部集中在这里，逻辑只读字段，不写死兵种类型判断。
// ===== 阵营系数（FACTION_MODS） =====
// 数值规则（写死，不要再改）：
//   最终值 = 基础兵种表 × UNIT_BONUS（兵种特性） × FACTION_MODS（阵营系数）
//   · 同类百分比相乘：长戟反骑 1.4 × 青杉伤害 1.1 = 1.54（不是 1.5）
//   · 固定值（如射程 +1）在乘法链之后相加
//   · 未写的字段按 1.0（固定值按 0）处理
// 只在遭遇战生效；战役固定赤蔷薇、不吃阵营系数。
const FACTION_MODS = {
  rose:  {
    meleeHpMul: 1.10, meleeDmgMul: 1.05,
    gatherMul: 1.05
  },
  pine:  {
    rangedRangeAdd: 1, dmgMul: 1.10,
    towerHpMul: 1.20, buildSpeedMul: 1.10,
    speedMul: 0.95, cavalrySpeedMul: 0.90
  },
  raven: {
    meleeHpMul: 0.90, speedMul: 1.15, cavalrySpeedMul: 1.20,
    trainSpeedMul: 1.10, gatherMul: 0.90,
    typeCost: { javelineer: 0.80 }
  }
};
function factionMods() {
  return (S.run === 'skirmish' && S.faction && FACTION_MODS[S.faction]) ? FACTION_MODS[S.faction] : {};
}
function modVal(key, def) {
  const v = factionMods()[key];
  return typeof v === 'number' ? v : (def === undefined ? 1 : def);
}
// 近战加成只覆盖正面战线（剑士/骑士）；长矛、长戟、英雄不吃，反骑线保持原样。
const FRONTLINE_TYPES = new Set(['swordsman', 'knight']);
function isMeleeType(type) { return U[type] ? U[type].range <= 2 : false; }
function unitHpFactionMul(type) {
  return modVal('hpMul') * (FRONTLINE_TYPES.has(type) ? modVal('meleeHpMul') : 1);
}
function unitDmgFactionMul(type) {
  return modVal('dmgMul') * (FRONTLINE_TYPES.has(type) ? modVal('meleeDmgMul') : 1);
}
function unitSpeedFactionMul(type) {
  return modVal('speedMul') * (CAVALRY_TYPES.has(type) ? modVal('cavalrySpeedMul') : 1);
}
function unitRangeFactionAdd(type) {
  // 射程加值只作用于单位，不作用于箭塔/城墙等建筑（建筑射程仍读 B[type].attack.range）。
  return isMeleeType(type) ? 0 : modVal('rangedRangeAdd', 0);
}
function unitCostFaction(type) {
  const base = U[type] ? U[type].cost : (B[type] ? B[type].cost : 0);
  const per = (factionMods().typeCost || {})[type] || 1;
  return Math.round(base * modVal('costMul') * per);
}
function buildingCostFaction(type) {
  return Math.round((B[type] ? B[type].cost : 0) * modVal('buildCostMul'));
}
function buildSecondsFaction(type) {
  return (BUILD_TIME[type] || 4) / modVal('buildSpeedMul');
}
function trainSecondsFaction(type) {
  return (U[type] ? U[type].time : 1) / modVal('trainSpeedMul');
}
function gatherFactionMul() { return modVal('gatherMul'); }

const UNIT_BONUS = {
  crossbowman: { vsBuilding: 1.15 },
  catapult:    { vsBuilding: 1.8 },
  scorpion:    { vsUnit: 1.2 },
  spearman:    { vsCavalry: 1.6 },
  halberdier:  { vsCavalry: 1.4, vsBuilding: 1.4 },
  ram:         { vsBuilding: 2.6 },
  knight:      { vsBuilding: 1.25 }
};
const CAVALRY_TYPES = new Set(['knight', 'lancer']);
const TABS = {
  build: ['house', 'barracks', 'market', 'mill', 'armory', 'workshop', 'forge', 'cathedral', 'sunAltar', 'stormSpire', 'plagueWell', 'drumTower'],
  units: ['peasant', 'spearman', 'swordsman', 'crossbowman', 'archer', 'knight', 'hero', 'halberdier', 'priest', 'dog', 'lancer', 'javelineer'],
  siege: ['ram', 'catapult', 'scorpion', 'baseVehicle'],
  defense: ['tower', 'watchtower', 'wall', 'fountain', 'ballista', 'super_fire', 'super_storm', 'super_plague'],
  tech: ['logistics', 'drill', 'steel', 'plate', 'royal', 'strategy_banner', 'strategy_march', 'strategy_siege']
};
const BUILD_TIER = {
  house: 1, barracks: 1, tower: 1, wall: 1, fountain: 1, market: 1, mill: 1,
  armory: 2, workshop: 2, ballista: 2, forge: 2, watchtower: 2,
  cathedral: 3, sunAltar: 3, stormSpire: 3, plagueWell: 3, drumTower: 2
};
const TIER_REQ = { 2: 'barracks', 3: 'workshop' };
const SUPERS = {
  fire: {
    name: '天火圣裁', icon: 'catapult', cost: 900, tier: 'T3', cd: 90, building: 'sunAltar',
    radius: 4.6, unitDmg: 180, buildDmg: 420, color: '#ffcf72',
    desc: '在指定区域降下天火，对范围内敌军和建筑造成巨额伤害。'
  },
  storm: {
    name: '雷霆审判', icon: 'scroll', cost: 800, tier: 'T3', cd: 75, building: 'stormSpire',
    radius: 3.8, unitDmg: 260, buildDmg: 300, color: '#9fd8ff',
    desc: '召来雷霆轰击一小片区域，命中单位会被短暂麻痹。'
  },
  plague: {
    name: '瘟疫之息', icon: 'shield', cost: 700, tier: 'T3', cd: 60, building: 'plagueWell',
    radius: 6.4, unitDmg: 110, buildDmg: 240, color: '#b7d98a',
    desc: '释放大范围毒雾，伤害较弱，但会让敌军大幅减速。'
  }
};
// 遭遇战三阵营：每个阵营只拥有一种超级武器。
const FACTIONS = {
  rose:  { name: '赤蔷薇', super: 'fire',   tag: '王座正统' },
  pine:  { name: '青杉',   super: 'storm',  tag: '山林盟约' },
  raven: { name: '黑鸦',   super: 'plague', tag: '铁鸦军团' }
};
function factionOf() { return FACTIONS[S.faction] || FACTIONS.rose; }
function factionSuperOf(key) {
  if (TECH[key] && TECH[key].isSuper) return TECH[key].superKey;
  const found = Object.keys(SUPERS).find(k => SUPERS[k].building === key);
  return found || null;
}
function factionSuperMatch(key) {
  return factionSuperOf(key) === factionOf().super;
}
const TECH = {
  logistics: { tier: 'T1', name: '后勤学', cost: 240, icon: 'coin', building: 'mill', desc: '农民每次运回的金币 +20%。需要先建造「磨坊」。', req: null },
  drill: { tier: 'T1', name: '征兵令', cost: 280, icon: 'flag', building: 'barracks', desc: '全军训练速度 +15%。需要先建造「兵营」。', req: null },
  steel: { tier: 'T2', name: '精钢锻造', cost: 420, icon: 'sword', building: 'forge', desc: '全军伤害 +15%。需要先建造「锻造坊」。', req: null },
  plate: { tier: 'T2', name: '板甲工坊', cost: 460, icon: 'shield', building: 'armory', desc: '全军生命上限 +20%，并立即补满新增生命。需要先建造「军械库」。', req: null },
  royal: { tier: 'T3', name: '皇家卫队', cost: 680, icon: 'hero', building: 'cathedral', desc: '骑士与英雄伤害 +25%、生命 +20%。需要先建造「大教堂」。', req: 'steel' },
  strategy_banner: { tier: 'T2', name: '军旗号令', cost: 500, icon: 'flag', building: 'barracks', desc: '策略：全军伤害 +10%，移动速度 +8%。需要先建造「兵营」。', req: null },
  strategy_march: { tier: 'T1', name: '急行军', cost: 420, icon: 'scroll', building: 'market', desc: '策略：全军移动速度再 +12%。需要先建造「市集」。', req: null },
  strategy_siege: { tier: 'T2', name: '攻城工程学', cost: 580, icon: 'catapult', building: 'workshop', desc: '策略：攻城车伤害 +25%，车厂训练速度 +20%。需要先建造「工程作坊」。', req: null },
  super_fire: { tier: 'T3', name: '天火圣裁', cost: SUPERS.fire.cost, icon: SUPERS.fire.icon, desc: SUPERS.fire.desc + ' 需要先建成「天火祭坛」。', req: null, isSuper: true, superKey: 'fire', superBuilding: SUPERS.fire.building, building: SUPERS.fire.building },
  super_storm: { tier: 'T3', name: '雷霆审判', cost: SUPERS.storm.cost, icon: SUPERS.storm.icon, desc: SUPERS.storm.desc + ' 需要先建成「雷霆尖塔」。', req: null, isSuper: true, superKey: 'storm', superBuilding: SUPERS.storm.building, building: SUPERS.storm.building },
  super_plague: { tier: 'T3', name: '瘟疫之息', cost: SUPERS.plague.cost, icon: SUPERS.plague.icon, desc: SUPERS.plague.desc + ' 需要先建成「瘟疫之井」。', req: null, isSuper: true, superKey: 'plague', superBuilding: SUPERS.plague.building, building: SUPERS.plague.building }
};
const GARRISON_TYPES = new Set(['peasant', 'spearman', 'swordsman', 'crossbowman', 'archer', 'halberdier', 'priest']);
const RANKS = ['', '新兵', '老兵', '精锐'];
const BUILD_TIME = {
  keep: 10, house: 3.5, barracks: 5, workshop: 8, market: 5, cathedral: 12,
  armory: 6, tower: 4, wall: 1.5, fountain: 5, ballista: 6, watchtower: 6.5,
  mill: 4, forge: 7, sunAltar: 16, stormSpire: 14, plagueWell: 15, drumTower: 8
};
const BUILD_RADIUS = 9.5;
const VISION_U = {
  peasant: 6, spearman: 6.5, swordsman: 6.5, crossbowman: 7.5, archer: 8,
  knight: 8.5, hero: 9.5, halberdier: 6.5, priest: 7, ram: 7,
  catapult: 8.5, scorpion: 7.5, baseVehicle: 7.5, assassin: 7, shaman: 7,
  dog: 10, lancer: 8.5, javelineer: 6.5
};
const VISION_B = {
  keep: 12, house: 7, barracks: 8, workshop: 8, market: 8, cathedral: 11,
  armory: 7, fountain: 6, tower: 10, wall: 2, ballista: 10, watchtower: 16,
  mill: 7, forge: 8, sunAltar: 9, stormSpire: 10, plagueWell: 9, drumTower: 9
};

const BASE_UNLOCKED = ['house', 'barracks', 'workshop', 'market', 'cathedral', 'tower', 'wall', 'fountain', 'peasant', 'spearman', 'swordsman', 'crossbowman', 'archer', 'knight', 'hero', 'ram', 'catapult', 'scorpion', 'baseVehicle', 'mill', 'forge', 'sunAltar', 'stormSpire', 'plagueWell', 'watchtower', 'drumTower', 'dog', 'lancer', 'javelineer'];
const LEVELS = [
  {
    name: '边境劫掠', trait: '掠夺成性',
    desc: '黑鸦掠夺者成群结队，但甲胄单薄。第一波攻势来得稍晚。',
    firstAdd: 15, everyAdd: 15, extra: 0, trainMul: 1.15,
    mods: { hp: 1, dmg: 1, speed: 1 }, reward: 'halberdier', rewardName: '长戟兵', map: 'border'
  },
  {
    name: '铁鸦重甲', trait: '重甲',
    desc: '黑鸦铁卫换上厚甲，生命 +35%、伤害 +5%，但行进迟缓。',
    firstAdd: 10, everyAdd: 8, extra: 1, trainMul: 1.05,
    mods: { hp: 1.35, dmg: 1.05, speed: .9 }, reward: 'priest', rewardName: '战地祭司', map: 'highland'
  },
  {
    name: '群鸦奔袭', trait: '疾行',
    desc: '敌军移速 +25%，出兵间隔更短，波次规模增加。',
    firstAdd: 0, everyAdd: 0, extra: 2, trainMul: .78,
    mods: { hp: 1.08, dmg: 1, speed: 1.25 }, reward: 'armory', rewardName: '军械库', map: 'marsh'
  },
  {
    name: '瘟疫投石', trait: '淬毒',
    desc: '黑鸦攻城队淬毒箭矢，伤害 +30%，生命 +20%。',
    firstAdd: -5, everyAdd: -5, extra: 3, trainMul: .9,
    mods: { hp: 1.2, dmg: 1.3, speed: 1 }, reward: 'ballista', rewardName: '弩炮塔', map: 'ash'
  },
  {
    name: '黑鸦之王', trait: '王者之怒',
    desc: '黑鸦之王亲征：生命 +55%、伤害 +45%。这是最后一战。',
    firstAdd: -10, everyAdd: -10, extra: 4, trainMul: .85,
    mods: { hp: 1.55, dmg: 1.45, speed: 1.1 }, reward: null, rewardName: '', map: 'throne'
  }
];
/* ------------- main storyline ------------- */
const STORY = [
  {
    intro: [
      '黑鸦的掠夺队越过了界河。他们没有旗帜，只有火把——烧掉谷仓，赶走牲畜，把能带走的一切都带走。',
      '你带着残兵赶回时，村口只剩焦黑的木桩。老猎户跪在灰里，指给你看北面的高地：掠夺者的营地就在那里，他们把抢来的东西堆成一座小山。'
    ],
    objective: '摧毁掠夺者营地的主堡，夺回被抢走的粮食与金矿。',
    outro: '掠夺者的营地在夜里烧成了第二个太阳。你从灰烬里捡回半袋麦种，分给还愿意留下的人。'
  },
  {
    intro: [
      '边境的溃兵带回一个消息：黑鸦的铁卫出动了。他们披着三层重甲，走路像铁匠铺里的风箱，慢，但刀砍上去只留一道白痕。',
      '赤蔷薇的旧军械库里还埋着一批长戟。挖出来，磨亮，也许还来得及。'
    ],
    objective: '击溃黑鸦铁卫，摧毁他们的前沿要塞。',
    outro: '重甲倒下时，声音像一座小塔塌了。你的长戟兵把断戟插在路口，作为给下一个路过的黑鸦人的告示。'
  },
  {
    intro: [
      '黑鸦不再列阵了。他们把骑兵拆成小队，从沼泽、从林线、从你没想到的方向扑上来，咬一口就走。',
      '斥候说他们跑得比消息还快。那就让消息跑得更快——修瞭望塔，铺开视野，把每一次奔袭都变成他们的葬礼。'
    ],
    objective: '在沼泽地带挡住黑鸦的连续奔袭，反攻并摧毁他们的主堡。',
    outro: '沼泽吞掉了太多马蹄。最后一批奔袭者没有再回来，他们的马在泥里站了一夜，第二天被你的农民牵了回来。'
  },
  {
    intro: [
      '黑鸦的投石车开始往城里扔东西。不是石头——是裹着腐肉的陶罐。砸开的地方，三天之内没有人敢靠近。',
      '大教堂的祭司说，火与石灰能压住疫气。你需要先把那些投石车拆掉，再把干净的井水引回城里。'
    ],
    objective: '摧毁黑鸦的攻城队与主堡，保住营地不被瘟疫拖垮。',
    outro: '石灰撒过的地方，第二年春天长出了很密的草。祭司说那是死者的谢意，也说那是活人的。'
  },
  {
    intro: [
      '王座厅的门是开着的。黑鸦之王坐在那里，盔甲上还沾着边境的火灰——他从一开始就没有打算退。',
      '你身后是五场战役剩下的所有人。他们没有喊口号，只是把盾牌往前挪了半步。'
    ],
    objective: '攻入王座厅，击溃黑鸦之王，夺回铁与王冠。',
    outro: '铁冠从台阶上滚下来，停在你脚边。你没有立刻捡起来——你先把它擦干净了。'
  }
];
const FINALE = '赤蔷薇的旗帜重新挂上城墙那天，下了很久的雨。人们说，铁会生锈，王冠会蒙尘，但只要还有人愿意为一袋麦种打仗，这个国家就还没有结束。';

const HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ENEMY_SITES = [
  { x: 34, y: 8 },   // 东北旧营地
  { x: 8, y: 7 },    // 西北林间
  { x: 38, y: 30 },  // 东侧隘口
  { x: 20, y: 6 },   // 北境荒原
  { x: 34, y: 38 },  // 东南丘陵
  { x: 46, y: 8 },   // 东北远哨
  { x: 44, y: 30 },  // 东境荒堡
  { x: 16, y: 46 },  // 南境旧寨
  { x: 40, y: 46 },  // 东南海岸
  { x: 26, y: 10 }   // 北岭石堡
];
const ALLY_SITES = [
  { x: 44, y: 38 },  // 东南高地
  { x: 48, y: 30 },  // 东境丘陵
  { x: 40, y: 46 },  // 东南海岸
  { x: 48, y: 44 }   // 东南远哨
];
const MAP_THEMES = {
  border: {
    name: '边境河谷',
    greens: ['#485a34', '#50643a', '#586e3f', '#42532f', '#4d6036'],
    grassA: 'rgba(111,130,69,.44)', grassB: 'rgba(48,66,33,.45)',
    water: 'rgba(46,92,100,.82)', marsh: 'rgba(57,67,41,.62)', road: 'rgba(146,119,76,.14)',
    clearing: ['rgba(123,103,67,.55)', 'rgba(106,88,58,.3)', 'rgba(106,88,58,0)'],
    waterAreas: [[5.5, 17.5, 5.2, 4.1]],
    marshAreas: [[18.5, 34.5, 4.4, 2.8], [28.5, 31.5, 3.7, 2.6]],
    roads: [[[9, 34.5], [15, 29.5], [22, 23], [28.5, 16.5], [35.5, 11.5]]],
    forests: [[3, 38, 4], [4, 24, 4], [13, 40, 3], [2, 13, 4], [14, 14, 3], [20, 31, 2], [26, 27, 2], [19, 6, 4], [9, 6, 3], [26, 3, 3], [39, 20, 4], [41, 29, 4], [33, 37, 4], [25, 38, 3], [41, 4, 3], [17, 22, 2], [40, 38, 3]],
    gold: [[13, 31], [10, 36], [16, 26], [28, 6], [33, 15], [27, 12], [21, 21], [24, 17]],
    clearings: [[8.5, 32.5, 7.5], [35.5, 9.5, 7.8], [22, 22, 3.4]],
    farm: true, ruin: true
  },
  highland: {
    name: '风啸高地',
    greens: ['#3f5032', '#475a38', '#51653e', '#39482d', '#425634'],
    grassA: 'rgba(120,135,78,.42)', grassB: 'rgba(44,59,34,.48)',
    water: 'rgba(38,79,92,.8)', marsh: 'rgba(50,63,42,.55)', road: 'rgba(154,124,78,.17)',
    clearing: ['rgba(132,113,77,.5)', 'rgba(98,85,60,.28)', 'rgba(98,85,60,0)'],
    waterAreas: [[4.5, 10, 3.2, 2.2], [39, 34.5, 3.6, 2.4], [21, 7, 2.4, 1.6]],
    marshAreas: [[27, 24, 2.8, 1.8]],
    roads: [[[9, 34.5], [15, 29.5], [22, 23], [30, 17], [35.5, 11.5]], [[6, 39], [14, 37], [21, 33], [27, 27]]],
    forests: [[3, 26, 4], [5, 14, 4], [13, 20, 4], [18, 39, 3], [25, 34, 3], [30, 7, 4], [36, 18, 3], [41, 27, 4], [39, 42, 3], [21, 13, 3], [10, 5, 3]],
    gold: [[13, 31], [9, 36], [17, 25], [28, 6], [33, 15], [27, 12], [20, 20], [25, 18]],
    clearings: [[8.5, 32.5, 7.5], [35.5, 9.5, 7.8], [20, 22, 3.2]],
    farm: false, ruin: false
  },
  marsh: {
    name: '雾沼低地',
    greens: ['#3f4d35', '#46563b', '#4b5d3e', '#38452f', '#435238'],
    grassA: 'rgba(112,128,75,.4)', grassB: 'rgba(42,57,36,.5)',
    water: 'rgba(39,78,84,.82)', marsh: 'rgba(58,66,42,.68)', road: 'rgba(128,108,71,.12)',
    clearing: ['rgba(104,94,64,.45)', 'rgba(82,78,54,.3)', 'rgba(82,78,54,0)'],
    waterAreas: [[5, 16, 5.6, 3.2], [31, 27, 4.5, 2.8], [39, 39, 3.1, 2.1]],
    marshAreas: [[12, 37, 5.5, 3], [21, 30, 5, 3.2], [27, 13, 4, 2.4], [15, 9, 3.5, 2.2]],
    roads: [[[9, 34.5], [15, 30], [22, 24], [29, 18], [35.5, 11.5]]],
    forests: [[2, 27, 4], [8, 20, 3], [18, 13, 4], [26, 5, 3], [35, 22, 4], [41, 29, 3], [36, 40, 3], [9, 5, 4], [24, 40, 3]],
    gold: [[13, 31], [10, 36], [16, 26], [28, 6], [33, 15], [27, 12], [21, 20], [24, 17]],
    clearings: [[8.5, 32.5, 7.2], [35.5, 9.5, 7.4], [22, 22, 3.1]],
    farm: false, ruin: true
  },
  ash: {
    name: '灰烬荒原',
    greens: ['#4a4734', '#524c38', '#5b533d', '#3e3c2f', '#484434'],
    grassA: 'rgba(130,115,77,.34)', grassB: 'rgba(60,52,39,.5)',
    water: 'rgba(46,64,66,.78)', marsh: 'rgba(64,57,42,.55)', road: 'rgba(124,105,77,.18)',
    clearing: ['rgba(118,99,73,.5)', 'rgba(91,78,59,.3)', 'rgba(91,78,59,0)'],
    waterAreas: [[12, 12, 3.2, 2.2], [31, 21, 4, 2.5], [40, 37, 2.7, 1.8]],
    marshAreas: [[7, 37, 4.2, 2.6], [23, 33, 3.8, 2.2]],
    roads: [[[9, 34.5], [16, 28], [22, 23], [29, 16], [35.5, 11.5]], [[4, 28], [12, 26], [20, 24], [28, 22], [38, 20]]],
    forests: [[3, 21, 3], [15, 38, 2], [19, 7, 3], [27, 31, 2], [38, 15, 3], [42, 28, 2], [33, 4, 2], [8, 6, 2]],
    gold: [[13, 31], [10, 36], [16, 26], [28, 6], [33, 15], [27, 12], [21, 21], [25, 17]],
    clearings: [[8.5, 32.5, 7.2], [35.5, 9.5, 7.5], [22, 22, 3.2]],
    farm: false, ruin: true
  },
  throne: {
    name: '王座大道',
    greens: ['#4a5838', '#53623f', '#5c6b45', '#435031', '#4e5b3a'],
    grassA: 'rgba(126,138,83,.42)', grassB: 'rgba(49,63,38,.45)',
    water: 'rgba(42,84,91,.8)', marsh: 'rgba(55,65,43,.55)', road: 'rgba(168,139,87,.22)',
    clearing: ['rgba(137,118,80,.55)', 'rgba(104,91,65,.3)', 'rgba(104,91,65,0)'],
    waterAreas: [[4, 12, 3, 2], [40, 35, 3.2, 2]],
    marshAreas: [[8, 22, 2.5, 1.5]],
    roads: [[[9, 34.5], [16, 29], [22, 23], [29, 16], [35.5, 11.5]], [[4, 32], [12, 32], [22, 23], [32, 14], [40, 9]]],
    forests: [[2, 20, 2], [7, 8, 2], [17, 38, 2], [26, 38, 2], [38, 25, 2], [42, 5, 2], [30, 3, 2], [13, 5, 2]],
    gold: [[13, 31], [10, 36], [17, 26], [28, 6], [33, 15], [27, 12], [21, 21], [25, 17]],
    clearings: [[8.5, 32.5, 7.5], [35.5, 9.5, 7.8], [22, 22, 4.2]],
    farm: false, ruin: true
  }
};
const TAB_KEYS = { z: 'build', x: 'units', c: 'defense', b: 'tech' };
const TAB_ORDER = ['build', 'units', 'defense', 'siege', 'tech'];
const TAB_LABELS = { build: '建造', units: '兵种', defense: '防御', siege: '攻城', tech: '科技' };
// The original road network stops near the old center. These outer roads,
// forests and mines keep the expanded map worth exploring.
const OUTER_ROADS = [
  [[9, 34.5], [16, 38], [24, 36], [32, 38], [40, 36], [48, 34], [53, 30]],
  [[22, 2], [24, 10], [22, 18], [24, 26], [22, 34], [24, 42], [22, 50], [24, 54]]
];
const OUTER_FORESTS = [[46, 16, 3], [49, 42, 3], [16, 48, 3], [32, 49, 3], [50, 6, 2], [6, 48, 3], [44, 48, 2]];
const OUTER_GOLD = [[46, 12], [48, 26], [48, 42], [20, 48], [34, 48], [8, 46]];
for (const theme of Object.values(MAP_THEMES)) {
  theme.roads.push(...OUTER_ROADS);
  theme.forests.push(...OUTER_FORESTS);
  theme.gold.push(...OUTER_GOLD);
}
const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const mini = $('#minimap');
const mctx = mini.getContext('2d');
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');
let DPR = Math.min(2, window.devicePixelRatio || 1);
let VW = innerWidth, VH = innerHeight;

/* ===== 2. GAME STATE ===== */
const S = {
  mode: 'menu', paused: false, diffKey: 'knight', time: 0,
  gold: 400, uid: 1,
  units: [], buildings: [], goldNodes: [], trees: [], props: [],
  projs: [], particles: [], floats: [], superFx: [],
  selected: [], selectedBuilding: null, inspect: null,
  groups: {},
  placing: null, drag: null, panning: null,
  mouse: { x: 0, y: 0, wx: 0, wy: 0, inside: false },
  keys: {},
  prod: { keep: { cur: null, queue: [] }, barracks: { cur: null, queue: [] }, workshop: { cur: null, queue: [] } },
  buildQ: { cur: null, queue: [] },
  faction: 'rose', tutorial: false, tutStep: 0, miniCd: 0, miniAim: false, perf: { path: 0, sep: 0, pathReq: 0, pathDef: 0, pathCool: 0, pushChecks: 0, sepMs: 0, pushMs: 0, frames: 0 }, pathBudget: 4, crateStats: { scans: 0, dispatches: 0, aborts: 0, picksPlayer: 0, picksEnemy: 0, picksAlly: 0, picksDispatched: 0, picksFree: 0 }, crateAborts: { combat: 0, gone: 0, timeout: 0 }, lastWin: false, tech: {}, superCd: 0, superKey: null, superAim: false, forceAim: false, enemySuper: null,
  radar: false,
  campaignLevel: 0, enemyMods: { hp: 1, dmg: 1, speed: 1 },
  run: 'campaign', supersEnabled: true, skirmish: null,
  crates: [], crateTimer: 25,
  unlocked: new Set(BASE_UNLOCKED),
  wave: { n: 0, timer: 55 },
  enemy: { nextTrain: 10 },
  cam: { x: 0, y: 0, z: 1 },
  stats: { kills: 0, losses: 0, gathered: 0 },
  tab: 'build', hover: null, lastUnderAttack: -99,
  audio: false, muted: false, ambient: 0,
  toastTimer: null, bannerTimer: null,
  mapCanvas: null, miniBase: null, miniInfo: null,
  terrain: {},
  mapTheme: 'border',
  enemySite: { x: 34, y: 8 },
  allySite: { x: 44, y: 38 },
  allyEnabled: false, allyAI: null,
  tour: null
};

/* ===== 3. UTILITIES ===== */
/* ------------- utility ------------- */
function hash(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function seeded(seed) {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function mapPos(x, y) { return { x: ORIGIN + (x - y) * HW, y: (x + y) * HH }; }
function worldToScreen(x, y) {
  const p = mapPos(x, y);
  return { x: p.x * S.cam.z + S.cam.x, y: p.y * S.cam.z + S.cam.y };
}
function screenToWorld(sx, sy) {
  const mx = (sx - S.cam.x) / S.cam.z, my = (sy - S.cam.y) / S.cam.z;
  const u = (mx - ORIGIN) / HW, v = my / HH;
  return { x: (u + v) / 2, y: (v - u) / 2 };
}
function rel(u, v) { return { x: (u - v) * HW, y: (u + v) * HH }; }
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP && y < MAP; }
function terrainAt(x, y) { return (S.terrain && S.terrain[Math.floor(x) + ',' + Math.floor(y)]) || null; }
function setTerrain(x, y, type) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (!inMap(ix, iy)) return;
  if (S.buildings.some(b => ix >= b.tx && ix < b.tx + b.w && iy >= b.ty && iy < b.ty + b.d)) return;
  if (S.goldNodes.some(g => Math.hypot(ix + .5 - g.x, iy + .5 - g.y) < 1.9)) return;
  S.terrain[ix + ',' + iy] = type;
}
function generateTerrain() {
  S.terrain = {};
  const theme = MAP_THEMES[S.mapTheme] || MAP_THEMES.border;
  for (const [cx, cy, rx, ry] of theme.waterAreas) {
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 < 1) setTerrain(x, y, 'water');
      }
    }
  }
  for (const [cx, cy, rx, ry] of theme.marshAreas) {
    for (let y = 0; y < MAP; y++) {
      for (let x = 0; x < MAP; x++) {
        if (S.terrain[x + ',' + y]) continue;
        if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 < 1) setTerrain(x, y, 'marsh');
      }
    }
  }
  for (const road of theme.roads) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, ay] = road[i], [bx, by] = road[i + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / .35);
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(lerp(ax, bx, s / steps)), y = Math.floor(lerp(ay, by, s / steps));
        for (let oy = 0; oy <= 1; oy++) if (!S.terrain[x + ',' + (y + oy)]) setTerrain(x, y + oy, 'road');
      }
    }
  }
  // Keep base areas buildable regardless of the chosen map.
  const bases = [[8.5, 32.5, 5.8], [S.enemySite.x + 1.5, S.enemySite.y + 1.5, 6.4]];
  if (S.allyEnabled) bases.push([S.allySite.x + 1.5, S.allySite.y + 1.5, 5.2]);
  for (const [cx, cy, r] of bases) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (Math.hypot(x + .5 - cx, y + .5 - cy) <= r) delete S.terrain[x + ',' + y];
      }
    }
  }
}
function teamName(t) { return t === PLAYER ? factionOf().name : t === ALLY ? '青杉盟军' : '黑鸦'; }
function bname(b) { return b.team === ENEMY ? B[b.type].enemyName : (b.team === ALLY ? '盟军·' : '') + B[b.type].name; }
function uname(u) { return u.team === ENEMY ? U[u.type].enemyName : (u.team === ALLY ? '盟军·' : '') + U[u.type].name; }
function isFriendlyTeam(a, b) { return a === b || (a !== ENEMY && b !== ENEMY); }
function popCap() {
  return 10 + S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'house').length * 6
    + S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'armory').length * 8
    + S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'cathedral').length * 10;
}
function popUsed() { return S.units.filter(u => u.team === PLAYER).reduce((n, u) => n + U[u.type].pop, 0); }
function armyCount() {
  return S.units.filter(u => u.team === PLAYER && u.type !== 'peasant').length;
}
function heroAlive() {
  return S.units.some(u => u.team === PLAYER && u.type === 'hero' && u.hp > 0);
}
// 遭遇战使用一张中性“关卡”，不带战役加成，也不出现在战役进度里。
const SKIRMISH_LEVEL = {
  name: '遭遇战', trait: '人机对战', desc: '自定义起始资源的自由对局。',
  firstAdd: 0, everyAdd: 0, extra: 0, trainMul: 1,
  mods: { hp: 1, dmg: 1, speed: 1 }, reward: null, rewardName: '', map: 'border'
};
function currentLevel() {
  if (S.run === 'skirmish') return SKIRMISH_LEVEL;
  return LEVELS[S.campaignLevel] || LEVELS[0];
}
function isUnlocked(key) { return S.unlocked.has(key); }
function refreshUnlocked() {
  S.unlocked = new Set(BASE_UNLOCKED);
  if (S.run === 'skirmish') {
    for (const L of LEVELS) if (L.reward) S.unlocked.add(L.reward);
    return;
  }
  for (let i = 0; i < S.campaignLevel; i++) {
    const r = LEVELS[i] && LEVELS[i].reward;
    if (r) S.unlocked.add(r);
  }
}
function trainingSpeedFor(cat) {
  let sp = 1;
  if (cat === 'barracks') {
    const n = S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'barracks').length;
    sp += Math.max(0, n - 1) * .5;
  }
  if (cat === 'workshop') {
    const n = S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'workshop').length;
    sp += Math.max(0, n - 1) * .35;
  }
  const armories = S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'armory').length;
  const forges = S.buildings.filter(b => b.team === PLAYER && b.constructed !== false && b.type === 'forge').length;
  const siegeBonus = S.tech.strategy_siege && cat === 'workshop' ? 1.2 : 1;
  return sp * (1 + armories * .15 + forges * .08) * (1 + (S.tech.drill ? .15 : 0)) * siegeBonus;
}
function techDmgMul(u) {
  let m = 1;
  if (S.tech.steel) m *= 1.15;
  if (S.tech.royal && (u.type === 'knight' || u.type === 'hero')) m *= 1.25;
  if (S.tech.strategy_banner) m *= 1.10;
  if (S.tech.strategy_siege && (u.type === 'ram' || u.type === 'catapult' || u.type === 'scorpion')) m *= 1.25;
  if (u.rank > 1) m *= 1 + (u.rank - 1) * .15;
  return m;
}
function techSpeedMul(u) {
  let m = 1;
  if (S.tech.strategy_banner) m *= 1.08;
  if (S.tech.strategy_march) m *= 1.12;
  return m;
}
function playerHpMul(type) {
  let m = 1;
  if (S.tech.plate) m *= 1.2;
  if (S.tech.royal && (type === 'knight' || type === 'hero')) m *= 1.2;
  return m;
}
function scalePlayerHp(mul, filter) {
  for (const u of S.units) {
    if (u.team !== PLAYER || u.hp <= 0 || (filter && !filter(u))) continue;
    const before = u.maxHp;
    u.maxHp = Math.round(u.maxHp * mul);
    u.hp = Math.min(u.maxHp, u.hp + (u.maxHp - before));
  }
}
function syncStartUI() {
  const mode = S.tutorial ? 'tutorial' : (S.run === 'skirmish' ? 'skirmish' : 'campaign');
  $$('#mode-tabs .mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const cfg = $('#skirmish-config');
  if (cfg) cfg.hidden = mode !== 'skirmish';
  if (S.skirmish) {
    $$('#sk-gold button').forEach(b => b.classList.toggle('active', +b.dataset.gold === S.skirmish.gold));
    $$('#sk-inf button').forEach(b => b.classList.toggle('active', +b.dataset.inf === S.skirmish.inf));
    $$('#sk-faction button').forEach(b => b.classList.toggle('active', b.dataset.faction === (S.skirmish.faction || 'rose')));
    $$('#sk-map button').forEach(b => b.classList.toggle('active', b.dataset.map === (S.skirmish.map || 'random')));
    const t = $('#sk-super');
    if (t) t.classList.toggle('active', !!S.skirmish.supers);
  }
  updateCampaignUI();
}
function updateCampaignUI() {
  if (S.tutorial) {
    const kickerT = $$('.mission-kicker')[0];
    const objT = $$('.mission-objective')[0];
    if (kickerT) kickerT.textContent = '新手教学 · 边境营地';
    if (objT) objT.innerHTML = `<i></i>按左侧步骤完成教学`;
    const scT = $('#start-campaign');
    if (scT) scT.textContent = '新手教学 · 从农民开始，学会采集、建造与进攻';
    const loreT = $('.start-lore');
    if (loreT) loreT.innerHTML = `新手教学<br>跟着左侧步骤走，一步一步学会这座战场`;
    const mainT = $('#btn-start .start-btn-main');
    if (mainT) mainT.textContent = '开 始 教 学';
    return;
  }
  if (S.run === 'skirmish') {
    const theme = (MAP_THEMES[S.mapTheme] || MAP_THEMES.border).name;
    const kickerS = $$('.mission-kicker')[0];
    const objS = $$('.mission-objective')[0];
    if (kickerS) kickerS.textContent = `遭遇战 · ${theme}`;
    if (objS) objS.innerHTML = `<i></i>摧毁黑鸦主堡 · 人机对战`;
    const scS = $('#start-campaign');
    if (scS) scS.textContent = `遭遇战 · ${theme}　起始金币 ${(S.skirmish && S.skirmish.gold) || 2000}　初始步兵 ${(S.skirmish && S.skirmish.inf) || 0}`;
    const loreS = $('.start-lore');
    if (loreS) loreS.innerHTML = `遭遇战 · ${theme}<br>摧毁黑鸦主堡即可获胜 · 地图上会刷新奖励箱`;
    const mainS = $('#btn-start .start-btn-main');
    if (mainS) mainS.textContent = '开 始 遭 遇 战';
    return;
  }
  const L = currentLevel(), n = S.campaignLevel + 1;
  const kicker = $$('.mission-kicker')[0];
  const obj = $$('.mission-objective')[0];
  if (kicker) kicker.textContent = `第${CN_NUM[n] || n}章 · ${L.name}`;
  if (obj) obj.innerHTML = `<i></i>摧毁黑鸦主堡 · 敌军特质：${L.trait}`;
  const sc = $('#start-campaign');
  if (sc) sc.textContent = `第 ${n} 章 · ${L.name}　敌军特质：${L.trait}　${L.reward ? `通关解锁：${L.rewardName}` : '最终决战'}`;
  const lore = $('.start-lore');
  if (lore) lore.innerHTML = `第 ${n} 章 · ${L.name}<br>敌军特质：${L.trait}${L.reward ? `　·　通关解锁：${L.rewardName}` : '　·　最终决战'}<br>固定资金 ${CAMPAIGN_GOLD}（主线不可调整）`;
  const main = $('#btn-start .start-btn-main');
  if (main) main.textContent = `开 始 第 ${n} 章`;
}
const TUT_STEPS = [
  { text: '训练 2 名农民：选中主堡 → 兵种页 → 农民' },
  { text: '采集 300 金币：选中农民，左键点金矿' },
  { text: '建造 1 座农舍：建造页 → 农舍，就绪后放置' },
  { text: '训练 3 名步兵：长矛 / 剑士 / 掷矛手' },
  { text: '摧毁黑鸦哨站：全选部队，右键进攻' }
];
function tutorialState() {
  const peasants = S.units.filter(u => u.team === PLAYER && u.type === 'peasant').length
    + (S.prod.keep.cur && S.prod.keep.cur.type === 'peasant' ? 1 : 0)
    + S.prod.keep.queue.filter(i => i.type === 'peasant').length;
  const army = S.units.filter(u => u.team === PLAYER
    && ['spearman', 'swordsman', 'archer', 'crossbowman', 'javelineer', 'lancer'].includes(u.type)).length;
  return {
    peasants,
    gold: S.stats.gathered,
    house: playerHasBuilding('house'),
    army,
    keepGone: !S.buildings.some(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0)
  };
}
function renderTutorial() {
  const el = $('#tutorial-panel');
  if (!el) return;
  el.hidden = !S.tutorial;
  if (!S.tutorial) return;
  el.innerHTML = '<b>新手教学</b>' + TUT_STEPS.map((s, i) =>
    `<div class="tut-step ${i < S.tutStep ? 'done' : i === S.tutStep ? 'now' : ''}"><span>${i < S.tutStep ? '✔' : i + 1}</span>${s.text}</div>`).join('');
}
function updateTutorial(dt) {
  if (!S.tutorial) return;
  S.tutTimer = (S.tutTimer || 0) - dt;
  if (S.tutTimer > 0) return;
  S.tutTimer = .5;
  const st = tutorialState();
  const done = [st.peasants >= 2, st.gold >= 300, st.house, st.army >= 3, st.keepGone];
  while (S.tutStep < TUT_STEPS.length && done[S.tutStep]) {
    S.tutStep++;
    if (S.tutStep < TUT_STEPS.length) toast(`教学步骤完成，下一步：${TUT_STEPS[S.tutStep].text}`, '', 'scroll');
  }
  renderTutorial();
  if (S.tutStep >= TUT_STEPS.length && S.mode === 'playing') {
    toast('教学完成：你已经学会采集、建造与进攻。', '', 'crest');
    endGame(true);
  }
}
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ------------- audio ------------- */
const Sound = {
  ac: null, master: null, enabled: true, droneGain: null, last: {},
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ac.createGain();
      this.master.gain.value = this.enabled ? .45 : 0;
      this.master.connect(this.ac.destination);
      const drone = this.ac.createGain(); drone.gain.value = .022; drone.connect(this.master);
      [73.42, 110, 146.83].forEach((f, i) => {
        const o = this.ac.createOscillator(), g = this.ac.createGain();
        o.type = i === 1 ? 'sine' : 'triangle';
        o.frequency.value = f; o.detune.value = i * 3 - 3; g.gain.value = i === 1 ? .5 : .3;
        o.connect(g); g.connect(drone); o.start();
      });
      this.droneGain = drone;
    } catch (e) { this.ac = null; }
  },
  tone(f, d = .18, type = 'sine', v = .12, slide = 0, delay = 0) {
    if (!this.ac || !this.enabled) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + .03);
  },
  noise(d = .2, v = .15, freq = 1200, delay = 0) {
    if (!this.ac || !this.enabled) return;
    const t = this.ac.currentTime + delay;
    const len = Math.floor(this.ac.sampleRate * d);
    const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ac.createBufferSource(); src.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ac.createGain(); g.gain.value = v;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  play(name) {
    if (!this.enabled) return;
    // Combat sounds are ambient feedback, not per-unit events: keep them sparse.
    const now = performance.now();
    const gap = { sword: .42, bow: .34, hit: .65 }[name] || 0;
    if (gap && now - (this.last[name] || 0) < gap) return;
    if (gap) this.last[name] = now;
    switch (name) {
      case 'ui': this.tone(520, .05, 'sine', .035); break;
      case 'coin': this.tone(1046, .09, 'sine', .045); this.tone(1568, .12, 'sine', .03, 0, .05); break;
      case 'sword': this.noise(.08, .045, 2400); this.tone(190, .1, 'triangle', .02, -40); break;
      case 'bow': this.tone(360, .08, 'triangle', .012, -100); this.noise(.1, .012, 2800); break;
      case 'hit': this.noise(.06, .03, 1100); break;
      case 'build': this.tone(392, .09, 'triangle', .05); this.tone(523, .14, 'triangle', .045, 0, .08); break;
      case 'buildStart':
        this.noise(.07, .045, 1900);
        this.tone(330, .1, 'triangle', .04);
        this.tone(440, .16, 'triangle', .035, 0, .07);
        break;
      case 'buildCancel':
        this.tone(294, .16, 'triangle', .05, -120);
        this.noise(.12, .04, 650);
        break;
      case 'buildPlace':
        this.noise(.2, .13, 700);
        this.tone(104, .24, 'sine', .1, -24);
        this.tone(392, .28, 'triangle', .05);
        this.tone(523, .36, 'triangle', .045, 0, .08);
        this.tone(659, .48, 'triangle', .04, 0, .16);
        break;
      case 'horn':
        [196, 246.94, 293.66].forEach((f, i) => {
          this.tone(f, 1.2, 'sawtooth', .025, 0, i * .13);
          this.tone(f / 2, 1.4, 'triangle', .02, 0, i * .13);
        });
        break;
      case 'boom': this.noise(.5, .24, 500); this.tone(65, .4, 'sine', .12, -20); break;
      case 'victory':
        [392, 493.88, 587.33, 783.99].forEach((f, i) => this.tone(f, .9, 'triangle', .06, 0, i * .16));
        break;
      case 'defeat':
        [196, 174.61, 146.83, 110].forEach((f, i) => this.tone(f, 1.1, 'triangle', .055, -8, i * .2));
        break;
      case 'hornlow': this.tone(98, .5, 'triangle', .06, 0); break;
    }
  },
  ambient(dt) {
    if (!this.ac || !this.enabled || this.muted) return;
    S.ambient -= dt;
    if (S.ambient <= 0) {
      S.ambient = rnd(5, 9);
      const scale = [146.83, 174.61, 196, 220, 261.63, 293.66];
      const f = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f, rnd(1.3, 2.2), 'sine', .025);
    }
  }
};

/* ------------- unit voices ------------- */
const Voice = {
  base: 'audio/voices/',
  files: {
    select: ['select_01.wav', 'select_02.wav', 'select_03.wav'],
    move: ['move_01.wav', 'move_02.wav', 'move_03.wav'],
    attack: ['attack_01.wav', 'attack_02.wav', 'attack_03.wav'],
    hit: ['hit_01.wav', 'hit_02.wav', 'hit_03.wav']
  },
  pitch: {
    peasant: 1.12, spearman: .98, swordsman: .94, crossbowman: 1.0,
    archer: 1.04, knight: .86, hero: .78, halberdier: .9,
    priest: 1.06, assassin: .92, shaman: .88,
    ram: .72, catapult: .7, scorpion: .82
  },
  cache: {}, playing: new Set(), active: 0, last: {}, lastPick: {},
  preload() {
    for (const cat in this.files) {
      for (const file of this.files[cat]) {
        const path = this.base + cat + '/' + file;
        if (this.cache[path]) continue;
        const a = new Audio(path);
        a.preload = 'auto';
        a.load();
        this.cache[path] = a;
      }
    }
  },
  play(cat, unit, opts = {}) {
    if (!Sound.enabled || S.muted) return;
    const list = this.files[cat];
    if (!list) return;
    const now = performance.now();
    const cooldown = { hit: 2.2, attack: 4.0, move: .34, select: .3 }[cat] || .4;
    if (now - (this.last[cat] || 0) < cooldown) return;
    if (this.active >= 2) return;
    if (unit && Number.isFinite(unit.x)) {
      const sp = worldToScreen(unit.x, unit.y);
      if (sp.x < -120 || sp.x > VW + 120 || sp.y < -120 || sp.y > VH + 120) return;
      const screenDist = Math.hypot(sp.x - VW / 2, sp.y - VH / 2);
      opts.screenDist = screenDist;
    }
    this.last[cat] = now;

    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && idx === this.lastPick[cat]) idx = (idx + 1) % list.length;
    this.lastPick[cat] = idx;

    const path = this.base + cat + '/' + list[idx];
    const a = new Audio(path);
    a.preload = 'auto';
    let vol = .5;
    if (opts.screenDist != null) vol *= clamp(1.12 - opts.screenDist / Math.max(620, Math.max(VW, VH) * .82), .22, 1);
    if (unit && unit.team === ENEMY) vol *= .7;
    a.volume = clamp(vol, 0, 1);

    let rate = (this.pitch[unit?.type] || 1) * (opts.rate || 1);
    if (unit && unit.team === ENEMY) rate *= .9;
    a.playbackRate = clamp(rate, .6, 1.5);
    a.preservesPitch = false;
    if ('webkitPreservesPitch' in a) a.webkitPreservesPitch = false;

    this.active++;
    this.playing.add(a);
    const done = () => {
      this.active = Math.max(0, this.active - 1);
      this.playing.delete(a);
      a.onended = null;
      a.onerror = null;
    };
    a.onended = done;
    a.onerror = done;
    const promise = a.play();
    if (promise && promise.catch) promise.catch(err => {
      this.lastError = (err && (err.name + ': ' + err.message)) || String(err);
      done();
    });
  },
  stopAll() {
    for (const a of this.playing) {
      try { a.pause(); } catch (e) {}
    }
    this.playing.clear();
    this.active = 0;
  }
};

/* ------------- world ------------- */
let seed = seeded(1337);

function addBuilding(type, tx, ty, team) {
  const d = B[type];
  let hp = team === ENEMY ? Math.round(d.hp * (1 + ((S.enemyMods?.hp || 1) - 1) * .55)) : d.hp;
  if (team === PLAYER && ['tower', 'wall', 'ballista', 'watchtower'].includes(type)) hp = Math.round(hp * modVal('towerHpMul'));
  const b = {
    id: S.uid++, kind: 'building', type, team, tx, ty, w: d.w, d: d.d,
    x: tx + d.w / 2, y: ty + d.d / 2, hp, maxHp: hp, rally: null,
    attackCd: rnd(0, .8), healCd: rnd(0, .5), scan: 0, target: null, flash: 0, phase: rnd(0, 6),
    incomeCd: rnd(.2, 1), blessCd: rnd(.5, 1.5),
    garrison: [], garrisonCd: rnd(0, .6),
    constructed: true, progress: 1,
    dead: false
  };
  S.buildings.push(b);
  return b;
}
function addUnit(type, team, x, y) {
  const d = U[type];
  let hp = team === ENEMY ? Math.round(d.hp * (S.enemyMods?.hp || 1)) : team === ALLY ? d.hp : Math.round(d.hp * playerHpMul(type) * unitHpFactionMul(type));
  const u = {
    id: S.uid++, kind: 'unit', type, team, x, y,
    hp, maxHp: hp, order: null, target: null,
    attackCd: rnd(0, .45), attackAnim: 0, gather: null, carrying: 0,
    gatherTimer: 0, moving: false, facing: 1, flash: 0, phase: rnd(0, 9),
    cleaveCd: 0, lastHurt: -99, healTimer: rnd(0, 1.2),
    rank: 1, xp: 0, kills: 0, garrisoned: null,
    scan: 0, home: { x, y }, dead: false
  };
  S.units.push(u);
  pushOutOfBuildings(u);
  return u;
}
function addGold(tx, ty) {
  S.goldNodes.push({
    id: S.uid++, kind: 'gold', x: tx + 1, y: ty + 1, tx, ty,
    amount: 1500, max: 1500, phase: rnd(0, 9)
  });
}
function addTree(x, y, variant) {
  S.trees.push({ x, y, variant, size: rnd(.75, 1.2), phase: rnd(0, 9) });
}

/* ------------- skirmish setup ------------- */
function findKeepSpot(cx, cy) {
  for (let r = 0; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = clamp(Math.round(cx + dx - 1.5), 0, MAP - 3);
        const ty = clamp(Math.round(cy + dy - 1.5), 0, MAP - 3);
        if (canPlace('keep', tx, ty, { ignoreBuildRadius: true })) return { tx, ty };
      }
    }
  }
  return null;
}
function clearKeepArea(tx, ty) {
  const w = B.keep.w, d = B.keep.d;
  S.trees = S.trees.filter(t => !(t.x > tx - .8 && t.x < tx + w + .8 && t.y > ty - .8 && t.y < ty + d + .8));
  S.props = S.props.filter(p => !(p.x > tx - .8 && p.x < tx + w + .8 && p.y > ty - .8 && p.y < ty + d + .8));
}
function spawnSkirmishStart() {
  const cfg = S.skirmish || { gold: 2000, inf: 4, supers: true };
  const pSpot = findKeepSpot(8.5, 32.5);
  const eSpot = findKeepSpot(S.enemySite.x + 1.5, S.enemySite.y + 1.5);
  if (pSpot) { clearKeepArea(pSpot.tx, pSpot.ty); addBuilding('keep', pSpot.tx, pSpot.ty, PLAYER); }
  else addUnit('baseVehicle', PLAYER, 9.65, 36.35);
  if (eSpot) { clearKeepArea(eSpot.tx, eSpot.ty); addBuilding('keep', eSpot.tx, eSpot.ty, ENEMY); }
  else addUnit('baseVehicle', ENEMY, S.enemySite.x + 2.55, S.enemySite.y + 5.8);

  const roster = ['spearman', 'swordsman', 'archer', 'crossbowman'];
  const n = clamp(cfg.inf | 0, 0, 12);
  for (const team of [PLAYER, ENEMY]) {
    const keep = S.buildings.find(b => b.team === team && b.type === 'keep');
    const cx = keep ? keep.x : (team === PLAYER ? 9.65 : S.enemySite.x + 1.5);
    const cy = keep ? keep.y + 1.6 : (team === PLAYER ? 36.35 : S.enemySite.y + 4);
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + (team === ENEMY ? .45 : 0);
      const rr = 2.3 + (i % 2) * .8;
      const type = roster[i % roster.length];
      const u = addUnit(type, team, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      u.order = { type: 'move', x: cx + Math.cos(a) * (rr + 1.5), y: cy + Math.sin(a) * (rr + 1.5) };
    }
  }
  if (S.tutorial) {
    const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
    const cx = keep ? keep.x : 9.65, cy = keep ? keep.y : 36.35;
    for (let i = 0; i < 2; i++) addUnit('peasant', PLAYER, cx - 1.4 + i * 1.2, cy + 2.4);
    const bs = findKeepSpot(cx + 4, cy + 3);
    if (bs) {
      clearKeepArea(bs.tx, bs.ty);
      const bk = addBuilding('barracks', bs.tx, bs.ty, PLAYER);
      bk.constructed = true; bk.progress = 1;
    }
  }
  if (!S.buildings.some(b => b.type === 'keep')) {
    setTimeout(() => toast('开局落位失败，已退化为基地车开局：请先展开基地。', 'warn', 'workshop'), 1200);
  }
}

/* ===== 6. ECONOMY & BUILD ===== */
function resetWorld() {
  seed = seeded(0x51C0FFEE + S.diffKey.length * 7717 + S.campaignLevel * 104729);
  refreshUnlocked();
  S.units = []; S.buildings = []; S.goldNodes = []; S.trees = []; S.props = [];
  S.projs = []; S.particles = []; S.floats = []; S.superFx = [];
  S.selected = []; S.selectedBuilding = null; S.inspect = null;
  S.groups = {};
  Voice.stopAll();
  S.placing = null; S.drag = null; S.time = 0;
  S.gold = S.run === 'skirmish' && S.skirmish ? S.skirmish.gold : CAMPAIGN_GOLD;
  S.prod = { keep: { cur: null, queue: [] }, barracks: { cur: null, queue: [] }, workshop: { cur: null, queue: [] } };
  S.perf = { path: 0, sep: 0, pathReq: 0, pathDef: 0, pathCool: 0, pushChecks: 0, sepMs: 0, pushMs: 0, frames: 0 };
  S.crateStats = { scans: 0, dispatches: 0, aborts: 0, picksPlayer: 0, picksEnemy: 0, picksAlly: 0, picksDispatched: 0, picksFree: 0 };
  S.crateAborts = { combat: 0, gone: 0, timeout: 0 };
  S.pathBudget = 4;
  S.buildQ = { cur: null, queue: [] };
  S.tech = {}; S.superCd = 0; S.superKey = null; S.superAim = false; S.forceAim = false; S.enemySuper = null; S.radar = false;
  S.stats = { kills: 0, losses: 0, gathered: 0 };
  const L = currentLevel();
  S.faction = (S.run === 'skirmish' && S.skirmish && FACTIONS[S.skirmish.faction]) ? S.skirmish.faction : 'rose';
  S.supersEnabled = !(S.run === 'skirmish' && S.skirmish) || !!S.skirmish.supers;
  if (S.run === 'skirmish') {
    const pick = S.skirmish && S.skirmish.map;
    if (pick && pick !== 'random' && MAP_THEMES[pick]) S.mapTheme = pick;
    else {
      const themes = Object.keys(MAP_THEMES);
      S.mapTheme = themes[Math.floor(Math.random() * themes.length)];
    }
  } else {
    S.mapTheme = L.map || 'border';
  }
  // 每局从几个远处营地中抽取一个，避免黑鸦主堡永远出现在同一个角落。
  S.enemySite = ENEMY_SITES[Math.floor(Math.random() * ENEMY_SITES.length)];
  S.enemy2Site = null;
  S.secondAI = null;
  const allyChoices = ALLY_SITES.filter(s =>
    Math.hypot(s.x - S.enemySite.x, s.y - S.enemySite.y) > 13
    && Math.hypot(s.x - 7, s.y - 31) > 18);
  S.allySite = allyChoices.length
    ? allyChoices[Math.floor(Math.random() * allyChoices.length)]
    : ALLY_SITES[0];
  // After the third map, a second Black Raven commander enters the field.
  if (S.run === 'campaign' && S.campaignLevel >= 3) {
    const choices = ENEMY_SITES.filter(s =>
      Math.hypot(s.x - 7, s.y - 31) > 22
      && Math.hypot(s.x - S.enemySite.x, s.y - S.enemySite.y) > 14
      && (!S.allyEnabled || Math.hypot(s.x - S.allySite.x, s.y - S.allySite.y) > 12));
    S.enemy2Site = choices.length ? choices[Math.floor(Math.random() * choices.length)]
      : (ENEMY_SITES.find(s => Math.hypot(s.x - S.enemySite.x, s.y - S.enemySite.y) > 12) || ENEMY_SITES[0]);
    S.secondAI = { nextSpawn: 12, attackTimer: 55, baseVehicleTimer: 25, retry: 0 };
  }
  S.enemyMods = { ...L.mods };
  S.wave = { n: 0, timer: Math.max(30, DIFFS[S.diffKey].first + L.firstAdd) };
  S.enemy = { nextTrain: 12, tacticTimer: 0, baseVehicleTimer: 18, attackTimer: 40, buildRetry: 0 };
  S.enemySuper = (S.run === 'skirmish' && S.supersEnabled) ? {
    key: ['fire', 'storm', 'plague'][Math.floor(Math.random() * 3)],
    timer: 90, built: false
  } : null;
  S.allyAI = S.allyEnabled ? { timer: 5, orderTimer: 3 } : null;
  S.lastUnderAttack = -99;
  S.tour = null; S.keys = {}; S.hover = null;
  S.uid = 1;
  S.crates = []; S.crateTimer = 22 + rnd(0, 8);

  // Both sides start bare: one mobile base vehicle, no pre-built structures or army.
  const eb = S.enemySite;
  if (S.allyEnabled) {
    const ab = S.allySite;
    addBuilding('keep', ab.x, ab.y, ALLY);
    addBuilding('barracks', ab.x, ab.y + 3, ALLY);
    addBuilding('house', ab.x + 4, ab.y + 2, ALLY);
    addBuilding('tower', ab.x + 4, ab.y + 6, ALLY);
    addUnit('spearman', ALLY, ab.x + 2.2, ab.y - 1.2);
    addUnit('archer', ALLY, ab.x + 3.1, ab.y - 0.4);
    addUnit('swordsman', ALLY, ab.x - 1.4, ab.y + 2.2);
  }

  // gold veins
  const theme = MAP_THEMES[S.mapTheme] || MAP_THEMES.border;
  for (const [gx, gy] of theme.gold) addGold(gx, gy);

  generateTerrain();

  // forests and rocks
  const clusters = theme.forests;
  for (const [cx, cy, count] of clusters) {
    for (let i = 0; i < count * 4; i++) {
      const x = cx + rnd(-3.4, 3.4), y = cy + rnd(-3.4, 3.4);
      if (!inMap(x, y)) continue;
      if (Math.hypot(x - 8.5, y - 32.5) < 5.3) continue;
      if (S.allyEnabled && Math.hypot(x - (S.allySite.x + 1.5), y - (S.allySite.y + 1.5)) < 4.8) continue;
      if (Math.hypot(x - (S.enemySite.x + 1.5), y - (S.enemySite.y + 1.5)) < 6.2) continue;
      if (Math.hypot(x - 22, y - 22) < 2.3) continue;
      if (S.goldNodes.some(g => Math.hypot(x - g.x, y - g.y) < 2.1)) continue;
      if (terrainAt(x, y)) continue;
      addTree(x, y, Math.floor(seed() * 3));
    }
  }
  for (let i = 0; i < Math.floor(MAP * 2); i++) {
    const edge = Math.floor(seed() * 4);
    let x, y;
    if (edge === 0) { x = rnd(0, 5); y = rnd(0, MAP); }
    else if (edge === 1) { x = rnd(MAP - 5, MAP); y = rnd(0, MAP); }
    else if (edge === 2) { x = rnd(0, MAP); y = rnd(0, 4); }
    else { x = rnd(0, MAP); y = rnd(MAP - 4, MAP); }
    addTree(x, y, Math.floor(seed() * 3));
  }
  for (let i = 0; i < Math.floor(MAP * .85); i++) {
    const x = rnd(3, MAP - 3), y = rnd(3, MAP - 3);
    if (S.buildings.some(b => x > b.tx - 1 && x < b.tx + b.w + 1 && y > b.ty - 1 && y < b.ty + b.d + 1)) continue;
    if (S.goldNodes.some(g => Math.hypot(x - g.x, y - g.y) < 2.2)) continue;
    if (terrainAt(x, y)) continue;
    S.props.push({ kind: 'prop', type: seed() < .65 ? 'rock' : 'shrub', x, y, size: rnd(.6, 1.15) });
  }
  if (theme.ruin) {
    S.props.push({ kind: 'ruin', type: 'ruin', x: 22, y: 22, size: 1 });
    S.props.push({ kind: 'column', type: 'column', x: 20.3, y: 23.2, size: .95 });
    S.props.push({ kind: 'column', type: 'column', x: 23.7, y: 20.4, size: .8 });
  }
  if (S.mapTheme === 'highland' || S.mapTheme === 'throne') {
    for (const [x, y] of [[14.2, 25.2], [30.2, 19.2], [27.4, 28.6], [18.4, 8.2]]) {
      if (!terrainAt(x, y)) S.props.push({ kind: 'column', type: 'column', x, y, size: rnd(.72, 1.05) });
    }
  }

  // 战役：双方各只有一辆基地车；遭遇战：双方各有一座已完工主堡 + 设定数量的初始步兵。
  if (S.run === 'skirmish') {
    spawnSkirmishStart();
  } else {
    addUnit('baseVehicle', PLAYER, 9.65, 36.35);
    addUnit('baseVehicle', ENEMY, eb.x + 2.55, eb.y + 5.8);
    if (S.secondAI && S.enemy2Site) {
      const u = addUnit('baseVehicle', ENEMY, S.enemy2Site.x + 2.55, S.enemy2Site.y + 5.8);
      u.ai2 = true;
    }
  }

  paintMap();
  updateHud(true);
}
function nearestGold(u) {
  let best = null, bd = Infinity;
  for (const g of S.goldNodes) {
    if (g.amount <= 0) continue;
    const d = Math.hypot(g.x - u.x, g.y - u.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

function paintMap() {
  const c = document.createElement('canvas');
  c.width = MAP_PX_W; c.height = MAP_PX_H;
  const g = c.getContext('2d');
  const theme = MAP_THEMES[S.mapTheme] || MAP_THEMES.border;
  const greens = theme.greens;
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const p = mapPos(x, y), n = hash(x, y);
      g.fillStyle = greens[Math.floor(n * greens.length)];
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + HW + .4, p.y + HH);
      g.lineTo(p.x, p.y + TILE_H + .4);
      g.lineTo(p.x - HW - .4, p.y + HH);
      g.closePath(); g.fill();
      g.fillStyle = n > .5 ? 'rgba(255,232,160,.025)' : 'rgba(0,0,0,.03)';
      g.fill();
      const terr = terrainAt(x, y);
      if (terr === 'water') {
        g.fillStyle = theme.water;
        g.beginPath();
        g.moveTo(p.x, p.y); g.lineTo(p.x + HW + .4, p.y + HH);
        g.lineTo(p.x, p.y + TILE_H + .4); g.lineTo(p.x - HW - .4, p.y + HH);
        g.closePath(); g.fill();
        if (n > .62) {
          g.strokeStyle = 'rgba(154,211,206,.25)'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x - 11, p.y + 7); g.quadraticCurveTo(p.x, p.y + 4, p.x + 12, p.y + 8); g.stroke();
        }
      } else if (terr === 'marsh') {
        g.fillStyle = theme.marsh;
        g.beginPath();
        g.moveTo(p.x, p.y); g.lineTo(p.x + HW + .4, p.y + HH);
        g.lineTo(p.x, p.y + TILE_H + .4); g.lineTo(p.x - HW - .4, p.y + HH);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(118,130,75,.2)';
        g.beginPath(); g.ellipse(p.x + (n - .5) * 20, p.y + 8, rnd(2, 6), rnd(1, 2.5), 0, 0, 7); g.fill();
      } else if (terr === 'road') {
        g.fillStyle = theme.road;
        g.beginPath();
        g.moveTo(p.x, p.y); g.lineTo(p.x + HW + .4, p.y + HH);
        g.lineTo(p.x, p.y + TILE_H + .4); g.lineTo(p.x - HW - .4, p.y + HH);
        g.closePath(); g.fill();
      }
    }
  }
  // clearings (the old fixed enemy clearing is intentionally removed)
  const baseClearings = theme.clearings.filter(([x, y]) => !(x === 35.5 && y === 9.5));
  const clearings = S.allyEnabled ? [...baseClearings, [S.allySite.x + 1.5, S.allySite.y + 1.5, 5.4]] : baseClearings;
  for (const [x, y, r] of clearings) {
    const p = mapPos(x, y);
    const gr = g.createRadialGradient(p.x, p.y, 8, p.x, p.y, r * 58);
    gr.addColorStop(0, theme.clearing[0]);
    gr.addColorStop(.62, theme.clearing[1]);
    gr.addColorStop(1, theme.clearing[2]);
    g.save(); g.translate(p.x, p.y); g.scale(1, .5); g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, r * 58, 0, 7); g.fill(); g.restore();
  }
  // roads
  const drawRoad = (road, w, col, alpha) => {
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.globalAlpha = alpha;
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    const p0 = mapPos(road[0][0], road[0][1]); g.moveTo(p0.x, p0.y);
    for (let i = 1; i < road.length - 1; i++) {
      const p = mapPos(road[i][0], road[i][1]), n = mapPos(road[i + 1][0], road[i + 1][1]);
      g.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
    }
    const pl = mapPos(road[road.length - 1][0], road[road.length - 1][1]); g.lineTo(pl.x, pl.y);
    g.stroke(); g.restore();
  };
  for (const road of theme.roads) {
    drawRoad(road, 84, '#5a4932', .5);
    drawRoad(road, 58, '#7a6546', .65);
    drawRoad(road, 30, '#8b7650', .16);
  }

  // farm field
  if (theme.farm) {
    g.save();
    const fp = mapPos(12.2, 36.3);
    g.translate(fp.x, fp.y); g.scale(1, .5); g.rotate(-.45);
    g.fillStyle = 'rgba(108,91,55,.38)'; g.fillRect(-90, -55, 180, 110);
    g.strokeStyle = 'rgba(78,67,43,.35)'; g.lineWidth = 2;
    for (let i = -84; i < 86; i += 11) { g.beginPath(); g.moveTo(i, -55); g.lineTo(i, 55); g.stroke(); }
    g.strokeStyle = 'rgba(178,151,89,.2)';
    for (let i = -80; i < 86; i += 12) { g.beginPath(); g.moveTo(i, -55); g.lineTo(i, 55); g.stroke(); }
    g.restore();
  }

  // grass and flowers
  for (let i = 0; i < Math.floor(MAP * MAP * 1.34); i++) {
    const x = rnd(1, MAP - 1), y = rnd(1, MAP - 1);
    if (Math.hypot(x - 8.5, y - 32.5) < 2.3) continue;
    if (S.allyEnabled && Math.hypot(x - (S.allySite.x + 1.5), y - (S.allySite.y + 1.5)) < 2.2) continue;
    const p = mapPos(x, y);
    g.strokeStyle = seed() < .5 ? theme.grassA : theme.grassB;
    g.lineWidth = .8; g.beginPath(); g.moveTo(p.x, p.y);
    g.quadraticCurveTo(p.x + rnd(-2, 2), p.y - 3, p.x + rnd(-3, 3), p.y - rnd(2, 6));
    g.stroke();
    if (seed() < .055) {
      g.fillStyle = seed() < .5 ? 'rgba(211,195,135,.65)' : 'rgba(180,152,180,.5)';
      g.beginPath(); g.arc(p.x + rnd(-2, 2), p.y - 4, rnd(.6, 1.3), 0, 7); g.fill();
    }
  }
  // stones near road
  const mainRoad = theme.roads[0];
  for (let i = 0; i < 170; i++) {
    const t = seed(), idx = Math.min(mainRoad.length - 2, Math.floor(t * (mainRoad.length - 1)));
    const f = t * (mainRoad.length - 1) - idx;
    const x = lerp(mainRoad[idx][0], mainRoad[idx + 1][0], f) + rnd(-1.8, 1.8);
    const y = lerp(mainRoad[idx][1], mainRoad[idx + 1][1], f) + rnd(-1.8, 1.8);
    const p = mapPos(x, y);
    g.fillStyle = `rgba(${seed() < .5 ? '93,84,67' : '151,139,113'},${rnd(.12, .3)})`;
    g.beginPath(); g.ellipse(p.x, p.y, rnd(1, 2.9), rnd(.6, 1.4), 0, 0, 7); g.fill();
  }
  // ruined circle
  if (theme.ruin) {
    const rp = mapPos(22, 22);
    g.save(); g.translate(rp.x, rp.y); g.scale(1, .5);
    g.strokeStyle = 'rgba(171,157,126,.22)'; g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, 70, 0, 7); g.stroke();
    g.fillStyle = 'rgba(113,104,84,.14)'; g.beginPath(); g.arc(0, 0, 60, 0, 7); g.fill();
    g.restore();
  }

  S.mapCanvas = c;
  buildMiniBase();
}

function buildMiniBase() {
  const c = document.createElement('canvas');
  c.width = mini.width; c.height = mini.height;
  const g = c.getContext('2d');
  const s = Math.min(mini.width / MAP_PX_W, mini.height / MAP_PX_H) * .94;
  const w = MAP_PX_W * s, h = MAP_PX_H * s;
  const ox = (mini.width - w) / 2, oy = (mini.height - h) / 2;
  g.fillStyle = '#12170f'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(S.mapCanvas, ox, oy, w, h);
  S.miniBase = c;
  S.miniInfo = { s, ox, oy };
}

function miniPoint(x, y) {
  const m = mapPos(x, y), i = S.miniInfo;
  return { x: i.ox + m.x * i.s, y: i.oy + m.y * i.s };
}

/* ------------- camera ------------- */
function sidebarWidth() {
  const el = $('#sidebar');
  return el ? el.getBoundingClientRect().width + 36 : 340;
}
function viewCenter() {
  return { x: (VW - sidebarWidth()) / 2 + 8, y: VH / 2 + 10 };
}
function centerCamera(x, y, z = S.cam.z, instant = true) {
  S.cam.z = clamp(z, .62, 1.55);
  const p = mapPos(x, y), c = viewCenter();
  const tx = c.x - p.x * S.cam.z, ty = c.y - p.y * S.cam.z;
  if (instant) { S.cam.x = tx; S.cam.y = ty; clampCamera(); }
  else S.tour = { x: tx, y: ty, t: 0 };
}
function menuCamera() {
  const p = mapPos(MAP / 2, MAP / 2);
  S.cam.z = .74;
  S.cam.x = VW / 2 - p.x * S.cam.z;
  S.cam.y = VH / 2 - p.y * S.cam.z;
  clampCamera();
}
function clampCamera() {
  const pad = 110;
  S.cam.x = clamp(S.cam.x, pad - MAP_PX_W * S.cam.z, VW - pad);
  S.cam.y = clamp(S.cam.y, pad - MAP_PX_H * S.cam.z, VH - pad);
}
const EDGE_ZONE = 36, EDGE_MAX = 1.3;
function panBounds() {
  const b = { left: 0, top: 0, right: VW, bottom: VH };
  const top = document.getElementById('topbar');
  if (top) { const r = top.getBoundingClientRect(); if (r.height > 4) b.top = Math.max(b.top, r.bottom + 2); }
  const side = document.getElementById('sidebar');
  if (side && S.mode !== 'menu') {
    const r = side.getBoundingClientRect();
    if (r.width > 4) b.right = Math.min(b.right, r.left - 2);
  }
  const hint = document.getElementById('hintbar');
  if (hint && !hint.hidden) {
    const r = hint.getBoundingClientRect();
    if (r.height > 4) b.bottom = Math.min(b.bottom, r.top - 2);
  }
  return b;
}
function edgePan(dt) {
  if (!S.mouse.inside) return;
  const b = panBounds();
  const m = S.mouse;
  if (m.x >= b.right || m.y >= b.bottom || m.x <= b.left || m.y <= b.top) return;
  const ramp = (dist) => clamp((EDGE_ZONE - dist) / EDGE_ZONE, 0, 1);
  const fx = ramp(b.right - m.x) - ramp(m.x - b.left);
  const fy = ramp(b.bottom - m.y) - ramp(m.y - b.top);
  if (!fx && !fy) return;
  const sp = 520 * dt / S.cam.z * EDGE_MAX;
  S.cam.x -= sp * fx;
  S.cam.y -= sp * fy;
}
function updateCamera(dt) {
  if (S.mode === 'menu' || S.mode === 'ended' || S.paused) return;
  if (S.mode === 'playing') edgePan(dt);
  if (S.tour) {
    S.tour.t += dt / .65;
    const t = Math.min(1, S.tour.t), e = 1 - Math.pow(1 - t, 3);
    S.cam.x = lerp(S.cam.x, S.tour.x, e * .12);
    S.cam.y = lerp(S.cam.y, S.tour.y, e * .12);
    if (t >= 1) S.tour = null;
  }
  const sp = 520 * dt / S.cam.z;
  if (S.keys.w || S.keys.arrowup) S.cam.y += sp;
  if (S.keys.s || S.keys.arrowdown) S.cam.y -= sp;
  if (S.keys.a || S.keys.arrowleft) S.cam.x += sp;
  if (S.keys.d || S.keys.arrowright) S.cam.x -= sp;
  clampCamera();
}

/* ------------- effects ------------- */
function particle(wx, wy, opt) {
  const p = mapPos(wx, wy);
  S.particles.push({
    x: p.x + (opt.dx || 0), y: p.y + (opt.dy || 0),
    vx: opt.vx || 0, vy: opt.vy || 0, z: opt.z || 0, vz: opt.vz || 0,
    g: opt.g || 0, life: opt.life || .6, max: opt.life || .6,
    size: opt.size || 2, color: opt.color || '#fff', type: opt.type || 'dot',
    grow: opt.grow || 0, text: opt.text || ''
  });
}
function burst(wx, wy, type, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(8, 55);
    if (type === 'blood') particle(wx, wy, { vx: Math.cos(a) * s, vy: Math.sin(a) * s * .5, z: rnd(8, 25), vz: rnd(5, 20), g: 65, life: rnd(.3, .7), size: rnd(.8, 2.2), color: Math.random() < .5 ? '#8d312a' : '#b34b38', type: 'blood' });
    else if (type === 'gold') particle(wx, wy, { vx: rnd(-20, 20), vy: rnd(-14, 8), z: rnd(8, 30), vz: rnd(8, 30), g: 60, life: rnd(.4, .9), size: rnd(1, 2.5), color: Math.random() < .5 ? '#f4d37b' : '#c99a44', type: 'chip' });
    else if (type === 'dust') particle(wx, wy, { vx: rnd(-24, 24), vy: rnd(-10, 10), z: rnd(0, 10), vz: rnd(2, 14), g: 10, life: rnd(.5, 1.1), size: rnd(3, 7), color: 'rgba(170,152,116,.26)', type: 'smoke', grow: 13 });
    else if (type === 'fire') particle(wx, wy, { vx: rnd(-12, 12), vy: rnd(-18, -4), z: rnd(10, 40), vz: rnd(10, 30), g: -4, life: rnd(.3, .7), size: rnd(2, 5), color: Math.random() < .5 ? '#eb8b36' : '#e1b654', type: 'fire' });
    else if (type === 'spark') particle(wx, wy, { vx: rnd(-30, 30), vy: rnd(-26, 12), z: rnd(8, 30), vz: rnd(10, 35), g: 80, life: rnd(.16, .4), size: rnd(.8, 2), color: Math.random() < .5 ? '#ffe6a0' : '#e7b960', type: 'spark' });
    else if (type === 'rubble') particle(wx, wy, { vx: rnd(-30, 30), vy: rnd(-20, 15), z: rnd(5, 35), vz: rnd(20, 60), g: 100, life: rnd(.5, 1.1), size: rnd(1.5, 4), color: Math.random() < .5 ? '#877b65' : '#5e584a', type: 'chip' });
  }
}
function floatText(wx, wy, text, color) {
  const p = mapPos(wx, wy);
  S.floats.push({ x: p.x, y: p.y - 24, text, color: color || '#e8cc90', life: 1.25 });
}
function updateParticles(dt) {
  for (const p of S.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vz -= p.g * dt; p.z += p.vz * dt;
    if (p.type === 'smoke') { p.size += p.grow * dt; p.vx *= .98; p.vy *= .98; }
  }
  S.particles = S.particles.filter(p => p.life > 0);
  for (const f of S.floats) { f.life -= dt; f.y -= 16 * dt; }
  S.floats = S.floats.filter(f => f.life > 0);
}

/* ------------- gathering ------------- */
function assignGather(u, node) {
  if (!u || !node || u.team !== PLAYER) return;
  u.order = { type: 'gather', node };
  u.gather = node; u.target = null; u.carrying = 0; u.gatherTimer = 0;
}
function nearestDropoff(u) {
  let best = null, bd = Infinity;
  for (const b of S.buildings) {
    if (b.team !== PLAYER || !B[b.type].dropoff || b.constructed === false) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
function updateGather(u, dt) {
  let node = u.gather;
  if (!node || node.amount <= 0) {
    node = nearestGold(u);
    if (!node) { u.order = null; u.gather = null; return; }
    u.gather = node;
  }
  if (u.carrying >= 10) {
    const drop = nearestDropoff(u);
    if (!drop) return;
    const p = approachPoint(u, drop, 1.15);
    if (Math.hypot(p.x - u.x, p.y - u.y) < 1.35) {
      const gain = Math.round(u.carrying * (1 + (S.tech.logistics ? .2 : 0)));
      const gGain = Math.round(gain * gatherFactionMul());
  S.gold += gGain; S.stats.gathered += gGain;
      floatText(drop.x, drop.y, `+${gain}`, '#f4d37b');
      u.carrying = 0; Sound.play('coin'); updateHud(true);
    } else {
      moveTowards(u, p.x, p.y, dt, .02);
    }
    return;
  }
  if (Math.hypot(node.x - u.x, node.y - u.y) < 1.55) {
    u.moving = false; u.gatherTimer += dt;
    if (u.gatherTimer >= 1.7) {
      u.gatherTimer = 0;
      const take = Math.min(10 - u.carrying, node.amount);
      node.amount -= take; u.carrying = take;
      burst(node.x, node.y, 'gold', 4); Sound.play('coin');
      if (node.amount <= 0) {
        S.goldNodes = S.goldNodes.filter(g => g !== node);
        u.gather = nearestGold(u);
      }
    }
  } else {
    moveTowards(u, node.x, node.y, dt, .05);
  }
}

/* ------------- movement & combat ------------- */
function unitRadius(u) {
  if (!u) return .2;
  if (u.type === 'baseVehicle') return .62;
  if (u.type === 'hero' || u.type === 'knight') return .3;
  if (u.type === 'ram' || u.type === 'catapult' || u.type === 'scorpion') return .34;
  return .21;
}
function blockedAt(x, y, u = null) {
  if (terrainAt(x, y) === 'water') return true;
  const r = u ? unitRadius(u) : 0;
  for (const b of S.buildings) {
    if (x > b.tx - .24 - r && x < b.tx + b.w + .24 + r
      && y > b.ty - .24 - r && y < b.ty + b.d + .24 + r) return true;
  }
  return false;
}
function pushOutOfBuildings(u) {
  if (u.garrisoned) return;
  const r = unitRadius(u) + .08;
  for (const b of S.buildings) {
    S.perf.pushChecks++;
    const x1 = b.tx - r, x2 = b.tx + b.w + r, y1 = b.ty - r, y2 = b.ty + b.d + r;
    if (u.x <= x1 || u.x >= x2 || u.y <= y1 || u.y >= y2) continue;
    const d1 = u.x - x1, d2 = x2 - u.x, d3 = u.y - y1, d4 = y2 - u.y;
    const m = Math.min(d1, d2, d3, d4);
    if (m === d1) u.x = x1; else if (m === d2) u.x = x2;
    else if (m === d3) u.y = y1; else u.y = y2;
  }
}
/* ===== 4. PATHFINDING ===== */
function walkBlocked(tx, ty, r) {
  const x = tx + .5, y = ty + .5;
  if (terrainAt(x, y) === 'water') return true;
  for (const b of S.buildings) {
    if (x > b.tx - .24 - r && x < b.tx + b.w + .24 + r
      && y > b.ty - .24 - r && y < b.ty + b.d + .24 + r) return true;
  }
  return false;
}
function segBlocked(ax, ay, bx, by, r) {
  const d = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(d / .3));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (walkBlocked(Math.floor(ax + (bx - ax) * t), Math.floor(ay + (by - ay) * t), r)) return true;
  }
  return false;
}
function lineBlocked(u, tx, ty) {
  const d = Math.hypot(tx - u.x, ty - u.y);
  if (d < .15) return false;
  const steps = Math.ceil(d / .35);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blockedAt(u.x + (tx - u.x) * t, u.y + (ty - u.y) * t, u)) return true;
  }
  return false;
}
// 网格 A*：绕开建筑与水面。失败返回 null，调用方回退到直线移动。
function findPath(sx, sy, tx, ty, r) {
  const W = MAP, N = W * W;
  const blocked = new Uint8Array(N);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) if (walkBlocked(x, y, r)) blocked[y * W + x] = 1;
  }
  const svx = clamp(Math.floor(sx), 0, W - 1), svy = clamp(Math.floor(sy), 0, W - 1);
  const s = svy * W + svx;
  let gx = clamp(Math.floor(tx), 0, W - 1), gy = clamp(Math.floor(ty), 0, W - 1);
  if (blocked[gy * W + gx]) {
    let best = -1, bd = Infinity;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        if (blocked[y * W + x]) continue;
        const dd = Math.hypot(x - gx, y - gy);
        if (dd < bd) { bd = dd; best = y * W + x; }
      }
    }
    if (best < 0) return null;
    gx = best % W; gy = (best / W) | 0;
  }
  const goal = gy * W + gx;
  if (s === goal) return [{ x: tx, y: ty }];

  const gScore = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [];
  const push = (i, fv) => {
    open.push([fv, i]);
    let k = open.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (open[p][0] <= open[k][0]) break;
      const t = open[p]; open[p] = open[k]; open[k] = t; k = p;
    }
  };
  const pop = () => {
    const top = open[0], last = open.pop();
    if (open.length) {
      open[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, rr = l + 1;
        let m = k;
        if (l < open.length && open[l][0] < open[m][0]) m = l;
        if (rr < open.length && open[rr][0] < open[m][0]) m = rr;
        if (m === k) break;
        const t = open[m]; open[m] = open[k]; open[k] = t; k = m;
      }
    }
    return top[1];
  };
  gScore[s] = 0;
  push(s, 0);
  let iter = 0;
  while (open.length && iter < 4000) {
    iter++;
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const ni = ny * W + nx;
        if (blocked[ni] || closed[ni]) continue;
        if (dx && dy && (blocked[cy * W + nx] || blocked[ny * W + cx])) continue;
        const ng = gScore[cur] + (dx && dy ? 1.4142 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          from[ni] = cur;
          push(ni, ng + Math.hypot(nx - gx, ny - gy));
        }
      }
    }
  }
  if (from[goal] < 0) return null;
  const pts = [];
  let n = goal, guard = 0;
  while (n !== s && n >= 0 && guard++ < 4000) {
    pts.push({ x: (n % W) + .5, y: ((n / W) | 0) + .5 });
    n = from[n];
  }
  if (!pts.length) return [{ x: tx, y: ty }];
  pts.reverse();
  // 拉直：能直视的中间点全部跳过
  const out = [];
  let curX = sx, curY = sy, i = 0;
  while (i < pts.length - 1) {
    let k = pts.length - 1;
    while (k > i && segBlocked(curX, curY, pts[k].x, pts[k].y, r)) k--;
    out.push(pts[k]);
    curX = pts[k].x; curY = pts[k].y;
    if (k >= pts.length - 1) break;
    i = k + 1;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  out[out.length - 1] = { x: tx, y: ty };
  return out;
}
function separateUnits() {
  const list = S.units.filter(u => u.hp > 0 && !u.garrisoned && u.type !== 'baseVehicle');
  const CELL = 2, grid = new Map();
  for (const u of list) {
    const k = ((u.x / CELL) | 0) + ',' + ((u.y / CELL) | 0);
    let cell = grid.get(k);
    if (!cell) { cell = []; grid.set(k, cell); }
    cell.push(u);
  }
  const offsets = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1]];
  for (const [key, cell] of grid) {
    const parts = key.split(',');
    const cx = +parts[0], cy = +parts[1];
    for (const [ox, oy] of offsets) {
      const same = ox === 0 && oy === 0;
      const other = same ? cell : grid.get((cx + ox) + ',' + (cy + oy));
      if (!other) continue;
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        for (let j = same ? i + 1 : 0; j < other.length; j++) {
          const b = other[j];
          S.perf.sep++;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = unitRadius(a) + unitRadius(b);
          if (d >= min) continue;
          if (d < .0001) { a.x -= .02; b.x += .02; continue; }
          const push = (min - d) * .55;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }
  for (const u of list) {
    u.x = clamp(u.x, .3, MAP - .3); u.y = clamp(u.y, .3, MAP - .3);
    pushOutOfBuildings(u);
  }
}
function moveTowards(u, tx, ty, dt, stop = 0) {
  if (!u.pathGoal || Math.hypot(tx - u.pathGoal.x, ty - u.pathGoal.y) > 1.2) {
    u.path = null; u.pathGoal = null; u.pathRepath = 0; u.stuck = 0;
  }
  let gx = tx, gy = ty;
  if (u.path && u.path.length) {
    while (u.path.length > 1 && Math.hypot(u.x - u.path[0].x, u.y - u.path[0].y) < .5) u.path.shift();
    gx = u.path[0].x; gy = u.path[0].y;
  } else if (!u.path) {
    if (S.time < (u.pathRetryAt || 0)) {
      // 重算冷却中：这一帧不做直线检测，直接沿旧方向走
      S.perf.pathCool++;
    } else if (lineBlocked(u, tx, ty)) {
      S.perf.pathReq++;
      if (S.pathBudget > 0) {
        S.pathBudget--;
        S.perf.path++;
        const p = findPath(u.x, u.y, tx, ty, unitRadius(u));
        if (p && p.length) {
          u.path = p; u.pathGoal = { x: tx, y: ty };
          gx = p[0].x; gy = p[0].y;
        } else {
          u.pathRetryAt = S.time + .4;
        }
      } else {
        S.perf.pathDef++;
        u.pathRetryAt = S.time + .4;
      }
    }
  }
  const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy);
  const terr = terrainAt(u.x, u.y);
  const terrainSpeed = terr === 'marsh' ? .62 : terr === 'road' ? 1.25 : 1;
  const step = d > .0001 ? Math.min(d, U[u.type].speed * terrainSpeed * (u.slowT > 0 ? .55 : 1) * (u.buffSpd || 1)
    * (u.team === ENEMY ? (S.enemyMods?.speed || 1) : (u.team === PLAYER ? techSpeedMul(u) * unitSpeedFactionMul(u.type) : 1)) * dt) : 0;
  let moved = false;
  if (step > .0001) {
    const nx = u.x + dx / d * step, ny = u.y + dy / d * step;
    if (!blockedAt(nx, ny, u)) { u.x = nx; u.y = ny; moved = true; }
    else if (!blockedAt(nx, u.y, u)) { u.x = nx; moved = true; }
    else if (!blockedAt(u.x, ny, u)) { u.y = ny; moved = true; }
  }
  if (!moved) {
    u.stuck = (u.stuck || 0) + 1;
    if (u.stuck > 2 && (u.pathRepath || 0) < 6) {
      u.path = null; u.pathGoal = null;
      u.pathRepath = (u.pathRepath || 0) + 1;
      u.stuck = 0;
    }
  } else {
    u.stuck = 0;
    if (Math.abs(dx - dy) > .01) u.facing = (dx - dy) >= 0 ? 1 : -1;
  }
  u.x = clamp(u.x, .3, MAP - .3);
  u.y = clamp(u.y, .3, MAP - .3);
  u.moving = moved;
  if (u.path && u.path.length === 1 && Math.hypot(u.x - u.path[0].x, u.y - u.path[0].y) < .45) u.path = null;
  if (Math.hypot(tx - u.x, ty - u.y) <= Math.max(stop, .05) + .05) {
    u.path = null; u.pathGoal = null; u.moving = false;
    return true;
  }
  return false;
}
function approachPoint(u, target, pad = .8) {
  if (target.kind === 'building') {
    const cx = clamp(u.x, target.tx, target.tx + target.w);
    const cy = clamp(u.y, target.ty, target.ty + target.d);
    let dx = u.x - cx, dy = u.y - cy;
    if (dx === 0 && dy === 0) { dx = u.x - target.x; dy = u.y - target.y; }
    const d = Math.hypot(dx, dy) || 1;
    return { x: cx + dx / d * pad, y: cy + dy / d * pad };
  }
  return { x: target.x, y: target.y };
}
function distanceTo(u, target) {
  if (target.kind === 'building') {
    const cx = clamp(u.x, target.tx, target.tx + target.w);
    const cy = clamp(u.y, target.ty, target.ty + target.d);
    return Math.hypot(u.x - cx, u.y - cy);
  }
  return Math.hypot(u.x - target.x, u.y - target.y);
}
function findEnemyNear(u, radius) {
  let best = null, bd = Infinity;
  for (const e of S.units) {
    if (isFriendlyTeam(e.team, u.team) || e.hp <= 0 || e.garrisoned) continue;
    if (u.team !== ENEMY && !isVisibleToPlayer(e.x, e.y)) continue;
    const d = Math.hypot(e.x - u.x, e.y - u.y);
    if (d < bd && d <= radius) { bd = d; best = e; }
  }
  if (best) return best;
  for (const b of S.buildings) {
    if (isFriendlyTeam(b.team, u.team) || b.hp <= 0) continue;
    if (u.team !== ENEMY && !isVisibleToPlayer(b.x, b.y)) continue;
    const d = distanceTo(u, b);
    if (d < bd && d <= radius + .5) { bd = d; best = b; }
  }
  return best;
}
function targetPriority(target) {
  if (target.kind === 'building') {
    if (target.type === 'keep') return 52;
    if (target.type === 'barracks' || target.type === 'workshop') return 44;
    if (target.type === 'tower' || target.type === 'ballista') return 16;
    if (target.type === 'farm') return 22;
    return 32;
  }
  if (target.type === 'peasant') return 58;
  if (target.type === 'hero') return 54;
  if (target.type === 'ram' || target.type === 'catapult' || target.type === 'scorpion') return 40;
  if (target.type === 'shaman' || target.type === 'priest') return 36;
  if (target.type === 'archer' || target.type === 'crossbowman') return 28;
  if (target.type === 'knight') return 20;
  return 24;
}
function findSmartTarget(u, radius) {
  let best = null, bestScore = -Infinity;
  const consider = (e, d) => {
    if (e.hp <= 0 || e.garrisoned || isFriendlyTeam(e.team, u.team)) return;
    if (u.team !== ENEMY && !isVisibleToPlayer(e.x, e.y)) return;
    if (d > radius) return;
    const lowHp = e.maxHp ? clamp((e.maxHp - e.hp) / e.maxHp, 0, 1) * 12 : 0;
    const score = targetPriority(e) + lowHp - d * 2.2;
    if (score > bestScore) { bestScore = score; best = e; }
  };
  for (const e of S.units) consider(e, Math.hypot(e.x - u.x, e.y - u.y));
  for (const b of S.buildings) consider(b, distanceTo(u, b));
  return best;
}
function orderMove(u, x, y) {
  u.order = { type: 'move', x, y }; u.target = null; u.gather = null; u.crateRun = null;
}
function orderAttack(u, target) {
  u.order = { type: 'attack', target }; u.target = target; u.gather = null; u.crateRun = null;
}
/* ===== 5. COMBAT ===== */
function damageLayers(type, targetType) {
  const base = U[type] ? U[type].dmg : 0;
  const bonus = UNIT_BONUS[type] || {};
  let bMul = 1;
  if (bonus.vsCavalry && CAVALRY_TYPES.has(targetType)) bMul *= bonus.vsCavalry;
  const fMul = unitDmgFactionMul(type);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { base, unitBonus: r3(bMul), factionMul: r3(fMul), total: r3(base * bMul * fMul) };
}
function faceUnit(u, target) {
  const p1 = mapPos(u.x, u.y), p2 = mapPos(target.x, target.y);
  if (Math.abs(p2.x - p1.x) > .01) u.facing = p2.x >= p1.x ? 1 : -1;
}
function shoot(u, target, dmg, team) {
  let power = (dmg || U[u.type].dmg) * (team === ENEMY ? (S.enemyMods?.dmg || 1) : 1) * (u.buffDmg || 1);
  const bonus = UNIT_BONUS[u.type] || {};
  if (target.kind === 'building' && bonus.vsBuilding) power *= bonus.vsBuilding;
  if (target.kind === 'unit' && bonus.vsUnit) power *= bonus.vsUnit;
  if (team === PLAYER) power *= techDmgMul(u) * unitDmgFactionMul(u.type);
  if (u.type === 'catapult') {
    spawnBoulder(u.x, u.y, U[u.type].h * .72, target, power, team, u);
    Sound.play('boom');
    return;
  }
  if (u.type === 'shaman' || u.type === 'priest') spawnBolt(u.x, u.y, U[u.type].h * .65, target, power, team, u.type === 'priest', u);
  else spawnArrow(u.x, u.y, u.kind === 'building' ? B[u.type].h * .7 : U[u.type].h * .65, target, power, team, u);
  Sound.play('bow');
}
function heroCleave(u, target) {
  const radius = 2.1;
  burst(target.x, target.y, 'dust', 16);
  burst(target.x, target.y, 'spark', 12);
  floatText(target.x, target.y - .7, '裂地斩', '#ffd77a');
  for (const e of [...S.units]) {
    if (isFriendlyTeam(e.team, u.team) || e.hp <= 0 || e === target) continue;
    if (Math.hypot(e.x - target.x, e.y - target.y) > radius) continue;
    damage(e, U.hero.dmg * .62 * (u.team === PLAYER ? techDmgMul(u) : 1), u);
  }
  Sound.play('boom');
}
function engage(u, target, dt) {
  if (!target || target.hp <= 0) { u.target = null; return; }
  const range = (u.militiaT > 0 ? MILITIA.range : U[u.type].range) + (u.team === PLAYER ? unitRangeFactionAdd(u.type) : 0) + (target.kind === 'building' ? .8 : 0);
  const d = distanceTo(u, target);
  faceUnit(u, target);
  if (d <= range) {
    u.moving = false;
    if (u.attackCd <= 0) {
      u.attackCd = u.militiaT > 0 ? 1.1 : U[u.type].cd;
      u.attackAnim = .32;
      if (u.type === 'archer' || u.type === 'crossbowman' || u.type === 'scorpion' || u.type === 'catapult' || u.type === 'priest' || u.type === 'shaman' || u.type === 'tower' || u.type === 'keep') shoot(u, target, U[u.type] ? U[u.type].dmg : B[u.type].attack.dmg, u.team);
      else {
        const mBonus = UNIT_BONUS[u.type] || {};
        let mul = 1;
        if (mBonus.vsCavalry && target.kind === 'unit' && CAVALRY_TYPES.has(target.type)) mul *= mBonus.vsCavalry;
        if (target.kind === 'building' && mBonus.vsBuilding) mul *= mBonus.vsBuilding;
        if (u.team === PLAYER) mul *= techDmgMul(u) * unitDmgFactionMul(u.type);
        damage(target, (u.militiaT > 0 ? MILITIA.dmg : U[u.type].dmg) * mul * (u.team === ENEMY ? (S.enemyMods?.dmg || 1) : 1), u);
        if (u.type === 'hero' && u.cleaveCd <= 0) {
          u.cleaveCd = U.hero.cleaveEvery || 8;
          heroCleave(u, target);
        }
        Sound.play('sword');
      }
      Voice.play('attack', u);
    }
  } else {
    const p = approachPoint(u, target, U[u.type].range > 2 ? U[u.type].range * .8 : 1.0);
    moveTowards(u, p.x, p.y, dt, .02);
  }
}
function updateUnit(u, dt) {
  u.attackCd -= dt;  u.flash = Math.max(0, u.flash - dt);
  if (u.militiaT > 0) {
    u.militiaT -= dt;
    if (u.militiaT <= 0) revertMilitia(u);
  }
  if (u.buffT > 0) {
    u.buffT -= dt;
    if (u.buffT <= 0) { u.buffT = 0; u.buffSpd = 1; u.buffDmg = 1; }
  }
  u.attackAnim = Math.max(0, u.attackAnim - dt);
  u.scan -= dt;
  u.moving = false;
  if (u.hp <= 0 || u.garrisoned) return;
  if (u.stunT > 0) { u.stunT -= dt; u.moving = false; return; }
  if (u.slowT > 0) u.slowT -= dt;
  if (u.type === 'hero') {
    if (u.cleaveCd > 0) u.cleaveCd -= dt;
    if (S.time - u.lastHurt > 5 && u.hp < u.maxHp) {
      u.hp = Math.min(u.maxHp, u.hp + 7 * dt);
      if (Math.random() < dt * 3) particle(u.x + rnd(-.3, .3), u.y, { vx: rnd(-3, 3), vy: rnd(-5, -1), z: rnd(10, 28), vz: rnd(6, 14), g: -2, life: rnd(.4, .8), size: rnd(.8, 1.6), color: '#9fe0b8', type: 'spark' });
    }
  }
  if (u.type === 'shaman' || u.type === 'priest') {
    u.healTimer -= dt;
    if (u.healTimer <= 0) {
      u.healTimer = 1.4;
      const holy = u.type === 'priest';
      for (const e of S.units) {
        if (e.team !== u.team || e.hp <= 0 || e.hp >= e.maxHp) continue;
        if (Math.hypot(e.x - u.x, e.y - u.y) > 4.2) continue;
        e.hp = Math.min(e.maxHp, e.hp + 8);
        particle(e.x, e.y, { vx: rnd(-4, 4), vy: rnd(-7, -1), z: rnd(10, 28), vz: rnd(6, 16), g: -2, life: rnd(.4, .8), size: rnd(1, 2), color: holy ? '#ffe3a0' : '#9ee5a8', type: 'spark' });
      }
    }
  }

  if (u.order && u.order.type === 'gather' && u.team === PLAYER) {
    updateGather(u, dt);
    return;
  }
  if (u.order && u.order.type === 'attack') {
    if (!u.target || u.target.hp <= 0) { u.order = null; u.target = null; }
    else { engage(u, u.target, dt); return; }
  }
  if (u.order && u.order.type === 'attackMove') {
    if (u.target && u.target.hp > 0) { engage(u, u.target, dt); return; }
    u.target = null;
    if (u.scan <= 0) {
      u.scan = .35;
      const found = findEnemyNear(u, 6.2);
      if (found) { u.target = found; return; }
    }
    const done = moveTowards(u, u.order.x, u.order.y, dt, .05);
    if (done) {
      u.order = null;
      const found = findEnemyNear(u, 7);
      if (found) u.target = found;
    }
    return;
  }
  if (u.order && u.order.type === 'move') {
    if (u.target && u.target.hp > 0) { engage(u, u.target, dt); return; }
    if (u.crateRun) {
      // 箱子没了（被捡/到期）、超时没走到、或进入交火距离：立刻放弃拾箱
      if (!S.crates.includes(u.crateRun)) {
        u.crateRun = null; u.order = null;
        S.crateStats.aborts++; S.crateAborts.gone++;
        return;
      }
      if (u.crateRunT != null && S.time - u.crateRunT > (u.crateRunLimit || 20)) {
        u.crateRun = null; u.order = null;
        S.crateStats.aborts++; S.crateAborts.timeout++;
        return;
      }
      if (u.team === ENEMY && u.scan <= 0) {
        u.scan = .35;
        // 交火距离 = 武器射程 + 1.2 格（不是 aggro、也不是视野）
        const foe = findSmartTarget(u, (U[u.type].range || 1) + 1.2);
        if (foe) {
          u.crateRun = null; u.order = null; u.target = foe;
          S.crateStats.aborts++; S.crateAborts.combat++;
          return;
        }
      }
    }
    const done = moveTowards(u, u.order.x, u.order.y, dt, .04);
    if (done) { u.order = null; u.crateRun = null; }
    return;
  }
  // idle
  if (u.target && u.target.hp > 0) { engage(u, u.target, dt); return; }
  u.target = null;
  if (u.team === PLAYER || u.team === ENEMY || u.team === ALLY) {
    if (u.scan <= 0) {
      u.scan = .55;
      const found = u.team === ENEMY || u.team === ALLY
        ? findSmartTarget(u, U[u.type].aggro || 0)
        : findEnemyNear(u, U[u.type].aggro || 0);
      if (found) { u.target = found; return; }
    }
  }
}
function solveOverlap() {
  const arr = S.units;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].garrisoned) continue;
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[j].garrisoned) continue;
      const a = arr[i], b = arr[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const min = .54;
      if (d > .001 && d < min) {
        const push = (min - d) * .5;
        a.x -= dx / d * push; a.y -= dy / d * push;
        b.x += dx / d * push; b.y += dy / d * push;
      }
    }
  }
}
function gainXp(u, amount) {
  if (!u || u.team !== PLAYER || u.rank >= 3 || u.hp <= 0) return;
  u.xp += amount;
  const need = u.rank === 1 ? 100 : 260;
  if (u.xp < need) return;
  u.xp -= need;
  u.rank++;
  const oldMax = u.maxHp;
  u.maxHp = Math.round(u.maxHp * 1.15);
  u.hp += u.maxHp - oldMax;
  floatText(u.x, u.y, `晋升 · ${RANKS[u.rank]}`, '#ffd77a');
  burst(u.x, u.y, 'spark', 14);
  Sound.play(u.rank === 3 ? 'horn' : 'ui');
}
function damage(target, amount, source) {
  if (!target || target.hp <= 0 || target.garrisoned) return;
  target.hp -= amount;
  target.flash = .14;
  target.lastHurt = S.time;
  if (target.kind === 'unit' && amount > 0 && Math.random() < .34) Voice.play('hit', target);
  const p = mapPos(target.x, target.y);
  burst(target.x, target.y, 'spark', 4);
  if (target === undefined) return;
  if (target.team === PLAYER) {
    if (S.time - S.lastUnderAttack > 8) {
      S.lastUnderAttack = S.time;
      toast(target.kind === 'building' ? `${bname(target)}正遭受攻击！` : '我军正遭受攻击！', 'warn', 'shield');
    }
  }
  if (target.hp <= 0) {
    if (source && source.kind === 'unit' && source.team === PLAYER && target.team === ENEMY) {
      source.kills = (source.kills || 0) + 1;
      gainXp(source, Math.max(10, Math.round((target.maxHp || 100) * .35)));
    }
    kill(target);
  }
  else if (target.kind === 'building' && target.hp < target.maxHp * .45 && Math.random() < .12) burst(target.x, target.y, 'fire', 2);
}
function playerHasBase() {
  return S.buildings.some(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0)
    || S.units.some(u => u.team === PLAYER && u.type === 'baseVehicle' && u.hp > 0);
}
function playerHasKeep() {
  return S.buildings.some(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0);
}
function playerHasBuilding(type) {
  return S.buildings.some(b => b.team === PLAYER && b.type === type && b.hp > 0 && b.constructed !== false);
}
function buildingTier(type) { return BUILD_TIER[type] || 1; }
function tierRequirement(type) {
  const tier = buildingTier(type);
  return tier <= 1 ? null : (TIER_REQ[tier] || null);
}
function buildingTierUnlocked(type) {
  const req = tierRequirement(type);
  return !req || playerHasBuilding(req);
}
function techBuildingKey(t) {
  return (t && (t.building || t.superBuilding)) || null;
}
function techBuildingReady(t) {
  const key = techBuildingKey(t);
  return !key || playerHasBuilding(key);
}
function selectedSuper() {
  return S.superKey ? SUPERS[S.superKey] : null;
}
function enemyHasKeep() {
  return S.buildings.some(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0);
}
function enemyHasBase() {
  return enemyHasKeep() || S.units.some(u => u.team === ENEMY && u.type === 'baseVehicle' && u.hp > 0);
}
function kill(target) {
  if (target.dead) return;
  target.dead = true;
  if (target.kind === 'unit') {
    S.units = S.units.filter(u => u !== target);
    if (target.team === PLAYER) S.stats.losses++;
    else if (target.team === ENEMY) S.stats.kills++;
    burst(target.x, target.y, 'blood', 12);
    burst(target.x, target.y, 'dust', 4);
    S.selected = S.selected.filter(u => u !== target);
    if (target.team === PLAYER && target.type === 'baseVehicle' && !playerHasBase()) endGame(false);
    if (target.team === ENEMY && target.type === 'baseVehicle' && !enemyHasBase()) endGame(true);
  } else {
    S.buildings = S.buildings.filter(b => b !== target);
    if (S.selectedBuilding === target) S.selectedBuilding = null;
    if (S.inspect === target) S.inspect = null;
    for (const u of S.units.filter(x => x.garrisoned === target.id)) {
      u.garrisoned = null;
      kill(u);
    }
    burst(target.x, target.y, 'rubble', 22);
    burst(target.x, target.y, 'fire', 12);
    S.props.push({ kind: 'rubble', type: 'rubble', x: target.x, y: target.y, size: 1, w: target.w, d: target.d });
    Sound.play('boom');
    if (target.team === ENEMY) floatText(target.x, target.y, '建筑被摧毁', '#e1b654');
    if (target.type === 'keep') {
      if (target.team === PLAYER && !playerHasBase()) endGame(false);
      else if (target.team === ENEMY && !enemyHasBase()) endGame(true);
      return;
    }
    if (target.team === PLAYER) toast(`${bname(target)}被摧毁！`, 'warn', 'castle');
    if (target.team === PLAYER && !playerHasBase()) endGame(false);
  }
  updateHud(true);
}

/* ------------- projectiles & buildings ------------- */
function spawnArrow(sx, sy, sz, target, dmg, team, source = null) {
  S.projs.push({
    sx, sy, sz, target, dmg, team, source, t: 0,
    dur: clamp(Math.hypot(target.x - sx, target.y - sy) * .06, .28, .7),
    tx: target.x, ty: target.y, arc: 34
  });
}
function spawnBolt(sx, sy, sz, target, dmg, team, holy = false, source = null) {
  S.projs.push({
    sx, sy, sz, target, dmg, team, source, t: 0, magic: true, holy,
    dur: clamp(Math.hypot(target.x - sx, target.y - sy) * .07, .32, .78),
    tx: target.x, ty: target.y, arc: 22
  });
}
function spawnBoulder(sx, sy, sz, target, dmg, team, source = null) {
  S.projs.push({
    sx, sy, sz, target, dmg, team, source, t: 0, boulder: true, splash: 1.9,
    dur: clamp(Math.hypot(target.x - sx, target.y - sy) * .085, .55, 1.15),
    tx: target.x, ty: target.y, arc: 78
  });
}
function updateProjectiles(dt) {
  for (const p of S.projs) {
    p.t += dt / p.dur;
    if (p.target && p.target.hp > 0) { p.tx = p.target.x; p.ty = p.target.y; }
    if (p.t >= 1) {
      p.done = true;
      if (p.target && p.target.hp > 0) {
        damage(p.target, p.dmg, p.source);
        if (!p.boulder) Sound.play('hit');
      }
      if (p.splash) {
        for (const e of [...S.units]) {
          if (isFriendlyTeam(e.team, p.team) || e === p.target || e.hp <= 0) continue;
          if (Math.hypot(e.x - p.tx, e.y - p.ty) > p.splash) continue;
          damage(e, p.dmg * .55, p.source);
        }
        burst(p.tx, p.ty, 'dust', 18);
        Sound.play('boom');
      } else burst(p.tx, p.ty, 'spark', 3);
    }
  }
  S.projs = S.projs.filter(p => !p.done);
}
function updateBuildings(dt) {
  for (const b of S.buildings) {
    b.flash = Math.max(0, b.flash - dt);
    if (b.constructed === false) {
      const total = BUILD_TIME[b.type] || 4;
      b.progress = Math.min(1, (b.progress || 0) + dt / total);
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * .85 * dt / total);
      if (b.progress >= 1) {
        b.constructed = true;
        b.progress = 1;
        if (b.team === PLAYER) {
          floatText(b.x, b.y, '建造完成', '#f0d18a');
          toast(`${bname(b)}建造完成`, '', 'castle');
          Sound.play('buildPlace');
        }
        updateHud(true);
      }
      continue;
    }
    const heal = B[b.type].heal;
    if (heal) {
      b.healCd -= dt;
      if (b.healCd <= 0) {
        b.healCd = heal.cd;
        for (const u of S.units) {
          if (u.team !== b.team || u.hp <= 0 || u.hp >= u.maxHp) continue;
          if (Math.hypot(u.x - b.x, u.y - b.y) > heal.range) continue;
          u.hp = Math.min(u.maxHp, u.hp + heal.amount);
          particle(u.x, u.y, { vx: rnd(-4, 4), vy: rnd(-8, -2), z: rnd(8, 24), vz: rnd(8, 18), g: -2, life: rnd(.4, .8), size: rnd(1, 2), color: '#8fd6ae', type: 'spark' });
        }
      }
    }
    if (B[b.type].income && b.team === PLAYER) {
      b.incomeCd -= dt;
      if (b.incomeCd <= 0) {
        b.incomeCd = B[b.type].income.cd;
        S.gold += B[b.type].income.amount;
        floatText(b.x, b.y - .8, `+${B[b.type].income.amount} 金币`, '#e8c86a');
        updateHud(true);
      }
    }
    if (B[b.type].bless && b.team === PLAYER) {
      b.blessCd -= dt;
      if (b.blessCd <= 0) {
        b.blessCd = B[b.type].bless.cd;
        for (const u of S.units) {
          if (u.team !== PLAYER || u.hp <= 0 || u.hp >= u.maxHp) continue;
          u.hp = Math.min(u.maxHp, u.hp + B[b.type].bless.amount);
          particle(u.x, u.y, { vx: rnd(-4, 4), vy: rnd(-8, -2), z: rnd(10, 28), vz: rnd(8, 18), g: -2, life: rnd(.4, .8), size: rnd(1, 2), color: '#ffe3a0', type: 'spark' });
        }
      }
    }
    if (b.garrison && b.garrison.length) {
      b.garrisonCd -= dt;
      if (b.garrisonCd <= 0) {
        const shooters = b.garrison.filter(u => u.type === 'archer' || u.type === 'crossbowman' || u.type === 'priest');
        if (shooters.length) {
          let target = null, bd = Infinity;
          for (const e of S.units) {
            if (isFriendlyTeam(e.team, b.team) || e.hp <= 0 || e.garrisoned) continue;
            if (b.team !== ENEMY && !isVisibleToPlayer(e.x, e.y)) continue;
            const d = Math.hypot(e.x - b.x, e.y - b.y);
            if (d <= 6 && d < bd) { bd = d; target = e; }
          }
          if (target) {
            b.garrisonCd = 1.6;
            spawnArrow(b.x, b.y, B[b.type].h * .62, target, 5 + shooters.length * 3, PLAYER, shooters[0]);
            Sound.play('bow');
          } else b.garrisonCd = .25;
        }
      }
    }
    if (!B[b.type].attack) continue;
    b.attackCd -= dt; b.scan -= dt;
    if (b.scan <= 0) {
      b.scan = .4;
      b.target = null;
      let bd = Infinity;
      for (const u of S.units) {
        if (isFriendlyTeam(u.team, b.team) || u.hp <= 0 || u.garrisoned) continue;
        if (b.team !== ENEMY && !isVisibleToPlayer(u.x, u.y)) continue;
        const d = distanceTo(u, b);
        if (d <= B[b.type].attack.range && d < bd) { bd = d; b.target = u; }
      }
    }
    if (b.target && b.target.hp > 0 && b.attackCd <= 0 && distanceTo(b.target, b) <= B[b.type].attack.range) {
      b.attackCd = B[b.type].attack.cd;
      spawnArrow(b.x, b.y, B[b.type].h * .72, b.target, B[b.type].attack.dmg * (b.team === ENEMY ? (S.enemyMods?.dmg || 1) : 1), b.team);
      Sound.play('bow');
    }
  }
}

/* ------------- production ------------- */
function producerFor(type) {
  const need = U[type].producer;
  return S.buildings.find(b => b.team === PLAYER && b.type === need && b.constructed !== false) || null;
}
function spawnPointFor(b) {
  const p = { x: b.x + rnd(-.7, .7), y: b.ty + b.d + .95 };
  return p;
}
function prodReservedPop(cat) {
  const line = S.prod[cat];
  if (!line) return 0;
  let pop = 0;
  if (line.cur) pop += U[line.cur.type].pop;
  for (const it of line.queue) pop += U[it.type].pop;
  return pop;
}
function heroInProduction() {
  for (const cat of ['keep', 'barracks', 'workshop']) {
    const line = S.prod[cat];
    if (!line) continue;
    if (line.cur && line.cur.type === 'hero') return true;
    if (line.queue.some(it => it.type === 'hero')) return true;
  }
  return false;
}
function tryTrain(type, n = 1) {
  if (S.mode !== 'playing' || S.paused || S.ended) return 0;
  const def = U[type];
  const cat = def.producer;
  const line = S.prod[cat];
  if (!line) return 0;
  const pro = producerFor(type);
  if (!pro) { toast(`需要先建造${B[cat].name}`, 'warn', 'castle'); Sound.play('ui'); return 0; }
  if (def.req && !playerHasBuilding(def.req)) {
    toast(`需要先建成「${B[def.req].name}」才能受封英雄`, 'warn', 'castle');
    Sound.play('ui');
    return 0;
  }
  const cap = 12;
  const cost = unitCostFaction(type);
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (line.queue.length + (line.cur ? 1 : 0) >= cap) break;
    if (def.hero && (heroAlive() || heroInProduction())) break;
    if (S.gold < cost) break;
    if (popUsed() + prodReservedPop(cat) + def.pop > popCap()) break;
    S.gold -= cost;
    line.queue.push({ type, elapsed: 0, total: trainSecondsFaction(type), producer: pro.id });
    added++;
  }
  if (!added) {
    if (line.queue.length + (line.cur ? 1 : 0) >= cap) toast('该产线已排满，等待出兵后再排', 'warn', 'sword');
    else if (def.hero && (heroAlive() || heroInProduction())) toast('英雄已在场或正在受封', 'warn', 'hero');
    else if (S.gold < def.cost) toast('金币不足', 'warn', 'coin');
    else toast('人口已满，请建造农舍', 'warn', 'house');
    Sound.play('ui');
    return 0;
  }
  if (!line.cur) line.cur = line.queue.shift();
  if (added < n) toast(`只排入 ${added} 个 ${def.name}（金币/人口/队列限制）`, 'warn', 'sword');
  else if (added > 1) toast(`已排队 ${added} 个 ${def.name}`, '', 'sword');
  Sound.play('ui');
  updateHud(true); renderQueue(); updateCards();
  return added;
}
function updateTraining(dt) {
  let changed = false;
  for (const cat of ['keep', 'barracks', 'workshop']) {
    const line = S.prod[cat];
    if (!line || !line.cur) continue;
    line.cur.elapsed += dt * trainingSpeedFor(cat);
    if (line.cur.elapsed < line.cur.total) continue;
    const t = line.cur;
    line.cur = null;
    let b = S.buildings.find(x => x.id === t.producer && x.team === PLAYER);
    if (!b) b = producerFor(t.type) || S.buildings.find(x => x.team === PLAYER && x.type === 'keep');
    if (b) {
      const p = spawnPointFor(b);
      const u = addUnit(t.type, PLAYER, p.x, p.y);
      u.home = { x: p.x, y: p.y };
      if (b.rally) orderMove(u, b.rally.x + rnd(-.8, .8), b.rally.y + rnd(-.8, .8));
      if (t.type === 'hero') {
        u.lastHurt = S.time;
        floatText(p.x, p.y, '狮心英雄', '#ffd77a');
        toast('狮心英雄响应号召，加入战场！', '', 'hero');
        Sound.play('horn');
      } else {
        floatText(p.x, p.y, U[t.type].name, '#ecd28b');
        Sound.play('build');
      }
    }
    if (line.queue.length) line.cur = line.queue.shift();
    changed = true;
  }
  if (changed) { updateHud(true); renderQueue(); updateCards(); }
}

/* ------------- building placement ------------- */
function militiaCount() {
  return S.units.filter(u => u.team === PLAYER && u.militiaT > 0).length;
}
function tryMilitia() {
  if (S.mode !== 'playing' || S.paused) return;
  if (S.selectedBuilding) return;
  const peasants = S.selected.filter(u => u.type === 'peasant' && u.team === PLAYER && u.hp > 0 && !u.garrisoned && !(u.militiaT > 0));
  if (!peasants.length) { toast('选中农民后按 V 征召民兵', 'warn', 'peasant'); Sound.play('ui'); return; }
  let room = MILITIA.max - militiaCount();
  if (room <= 0) { toast('同时最多征召 ' + MILITIA.max + ' 个民兵', 'warn', 'sword'); Sound.play('ui'); return; }
  let made = 0;
  for (const u of peasants) {
    if (room <= 0) break;
    u.militiaT = MILITIA.time;
    u.militiaOldMax = u.maxHp;
    u.maxHp = MILITIA.hp;
    u.hp = MILITIA.hp;
    u.gatherOrder = (u.order && u.order.type === 'gather') ? u.order : null;
    u.order = null; u.target = null; u.gather = null;
    made++; room--;
  }
  if (made) {
    toast(made + ' 名农民临时征召为民兵（' + MILITIA.time + ' 秒后复原，期间不产金）', 'warn', 'sword');
    Sound.play('horn');
  }
}
function revertMilitia(u) {
  u.militiaT = 0;
  const oldMax = u.militiaOldMax || U.peasant.hp;
  u.maxHp = oldMax;
  u.hp = Math.min(u.hp, oldMax);
  u.militiaOldMax = 0;
  if (u.gatherOrder) { u.order = u.gatherOrder; u.gatherOrder = null; }
}
function queueBuilding(type) {
  if (S.mode !== 'playing' || S.paused) return;
  if (isSuperKey(type) && !factionSuperMatch(type)) {
    toast(`本阵营不能建造该超级武器建筑（${factionOf().name} 专属：${SUPERS[factionOf().super].name}）`, 'warn', 'castle');
    Sound.play('ui');
    return;
  }
  const q = S.buildQ;
  if (q.cur && q.cur.ready && q.cur.type === type) { startPlacement(type); return; }
  if (!playerHasKeep()) {
    toast('请先展开基地车，建立主堡后才能建造建筑', 'warn', 'workshop');
    Sound.play('ui');
    return;
  }
  if (!buildingTierUnlocked(type)) {
    const req = tierRequirement(type);
    toast(`需要先建造 T${buildingTier(type) - 1}「${B[req].name}」`, 'warn', 'wall');
    Sound.play('ui');
    return;
  }
  if (q.queue.length + (q.cur ? 1 : 0) >= 9) { toast('建造队列已满，等前面几座完工', 'warn', 'wall'); Sound.play('ui'); return; }
  const def = B[type];
  const bCost = buildingCostFaction(type);
  if (S.gold < bCost) { toast('金币不足', 'warn', 'coin'); Sound.play('ui'); return; }
  S.gold -= bCost;
  const item = { type, elapsed: 0, total: buildSecondsFaction(type), ready: false };
  if (!q.cur) q.cur = item; else q.queue.push(item);
  toast(`${def.name}进入建造队列 · ${item.total} 秒`, '', 'wall');
  Sound.play('buildStart');
  updateHud(true); renderQueue(); updateCards();
}
function cancelBuild(type) {
  if (S.mode !== 'playing' || S.paused) return false;
  const q = S.buildQ;
  if (!q || !B[type]) return false;
  const cost = B[type].cost;
  if (q.cur && q.cur.type === type) {
    S.gold += cost;
    q.cur = q.queue.length ? q.queue.shift() : null;
    toast(`${B[type].name}已取消建造，退回 ${cost} 金币`, '', 'coin');
    Sound.play('ui');
    updateHud(true); renderQueue(); updateCards();
    return true;
  }
  const idx = q.queue.findIndex(it => it.type === type);
  if (idx >= 0) {
    S.gold += cost;
    q.queue.splice(idx, 1);
    toast(`${B[type].name}已移出建造队列，退回 ${cost} 金币`, '', 'coin');
    Sound.play('ui');
    updateHud(true); renderQueue(); updateCards();
    return true;
  }
  return false;
}
function cancelTrain(type) {
  if (S.mode !== 'playing' || S.paused) return false;
  const def = U[type];
  if (!def) return false;
  const line = S.prod[def.producer];
  if (!line) return false;
  const cost = def.cost;
  if (line.cur && line.cur.type === type) {
    S.gold += cost;
    line.cur = line.queue.length ? line.queue.shift() : null;
    toast(`${def.name}已取消训练，退回 ${cost} 金币`, '', 'coin');
    Sound.play('ui'); updateHud(true); renderQueue(); updateCards();
    return true;
  }
  const idx = line.queue.findIndex(it => it.type === type);
  if (idx >= 0) {
    S.gold += cost;
    line.queue.splice(idx, 1);
    toast(`${def.name}已移出训练队列，退回 ${cost} 金币`, '', 'coin');
    Sound.play('ui'); updateHud(true); renderQueue(); updateCards();
    return true;
  }
  return false;
}
function updateConstruction(dt) {
  const q = S.buildQ;
  if (!q || !q.cur || q.cur.ready) return;
  q.cur.elapsed += dt;
  if (q.cur.elapsed < q.cur.total) return;
  q.cur.elapsed = q.cur.total;
  q.cur.ready = true;
  toast(`${B[q.cur.type].name}建造完成 · 点击卡片放置`, '', 'castle');
  Sound.play('buildPlace');
  renderQueue(); updateCards();
}
function startPlacement(type) {
  if (S.mode !== 'playing' || S.paused) return;
  const q = S.buildQ.cur;
  if (!q || q.type !== type || !q.ready) {
    toast('该建筑尚未就绪：先排队，等施工完成后再点卡片放置', 'warn', 'wall');
    Sound.play('ui');
    return;
  }
  if (!playerHasKeep()) {
    toast('请先展开基地车，建立主堡后才能建造建筑', 'warn', 'workshop');
    Sound.play('ui');
    return;
  }
  if (!buildingTierUnlocked(type)) {
    const req = tierRequirement(type);
    toast(`需要先建造 T${buildingTier(type) - 1}「${B[req].name}」`, 'warn', 'wall');
    Sound.play('ui');
    return;
  }
  S.placing = { type, tx: 0, ty: 0, valid: false };
  hideTooltip();
  $('#placement-hint').hidden = false;
  canvas.style.cursor = 'crosshair';
  Sound.play('buildStart');
  updateCards();
}
function withinBuildRadius(type, tx, ty) {
  const d = B[type];
  const cx = tx + d.w / 2, cy = ty + d.d / 2;
  return S.buildings.some(b => b.team === PLAYER && b.constructed !== false && b.hp > 0
    && Math.hypot(b.x - cx, b.y - cy) <= BUILD_RADIUS + Math.max(b.w, b.d) * .25);
}
function canPlace(type, tx, ty, opts = {}) {
  const d = B[type];
  if (tx < 0 || ty < 0 || tx + d.w > MAP || ty + d.d > MAP) return false;
  if (!opts.ignoreBuildRadius && !playerHasKeep()) return false;
  if (!opts.ignoreBuildRadius && B[type] && !buildingTierUnlocked(type)) return false;
  for (const b of S.buildings) {
    if (tx < b.tx + b.w && tx + d.w > b.tx && ty < b.ty + b.d && ty + d.d > b.ty) return false;
  }
  for (const g of S.goldNodes) {
    if (tx < g.tx + 2 && tx + d.w > g.tx && ty < g.ty + 2 && ty + d.d > g.ty) return false;
  }
  for (let y = ty; y < ty + d.d; y++) {
    for (let x = tx; x < tx + d.w; x++) {
      if (terrainAt(x, y)) return false;
    }
  }
  if (!opts.ignoreBuildRadius && !withinBuildRadius(type, tx, ty)) return false;
  return true;
}
function placeBuilding() {
  if (!S.placing) return;
  const { type, tx, ty, valid } = S.placing;
  if (!valid) {
    if (!playerHasKeep()) toast('请先展开基地车，建立主堡后才能建造建筑', 'warn', 'workshop');
    else if (B[type] && !buildingTierUnlocked(type)) {
      const req = tierRequirement(type);
      toast(`需要先建造 T${buildingTier(type) - 1}「${B[req].name}」`, 'warn', 'wall');
    }
    else toast(withinBuildRadius(type, tx, ty) ? '此处无法建造' : '必须在己方建筑附近建造', 'warn', 'wall');
    Sound.play('ui');
    return;
  }
  const def = B[type];
  S.trees = S.trees.filter(t => !(t.x > tx - .8 && t.x < tx + def.w + .8 && t.y > ty - .8 && t.y < ty + def.d + .8));
  S.props = S.props.filter(p => !(p.x > tx - .8 && p.x < tx + def.w + .8 && p.y > ty - .8 && p.y < ty + def.d + .8));
  const b = addBuilding(type, tx, ty, PLAYER);
  b.constructed = true;
  b.progress = 1;
  burst(b.x, b.y, 'dust', 16);
  Sound.play('buildPlace');
  floatText(b.x, b.y, `${def.name}落成`, '#e8cf94');
  toast(`${def.name}建造完成`, '', 'castle');
  cancelPlacement(true);
  if (S.buildQ.cur) S.buildQ.cur = null;
  if (S.buildQ.queue.length) S.buildQ.cur = S.buildQ.queue.shift();
  updateHud(true); updateCards(); renderQueue();
}
function deployBaseVehicle(u) {
  if (!u || u.type !== 'baseVehicle' || u.team !== PLAYER || u.hp <= 0 || u.garrisoned) return;
  let spot = null;
  for (let r = 0; r <= 8 && !spot; r++) {
    for (let dy = -r; dy <= r && !spot; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const tx = clamp(Math.round(u.x + dx - 1.5), 0, MAP - 3);
        const ty = clamp(Math.round(u.y + dy - 1.5), 0, MAP - 3);
        if (canPlace('keep', tx, ty, { ignoreBuildRadius: true })) { spot = { tx, ty }; break; }
      }
    }
  }
  if (!spot) {
    toast('周围没有足够的 3×3 空地：基地车需要避开矿脉、水面和建筑', 'warn', 'workshop');
    Sound.play('ui');
    return;
  }
  const { tx, ty } = spot;
  const def = B.keep;
  S.trees = S.trees.filter(t => !(t.x > tx - .8 && t.x < tx + def.w + .8 && t.y > ty - .8 && t.y < ty + def.d + .8));
  S.props = S.props.filter(p => !(p.x > tx - .8 && p.x < tx + def.w + .8 && p.y > ty - .8 && p.y < ty + def.d + .8));
  S.units = S.units.filter(x => x !== u);
  S.selected = S.selected.filter(x => x !== u);
  const b = addBuilding('keep', tx, ty, PLAYER);
  b.constructed = true;
  b.progress = 1;
  burst(b.x, b.y, 'dust', 22);
  burst(b.x, b.y, 'gold', 8);
  floatText(b.x, b.y, '基地展开', '#f0d18a');
  S.selectedBuilding = b;
  S.inspect = null;
  Sound.play('buildPlace');
  toast('基地车已展开为一座新的赤蔷薇主堡！', '', 'castle');
  updateHud(true); updateCards(); updateSelectionPanel(true);
}
function cancelPlacement(silent = false) {
  const wasPlacing = !!S.placing;
  S.placing = null;
  if (wasPlacing && !silent) Sound.play('buildCancel');
  $('#placement-hint').hidden = true;
  canvas.style.cursor = 'default';
  updateCards();
}

/* ------------- AI & waves ------------- */
function enemyUnits() { return S.units.filter(u => u.team === ENEMY); }
function pickEnemyType(roll) {
  const lvl = S.campaignLevel;
  if (S.run === 'skirmish' && roll < .12) return 'dog';
  if (S.run === 'skirmish' && roll < .22) return 'lancer';
  if (lvl >= 2 && roll < .14) return 'shaman';
  if (lvl >= 1 && roll < .32) return 'assassin';
  if (lvl >= 3 && roll < .42) return 'knight';
  if (roll < .68) return 'swordsman';
  if (roll < .89) return 'archer';
  return 'knight';
}
function launchWave() {
  if (S.tutorial) return;
  if (S.mode !== 'playing') return;
  const diff = DIFFS[S.diffKey];
  const L = currentLevel();
  const keep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep');
  if (!keep) { S.wave.timer = 3; return; }
  S.wave.n++;
  const desired = diff.base + Math.floor(S.wave.n * diff.grow) + (L.extra || 0);
  const barracks = S.buildings.find(b => b.team === ENEMY && b.type === 'barracks');
  const waveUnits = [];
  for (let i = 0; i < desired; i++) {
    const roll = seed();
    const type = pickEnemyType(roll);
    const base = barracks || keep;
    const p = spawnPointFor(base);
    waveUnits.push(addUnit(type, ENEMY, p.x + rnd(-1.1, 1.1), p.y + rnd(-.6, .6)));
  }
  const pk = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
  if (pk) {
    for (const u of waveUnits) {
      u.order = { type: 'attackMove', x: pk.x, y: pk.y };
      u.target = null;
    }
  }
  showBanner(S.wave.n);
  Sound.play('horn');
  toast(`黑鸦第 ${S.wave.n} 波攻势：${desired} 名敌军离开要塞`, 'warn', 'shield');
  S.wave.timer = Math.max(26, diff.every + (L.everyAdd || 0) - S.wave.n * 1.5);
}
/* ===== 7. AI ===== */
function updateAI(dt) {
  if (S.tutorial) return;
  const diff = DIFFS[S.diffKey];
  const L = currentLevel();
  S.enemy.buildRetry -= dt;
  if (S.enemy.buildRetry <= 0) {
    S.enemy.buildRetry = 5;
    tryBuildEnemyBarracks();
  }
  S.enemy.nextTrain -= dt;
  if (S.enemy.nextTrain <= 0) {
    S.enemy.nextTrain = diff.train * (L.trainMul || 1) * rnd(.85, 1.2);
    if (enemyUnits().length < diff.max + (L.extra || 0)) {
      const base = S.buildings.find(b => b.team === ENEMY && b.type === 'barracks');
      if (base) {
        const type = pickEnemyType(Math.random());
        const p = spawnPointFor(base);
        const u = addUnit(type, ENEMY, p.x + rnd(-.8, .8), p.y);
        u.order = { type: 'move', x: base.x + rnd(-2, 2), y: base.y + rnd(1.5, 3) };
      }
    }
  }
  S.enemy.tacticTimer -= dt;
  if (S.enemy.tacticTimer <= 0) {
    S.enemy.tacticTimer = Math.max(.8, 1.5 - S.campaignLevel * .1);
    updateEnemyTactics();
  }
  if (S.enemy.baseVehicleTimer > 0) {
    S.enemy.baseVehicleTimer -= dt;
    if (S.enemy.baseVehicleTimer <= 0) {
      const bv = S.units.find(u => u.team === ENEMY && u.type === 'baseVehicle' && u.hp > 0 && !u.garrisoned && !u.ai2);
      if (bv && !deployEnemyBaseVehicle(bv)) S.enemy.baseVehicleTimer = 8;
    }
  }
  S.enemy.attackTimer -= dt;
  if (S.enemy.attackTimer <= 0) enemyAssault();
  updateEnemySuper(dt);
  updateSecondAI(dt);
}
function enemyAssault() {
  if (S.tutorial) return;
  const diff = DIFFS[S.diffKey];
  const target = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0)
    || S.units.find(u => u.team === PLAYER && u.hp > 0 && !u.garrisoned);
  if (!target) { S.enemy.attackTimer = 8; return; }
  const army = S.units.filter(u => u.team === ENEMY && u.hp > 0 && !u.garrisoned
    && u.type !== 'baseVehicle' && !u.ai2);
  const need = Math.max(3, Math.min(9, 3 + S.campaignLevel));
  if (army.length < need) { S.enemy.attackTimer = 6; return; }
  for (const u of army) {
    u.order = { type: 'attackMove', x: target.x + rnd(-2.2, 2.2), y: target.y + rnd(-2.2, 2.2) };
    u.target = null;
  }
  S.enemy.attackTimer = Math.max(14, diff.every * .55) + rnd(0, 7);
  toast('黑鸦军团开始自由出击', 'warn', 'shield');
  Sound.play('hornlow');
}
function updateEnemySuper(dt) {
  if (S.tutorial) return;
  if (!S.supersEnabled) return;
  if (!S.enemySuper) return;
  const sup = SUPERS[S.enemySuper.key];
  if (!sup) return;
  const building = S.buildings.find(b => b.team === ENEMY && b.type === sup.building && b.hp > 0 && !b.dead);
  if (building) S.enemySuper.built = true;
  if (!S.enemySuper.built) {
    S.enemySuper.retry = (S.enemySuper.retry || 0) - dt;
    if (S.enemySuper.retry <= 0) {
      S.enemySuper.retry = 5;
      tryBuildEnemySuperBuilding();
    }
    return;
  }
  if (!building) {
    // 超武建筑被拆掉后，黑鸦必须重新建造才能再次使用。
    S.enemySuper.built = false;
    S.enemySuper.timer = 90;
    S.enemySuper.retry = 8;
    return;
  }
  S.enemySuper.timer -= dt;
  if (S.enemySuper.timer <= 0) castEnemySuper();
}
function tryBuildEnemyBarracks() {
  if (S.buildings.some(b => b.team === ENEMY && b.type === 'barracks' && b.hp > 0 && !b.dead)) return true;
  const keep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0 && !b.dead);
  if (!keep) return false;
  for (let r = 3; r <= 10; r++) {
    for (let a = 0; a < 16; a++) {
      const tx = clamp(Math.round(keep.x + Math.cos(a * Math.PI / 8) * r - 1), 0, MAP - 2);
      const ty = clamp(Math.round(keep.y + Math.sin(a * Math.PI / 8) * r - 1), 0, MAP - 2);
      if (!canPlace('barracks', tx, ty, { ignoreBuildRadius: true })) continue;
      const b = addBuilding('barracks', tx, ty, ENEMY);
      b.constructed = true; b.progress = 1;
      burst(b.x, b.y, 'dust', 14);
      return true;
    }
  }
  return false;
}
function tryBuildEnemySuperBuilding() {
  if (S.run !== 'skirmish') return false;
  if (!S.supersEnabled) return false;
  if (!S.enemySuper || S.enemySuper.built) return false;
  const sup = SUPERS[S.enemySuper.key];
  if (!sup) return false;
  const type = sup.building;
  if (S.buildings.some(b => b.team === ENEMY && b.type === type && b.hp > 0 && !b.dead)) {
    S.enemySuper.built = true;
    return true;
  }
  const anchor = S.buildings.find(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0);
  if (!anchor) return false;
  for (let r = 3; r <= 10; r++) {
    for (let a = 0; a < 16; a++) {
      const tx = clamp(Math.round(anchor.x + Math.cos(a * Math.PI / 8) * r - 1), 0, MAP - 2);
      const ty = clamp(Math.round(anchor.y + Math.sin(a * Math.PI / 8) * r - 1), 0, MAP - 2);
      if (!canPlace(type, tx, ty, { ignoreBuildRadius: true })) continue;
      const b = addBuilding(type, tx, ty, ENEMY);
      b.constructed = true; b.progress = 1;
      burst(b.x, b.y, 'dust', 14);
      S.enemySuper.built = true;
      S.enemySuper.timer = 45;
      return true;
    }
  }
  return false;
}
function castEnemySuper() {
  const sup = SUPERS[S.enemySuper?.key];
  if (!sup) return;
  const target = enemySuperTarget();
  if (!target) { S.enemySuper.timer = 15; return; }
  const hits = applySuperAt(S.enemySuper.key, target.x, target.y, ENEMY);
  toast(`黑鸦发动「${sup.name}」！${hits ? `命中 ${hits} 个目标` : '落点偏移'}`, 'warn', sup.icon);
  floatText(target.x, target.y - 1, `黑鸦 · ${sup.name}`, '#ff9b8a');
  Sound.play('hornlow'); Sound.play('boom');
  S.enemySuper.timer = sup.cd + 25;
}
function enemySuperTarget() {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0 && !b.dead);
  if (keep) return keep;
  const army = S.units.filter(u => u.team === PLAYER && u.hp > 0 && !u.garrisoned);
  if (army.length) {
    return {
      x: army.reduce((n, u) => n + u.x, 0) / army.length,
      y: army.reduce((n, u) => n + u.y, 0) / army.length
    };
  }
  return S.units.find(u => u.team === PLAYER && u.hp > 0) || null;
}
function updateEnemyTactics() {
  const keep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0);
  if (!keep) return;
  const threats = S.units.filter(u => u.team === PLAYER && u.hp > 0 && !u.garrisoned
    && Math.hypot(u.x - keep.x, u.y - keep.y) < 13);
  for (const u of S.units) {
    if (u.team !== ENEMY || u.hp <= 0 || u.garrisoned || u.type === 'baseVehicle' || u.ai2) continue;
    const dKeep = Math.hypot(u.x - keep.x, u.y - keep.y);
    // 残血部队回主堡和箭塔下，而不是继续送死。
    if (u.hp < u.maxHp * .32 && dKeep > 5) {
      u.order = { type: 'move', x: keep.x, y: keep.y + 2 };
      u.target = null;
      continue;
    }
    // 主堡被围攻时，附近部队优先回防，并集火最脆弱/最有价值的目标。
    if (threats.length && dKeep < 15) {
      const threat = findSmartTarget(u, 12);
      if (threat) { orderAttack(u, threat); continue; }
    }
    // 空闲部队不再只打最近的敌人，而是优先集火农民、攻城车和远程单位。
    if (!u.target && !u.order) {
      const target = findSmartTarget(u, 9);
      if (target) orderAttack(u, target);
    }
  }
}
function allyBase() {
  return S.buildings.find(b => b.team === ALLY && b.type === 'keep')
    || S.buildings.find(b => b.team === ALLY && b.type === 'barracks');
}
function deploySecondBaseVehicle(u) {
  if (!u || !u.ai2 || u.team !== ENEMY || u.type !== 'baseVehicle' || u.hp <= 0) return false;
  if (S.buildings.some(b => b.team === ENEMY && b.type === 'keep' && b.ai2 && b.hp > 0)) return false;
  for (let r = 3; r <= 11; r++) {
    for (let a = 0; a < 16; a++) {
      const tx = clamp(Math.round(u.x + Math.cos(a * Math.PI / 8) * r - 1.5), 0, MAP - 3);
      const ty = clamp(Math.round(u.y + Math.sin(a * Math.PI / 8) * r - 1.5), 0, MAP - 3);
      if (!canPlace('keep', tx, ty, { ignoreBuildRadius: true })) continue;
      S.units = S.units.filter(x => x !== u);
      const b = addBuilding('keep', tx, ty, ENEMY);
      b.constructed = true; b.progress = 1; b.ai2 = true;
      burst(b.x, b.y, 'dust', 22);
      return true;
    }
  }
  return false;
}
function updateSecondAI(dt) {
  if (S.tutorial) return;
  if (!S.secondAI) return;
  if (S.secondAI.baseVehicleTimer > 0) {
    S.secondAI.baseVehicleTimer -= dt;
    if (S.secondAI.baseVehicleTimer <= 0) {
      const bv = S.units.find(u => u.ai2 && u.team === ENEMY && u.type === 'baseVehicle' && u.hp > 0);
      if (bv && !deploySecondBaseVehicle(bv)) S.secondAI.baseVehicleTimer = 8;
    }
  }
  const keep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep' && b.ai2 && b.hp > 0);
  if (!keep) return;
  S.secondAI.nextSpawn -= dt;
  if (S.secondAI.nextSpawn <= 0) {
    S.secondAI.nextSpawn = Math.max(14, 22 - S.campaignLevel * 1.5);
    const pool = S.campaignLevel >= 4
      ? ['swordsman', 'archer', 'crossbowman', 'knight']
      : ['spearman', 'swordsman', 'archer'];
    const count = 2 + Math.min(2, Math.floor(S.campaignLevel / 3));
    for (let i = 0; i < count; i++) {
      const p = spawnPointFor(keep);
      const u = addUnit(pool[Math.floor(Math.random() * pool.length)], ENEMY, p.x + rnd(-1, 1), p.y + rnd(-.5, .5));
      u.ai2 = true;
      u.order = { type: 'move', x: keep.x + rnd(-2.5, 2.5), y: keep.y + rnd(2, 4) };
    }
    floatText(keep.x, keep.y - 1, '第二军团集结', '#d7a0ff');
  }
  S.secondAI.attackTimer -= dt;
  if (S.secondAI.attackTimer > 0) return;
  const army = S.units.filter(u => u.team === ENEMY && u.ai2 && u.hp > 0 && !u.garrisoned && u.type !== 'baseVehicle');
  const target = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0)
    || S.units.find(u => u.team === PLAYER && u.hp > 0 && !u.garrisoned);
  if (!target || army.length < 3) { S.secondAI.attackTimer = 10; return; }
  for (const u of army) {
    u.order = { type: 'attackMove', x: target.x + rnd(-2, 2), y: target.y + rnd(-2, 2) };
    u.target = null;
  }
  S.secondAI.attackTimer = 24;
  toast('第二支黑鸦军团发起进攻', 'warn', 'shield');
  Sound.play('hornlow');
}
function deployEnemyBaseVehicle(u) {
  if (!u || u.team !== ENEMY || u.type !== 'baseVehicle' || u.hp <= 0) return false;
  const keep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep' && b.hp > 0);
  // 开局没有主堡时，基地车就是黑鸦的临时基地，直接原地找空地展开。
  const anchor = keep || u;
  if (keep && S.units.some(p => p.team === PLAYER && p.hp > 0 && !p.garrisoned
    && Math.hypot(p.x - keep.x, p.y - keep.y) < 12)) return false;
  for (let r = 3; r <= 11; r++) {
    for (let a = 0; a < 16; a++) {
      const tx = clamp(Math.round(anchor.x + Math.cos(a * Math.PI / 8) * r - 1.5), 0, MAP - 3);
      const ty = clamp(Math.round(anchor.y + Math.sin(a * Math.PI / 8) * r - 1.5), 0, MAP - 3);
      if (!canPlace('keep', tx, ty, { ignoreBuildRadius: true })) continue;
      S.units = S.units.filter(x => x !== u);
      const b = addBuilding('keep', tx, ty, ENEMY);
      b.constructed = true; b.progress = 1;
      burst(b.x, b.y, 'dust', 20);
      tryBuildEnemyBarracks();
      tryBuildEnemySuperBuilding();
      return true;
    }
  }
  return false;
}
function updateAllyAI(dt) {
  if (S.tutorial) return;
  if (!S.allyEnabled || !S.allyAI) return;
  const base = allyBase();
  if (!base) return;
  S.allyAI.timer -= dt;
  if (S.allyAI.timer <= 0) {
    S.allyAI.timer = Math.max(7, 12 - S.campaignLevel * .7);
    const army = S.units.filter(u => u.team === ALLY && u.type !== 'peasant' && u.hp > 0);
    if (army.length < 10 + S.campaignLevel * 2) {
      const pool = S.campaignLevel >= 2
        ? ['swordsman', 'archer', 'crossbowman', 'knight']
        : ['spearman', 'swordsman', 'archer'];
      const type = pool[Math.floor(Math.random() * pool.length)];
      const p = spawnPointFor(base);
      const u = addUnit(type, ALLY, p.x + rnd(-.8, .8), p.y);
      u.order = { type: 'move', x: base.x + rnd(-2.5, 2.5), y: base.y + rnd(1.5, 3.5) };
      floatText(u.x, u.y, '盟军援兵', '#9de0bd');
    }
  }
  S.allyAI.orderTimer -= dt;
  if (S.allyAI.orderTimer > 0) return;
  S.allyAI.orderTimer = 5;
  const enemyKeep = S.buildings.find(b => b.team === ENEMY && b.type === 'keep');
  for (const u of S.units) {
    if (u.team !== ALLY || u.hp <= 0 || u.garrisoned) continue;
    const near = findSmartTarget(u, 11);
    if (near) { orderAttack(u, near); continue; }
    if (!u.order && !u.target && enemyKeep) {
      u.order = { type: 'attackMove', x: enemyKeep.x, y: enemyKeep.y };
    }
  }
}

/* ------------- game update ------------- */
function update(dt) {
  S.time += dt;
  S.pathBudget = 4;
  if (S.run === 'skirmish') {
    S.wave.timer -= dt;
    if (S.wave.timer <= 0) launchWave();
  }
  updateCrates(dt);
  aiCrateTick(dt);
  S.radar = playerHasBuilding('watchtower');
  S.superCd = Math.max(0, S.superCd - dt);
  S.miniCd = Math.max(0, S.miniCd - dt);
  for (const f of S.superFx) f.t += dt;
  S.superFx = S.superFx.filter(f => f.t < f.dur);
  updateCamera(dt);
  updateAI(dt);
  updateAllyAI(dt);
  for (const u of [...S.units]) updateUnit(u, dt);
  updateBuildings(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  solveOverlap();
  const _t0 = performance.now();
  separateUnits();
  const _t1 = performance.now();
  for (const u of S.units) if (u.type === 'baseVehicle') pushOutOfBuildings(u);
  const _t2 = performance.now();
  S.perf.sepMs += _t1 - _t0;
  S.perf.pushMs += _t2 - _t1;
  S.perf.frames++;
  updateTraining(dt);
  updateConstruction(dt);
  updateTutorial(dt);
  Sound.ambient(dt);
  updateHud();
  if (S.time - (S.lastQueue || 0) > .15) {
    S.lastQueue = S.time;
    renderQueue();
    updateCards();
    updateSelectionPanel();
  }
  if (S.hover && S.hover.type !== 'unit') S.hover = null;
}
/* ------------- rendering ------------- */
/* ===== 8. RENDERING ===== */
function drawPoly(g, pts, fill, stroke = null, lw = 1) {
  g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function prism(g, w, d, h, cTop, cLeft, cRight, stroke) {
  const A = rel(-w / 2, -d / 2), Bp = rel(w / 2, -d / 2), C = rel(w / 2, d / 2), D = rel(-w / 2, d / 2);
  const t = p => ({ x: p.x, y: p.y - h });
  const A2 = t(A), B2 = t(Bp), C2 = t(C), D2 = t(D);
  drawPoly(g, [D, C, C2, D2], cLeft, stroke, .7);
  drawPoly(g, [Bp, C, C2, B2], cRight, stroke, .7);
  drawPoly(g, [A2, B2, C2, D2], cTop, stroke, .7);
  return { A, B: Bp, C, D, A2, B2, C2, D2 };
}
function teamColors(team) {
  if (team === ALLY) return { stone: '#71857a', stoneL: '#9db2a4', stoneD: '#46574e', roof: '#2e5b4a', roofL: '#437d66', wood: '#3e4e3c', woodL: '#688064', trim: '#b9d6b3', cloth: '#3d7a5e', clothD: '#214b37', metal: '#b3cab8' };
  return team === PLAYER
    ? { stone: '#8f8777', stoneL: '#b6ac98', stoneD: '#5f594e', roof: '#87362d', roofL: '#ad5140', wood: '#5a4028', woodL: '#8a6742', trim: '#e1bd78', cloth: '#a3372e', clothD: '#6e211c', metal: '#ccc4b3' }
    : { stone: '#6c6875', stoneL: '#928d9d', stoneD: '#45424e', roof: '#2d2a36', roofL: '#4e4a5d', wood: '#3f3428', woodL: '#655441', trim: '#b8b1c0', cloth: '#3c394b', clothD: '#211f2b', metal: '#908b9c' };
}
function shadow(g, rx, ry, alpha = .22) {
  g.fillStyle = `rgba(0,0,0,${alpha})`;
  g.beginPath(); g.ellipse(0, 2, rx, ry, 0, 0, 7); g.fill();
}
function roof(g, w, d, baseY, peakY, cA, cB, cC) {
  const A = rel(-w / 2, -d / 2), Bp = rel(w / 2, -d / 2), C = rel(w / 2, d / 2), D = rel(-w / 2, d / 2);
  const A2 = { x: A.x, y: A.y - baseY }, B2 = { x: Bp.x, y: Bp.y - baseY }, C2 = { x: C.x, y: C.y - baseY }, D2 = { x: D.x, y: D.y - baseY };
  const peak = { x: 0, y: -peakY };
  drawPoly(g, [A2, B2, peak], cA);
  drawPoly(g, [B2, C2, peak], cB);
  drawPoly(g, [D2, C2, peak], cC);
  drawPoly(g, [A2, D2, peak], cA);
  g.strokeStyle = 'rgba(35,24,15,.4)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(peak.x, peak.y); g.lineTo(C2.x, C2.y); g.stroke();
  return { A2, B2, C2, D2, peak };
}
function banner(g, x, y, color, trim, now, len = 18) {
  g.strokeStyle = '#3b2b1b'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 30); g.stroke();
  const wave = Math.sin(now * 3 + x * .1) * 2.2;
  g.fillStyle = color;
  g.beginPath(); g.moveTo(x, y - 30); g.quadraticCurveTo(x + len * .55, y - 30 + wave, x + len, y - 27); g.lineTo(x + len * .83, y - 20); g.quadraticCurveTo(x + len * .4, y - 19 + wave, x, y - 19); g.closePath(); g.fill();
  g.strokeStyle = trim; g.lineWidth = .8; g.stroke();
}

function drawKeep(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 105, 46, .3);
  prism(ctx, 3, 3, 16, c.stoneL, c.stoneD, c.stone, 'rgba(35,32,25,.5)');
  prism(ctx, 2.15, 2.15, 65, c.stoneL, c.stoneD, c.stone, 'rgba(35,32,25,.55)');
  // crenellations on central keep
  const topY = -65;
  for (let i = -2; i <= 2; i++) {
    const p = rel(i * .38, -1.075);
    ctx.fillStyle = c.stone; ctx.fillRect(p.x - 5, p.y + topY - 10, 10, 11);
    ctx.strokeStyle = 'rgba(35,32,25,.5)'; ctx.strokeRect(p.x - 5, p.y + topY - 10, 10, 11);
  }
  for (let i = -2; i <= 2; i++) {
    const p = rel(1.075, i * .38);
    ctx.fillStyle = c.stoneL; ctx.fillRect(p.x - 4, p.y + topY - 9, 9, 10);
  }
  // gate
  const gate = rel(0, .82);
  ctx.fillStyle = '#241a15';
  ctx.beginPath();
  ctx.moveTo(gate.x - 16, gate.y + 22);
  ctx.lineTo(gate.x - 16, gate.y - 4);
  ctx.arc(gate.x, gate.y - 4, 16, Math.PI, 0);
  ctx.lineTo(gate.x + 16, gate.y + 22);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(190,177,148,.28)'; ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(gate.x + i * 9, gate.y - 17); ctx.lineTo(gate.x + i * 9, gate.y + 21); ctx.stroke(); }
  // steps
  ctx.fillStyle = 'rgba(116,108,91,.8)';
  ctx.beginPath(); ctx.ellipse(0, 46, 48, 12, 0, 0, 7); ctx.fill();
  // side towers
  drawRoundTower(-58, 6, 34, 78, 34, c, b.team, now);
  drawRoundTower(58, -5, 32, 70, 31, c, b.team, now);
  // banners
  banner(ctx, -13, -72, c.cloth, c.trim, now + b.phase, 20);
  banner(ctx, 20, -70, c.cloth, c.trim, now + b.phase + 1, 16);
  // windows
  ctx.fillStyle = 'rgba(255,200,105,.4)';
  for (const x of [-24, 0, 24]) { ctx.fillRect(x - 3, -46, 6, 10); }
}
function drawRoundTower(x, y, w, h, roofH, c, team, now) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = c.stoneD; ctx.beginPath(); ctx.ellipse(0, 2, w * .7, 10, 0, 0, 7); ctx.fill();
  const grd = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grd.addColorStop(0, c.stoneD); grd.addColorStop(.5, c.stone); grd.addColorStop(1, c.stoneL);
  ctx.fillStyle = grd;
  roundRect(ctx, -w / 2, -h, w, h, 6); ctx.fill();
  ctx.strokeStyle = 'rgba(35,31,25,.5)'; ctx.lineWidth = 1; ctx.stroke();
  for (let i = 1; i < 3; i++) { ctx.strokeStyle = 'rgba(38,34,28,.26)'; ctx.beginPath(); ctx.moveTo(-w / 2 + 2, -h + h * i / 3); ctx.lineTo(w / 2 - 2, -h + h * i / 3); ctx.stroke(); }
  ctx.fillStyle = c.roof;
  ctx.beginPath(); ctx.moveTo(-w / 2 - 5, -h + 2); ctx.lineTo(w / 2 + 5, -h + 2); ctx.lineTo(0, -h - roofH); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.roofL; ctx.beginPath(); ctx.moveTo(-w / 2 - 5, -h + 2); ctx.lineTo(0, -h + 2); ctx.lineTo(0, -h - roofH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(30,23,18,.45)'; ctx.beginPath(); ctx.moveTo(-w / 2 - 5, -h + 2); ctx.lineTo(0, -h - roofH); ctx.stroke();
  ctx.fillStyle = 'rgba(255,213,120,.42)';
  ctx.fillRect(-3, -h * .62, 6, 9);
  banner(ctx, 0, -h - roofH + 4, c.cloth, c.trim, now + x, 13);
  ctx.restore();
}
function drawHouse(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 62, 28, .22);
  prism(ctx, 1.9, 1.9, 26, '#c7b48b', '#86724f', '#b09b73', 'rgba(67,50,30,.4)');
  // timber beams
  ctx.strokeStyle = '#5c4027'; ctx.lineWidth = 2;
  const A = rel(-.95, .95), C = rel(.95, .95), R = rel(.95, -.95);
  for (const [p1, p2] of [[{ x: A.x, y: A.y - 26 }, { x: A.x, y: A.y }], [{ x: C.x, y: C.y - 26 }, { x: C.x, y: C.y }], [{ x: R.x, y: R.y - 26 }, { x: R.x, y: R.y }]]) {
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(A.x, A.y - 13); ctx.lineTo(C.x, C.y - 13); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(C.x, C.y - 26); ctx.lineTo(R.x, R.y); ctx.stroke();
  // door
  const door = rel(0.28, .86);
  ctx.fillStyle = '#3a2817'; ctx.fillRect(door.x - 9, door.y - 20, 18, 20);
  ctx.fillStyle = 'rgba(255,210,120,.3)'; ctx.fillRect(door.x + 9, door.y - 13, 5, 5);
  // roof
  roof(ctx, 2.15, 2.15, 27, 58, c.wood, c.woodL, c.roof);
  ctx.fillStyle = '#6e5430'; ctx.fillRect(-30, -62, 9, 20);
  // chimney smoke
  if (Math.random() < .012) particle(b.x + .25, b.y - .2, { vx: rnd(-3, 3), vy: rnd(-7, -2), z: 60, vz: rnd(4, 9), g: -2, life: rnd(1, 2), size: rnd(2, 4), color: 'rgba(175,170,155,.22)', type: 'smoke', grow: 10 });
}
function drawBarracks(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 70, 30, .24);
  prism(ctx, 2, 2, 9, c.stoneL, c.stoneD, c.stone, 'rgba(35,32,25,.4)');
  prism(ctx, 1.8, 1.8, 30, '#a98d62', c.wood, '#8e744e', 'rgba(50,36,22,.45)');
  roof(ctx, 2.1, 2.1, 31, 64, c.roof, c.roofL, c.woodL);
  // door and sign
  const door = rel(.12, .88);
  ctx.fillStyle = '#271b12'; ctx.beginPath(); ctx.moveTo(door.x - 10, door.y + 5); ctx.lineTo(door.x - 10, door.y - 14); ctx.arc(door.x, door.y - 14, 10, Math.PI, 0); ctx.lineTo(door.x + 10, door.y + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.trim; ctx.beginPath(); ctx.arc(door.x, door.y - 30, 7, 0, 7); ctx.fill();
  ctx.fillStyle = c.cloth; ctx.beginPath(); ctx.moveTo(door.x, door.y - 34); ctx.lineTo(door.x + 6, door.y - 30); ctx.lineTo(door.x, door.y - 26); ctx.lineTo(door.x - 6, door.y - 30); ctx.closePath(); ctx.fill();
  banner(ctx, -47, -20, c.cloth, c.trim, now + b.phase, 18);
  // rack / barrels
  ctx.strokeStyle = '#4b3520'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(34, 8); ctx.lineTo(48, -18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(54, -24); ctx.stroke();
  ctx.fillStyle = '#6b4f2d'; ctx.beginPath(); ctx.ellipse(38, 12, 7, 4, 0, 0, 7); ctx.fill();
}
function drawTower(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 54, 24, .24);
  prism(ctx, 2, 2, 10, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  drawRoundTower(0, 0, 40, 82, 32, c, b.team, now);
  // side stones
  ctx.fillStyle = 'rgba(44,39,31,.35)'; ctx.fillRect(-37, -8, 10, 7); ctx.fillRect(28, -5, 9, 6);
}
function drawWatchtower(b, now) {
  drawTower(b, now);
  ctx.save(); ctx.translate(0, -88);
  ctx.strokeStyle = '#c9b37a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(0, -5); ctx.stroke();
  const a = Math.sin(now * 1.2 + b.phase) * .35;
  ctx.rotate(a);
  ctx.strokeStyle = '#9fb8bd'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -8, 10, Math.PI * .15, Math.PI * .85); ctx.stroke();
  ctx.fillStyle = 'rgba(159,216,255,.8)';
  ctx.beginPath(); ctx.arc(0, -8, 2.5, 0, 7); ctx.fill();
  ctx.restore();
}
function drawArmory(b, now) {
  drawBarracks(b, now);
  ctx.fillStyle = '#3c4042';
  ctx.fillRect(-16, 2, 20, 7);
  ctx.fillStyle = '#6d7374'; ctx.fillRect(-12, -1, 12, 4);
  ctx.strokeStyle = '#c7a55a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(14, 2); ctx.lineTo(22, -8); ctx.stroke();
  ctx.fillStyle = '#d8b568'; ctx.fillRect(21, -11, 6, 4);
}
function drawBallista(b, now) {
  drawTower(b, now);
  const sway = Math.sin(now * 1.5 + b.phase) * 1.2;
  ctx.strokeStyle = '#6d4f2d'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(-27, -62 + sway); ctx.lineTo(27, -62 + sway); ctx.stroke();
  ctx.strokeStyle = '#d7d0ba'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(20, -62 + sway); ctx.lineTo(34, -62 + sway); ctx.stroke();
  ctx.fillStyle = '#d7d0ba';
  ctx.beginPath(); ctx.moveTo(34, -62 + sway); ctx.lineTo(29, -66 + sway); ctx.lineTo(29, -58 + sway); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a2f2a'; ctx.fillRect(-24, -66 + sway, 10, 8);
}
function drawWall(b) {
  const c = teamColors(b.team);
  shadow(ctx, 34, 16, .18);
  prism(ctx, 1, 1, 32, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  for (let i = -1; i <= 1; i++) {
    const p = rel(i * .3, -.5);
    ctx.fillStyle = c.stone; ctx.fillRect(p.x - 4, p.y - 42, 8, 10);
  }
}
function drawFountain(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 60, 26, .2);
  prism(ctx, 2, 2, 9, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  ctx.fillStyle = '#566156'; ctx.beginPath(); ctx.ellipse(0, -10, 44, 20, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#9fa58f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(0, -12, 44, 20, 0, 0, 7); ctx.stroke();
  const water = ctx.createRadialGradient(-8, -16, 2, 0, -12, 38);
  water.addColorStop(0, 'rgba(168,226,214,.95)');
  water.addColorStop(.55, 'rgba(76,151,150,.9)');
  water.addColorStop(1, 'rgba(34,83,88,.9)');
  ctx.fillStyle = water; ctx.beginPath(); ctx.ellipse(0, -12, 37, 15, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.stone; ctx.fillRect(-6, -48, 12, 34);
  ctx.fillStyle = c.stoneL; ctx.beginPath(); ctx.ellipse(0, -50, 15, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(159,224,206,.8)';
  const pulse = (Math.sin(now * 2 + b.phase) + 1) / 2;
  ctx.beginPath(); ctx.ellipse(0, -52, 8 + pulse * 4, 3 + pulse * 2, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(190,238,220,.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, -76); ctx.moveTo(-6, -69); ctx.lineTo(6, -69); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = now * 1.4 + i * 2.1 + b.phase;
    ctx.fillStyle = 'rgba(180,236,214,.55)';
    ctx.beginPath(); ctx.arc(Math.cos(a) * 22, -20 + Math.sin(a) * 7, 1.5, 0, 7); ctx.fill();
  }
}
function drawWorkshop(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 86, 36, .24);
  prism(ctx, 3, 3, 9, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  prism(ctx, 2.8, 2.8, 28, '#9f8359', c.wood, '#806341', 'rgba(50,36,22,.45)');
  roof(ctx, 3.1, 3.1, 30, 70, c.roof, c.roofL, c.woodL);
  // big wheel
  ctx.fillStyle = '#3d2b1a'; ctx.beginPath(); ctx.arc(-22, -8, 16, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a17c4d'; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(-22, -8); ctx.lineTo(-22 + Math.cos(a) * 14, -8 + Math.sin(a) * 14); ctx.stroke();
  }
  ctx.fillStyle = '#c9a15f'; ctx.beginPath(); ctx.arc(-22, -8, 4, 0, 7); ctx.fill();
  // crane and timber
  ctx.strokeStyle = '#5a3e24'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(27, 2); ctx.lineTo(27, -41); ctx.lineTo(42, -41); ctx.stroke();
  ctx.strokeStyle = '#b9a377'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(42, -41); ctx.lineTo(42, -29); ctx.stroke();
  ctx.fillStyle = '#6d5a3e'; ctx.fillRect(35, -31, 14, 5);
  banner(ctx, -49, -22, c.cloth, c.trim, now + b.phase, 20);
}
function drawMarket(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 68, 30, .22);
  prism(ctx, 2, 2, 9, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  prism(ctx, 2, 2, 24, '#a88d62', c.wood, '#876b48', 'rgba(50,36,22,.4)');
  // striped awning
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#e1d2ac' : c.cloth;
    ctx.beginPath();
    const x = -38 + i * 19;
    ctx.moveTo(x, -44); ctx.lineTo(x + 19, -44); ctx.lineTo(x + 16, -32); ctx.lineTo(x + 3, -32); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#4d3721'; ctx.fillRect(-38, -46, 76, 3);
  // counter and wares
  ctx.fillStyle = '#7b5b37'; ctx.fillRect(-32, -20, 24, 12);
  ctx.fillStyle = '#d2b06b'; ctx.beginPath(); ctx.arc(-26, -22, 4, 0, 7); ctx.arc(-16, -22, 4, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a4b2c'; ctx.beginPath(); ctx.ellipse(24, -5, 8, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = c.trim; ctx.fillRect(21, -11, 6, 6);
  banner(ctx, 0, -50, c.cloth, c.trim, now + b.phase, 17);
}
function drawCathedral(b, now) {
  const c = teamColors(b.team);
  shadow(ctx, 78, 34, .25);
  prism(ctx, 3, 3, 10, c.stoneL, c.stoneD, c.stone, 'rgba(35,31,25,.4)');
  prism(ctx, 2.8, 2.8, 38, '#b7a98d', '#7f7461', '#a99a7f', 'rgba(40,36,28,.4)');
  roof(ctx, 2.9, 2.9, 39, 54, '#574f45', '#71675a', '#403a33');
  // central tower and spire
  prism(ctx, 1.1, 1.1, 68, '#c2b396', '#80745f', '#b2a286', 'rgba(40,36,28,.4)');
  ctx.fillStyle = '#5b5146'; ctx.beginPath();
  ctx.moveTo(-15, -92); ctx.lineTo(15, -92); ctx.lineTo(0, -126); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.trim; ctx.fillRect(-2, -137, 4, 13);
  ctx.strokeStyle = 'rgba(240,214,160,.65)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, -62, 8, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(0, -54); ctx.moveTo(-8, -62); ctx.lineTo(8, -62); ctx.stroke();
  // rose window and door
  ctx.fillStyle = 'rgba(243,201,113,.55)'; ctx.beginPath(); ctx.arc(0, -39, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#3b2b1d'; ctx.beginPath(); ctx.arc(0, -12, 8, Math.PI, 0); ctx.fill(); ctx.fillRect(-8, -12, 16, 9);
  banner(ctx, -38, -20, c.cloth, c.trim, now + b.phase, 22);
  banner(ctx, 38, -20, c.cloth, c.trim, now + b.phase + 1, 22);
}
function drawMill(b, now) {
  drawHouse(b, now);
  const sway = Math.sin(now * 1.7 + b.phase) * .35;
  ctx.save(); ctx.translate(0, -52); ctx.rotate(sway);
  ctx.strokeStyle = '#e6d3a2'; ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -19); ctx.stroke();
    ctx.fillStyle = 'rgba(235,215,166,.65)'; ctx.fillRect(-2, -19, 7, 12);
  }
  ctx.restore();
}
function drawForge(b, now) {
  drawArmory(b, now);
  const glow = .5 + Math.sin(now * 4 + b.phase) * .25;
  ctx.fillStyle = `rgba(255,154,62,${glow})`;
  ctx.beginPath(); ctx.ellipse(-18, -38, 7, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,226,151,.7)';
  ctx.beginPath(); ctx.ellipse(-18, -41, 3, 5, 0, 0, 7); ctx.fill();
}
function drawSunAltar(b, now) {
  drawFountain(b, now);
  const k = .55 + Math.sin(now * 3 + b.phase) * .25;
  ctx.fillStyle = `rgba(255,188,83,${k})`;
  ctx.beginPath(); ctx.ellipse(0, -46, 14, 7, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,234,170,.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -46, 22 + Math.sin(now * 2 + b.phase) * 3, 0, 7); ctx.stroke();
}
function drawStormSpire(b, now) {
  drawTower(b, now);
  ctx.strokeStyle = `rgba(159,216,255,${.45 + Math.sin(now * 6 + b.phase) * .25})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-13, -84); ctx.lineTo(-4, -72); ctx.lineTo(-10, -61); ctx.lineTo(2, -50); ctx.stroke();
  ctx.fillStyle = 'rgba(159,216,255,.8)';
  ctx.beginPath(); ctx.arc(2, -50, 2.5, 0, 7); ctx.fill();
}
function drawPlagueWell(b, now) {
  drawFountain(b, now);
  for (let i = 0; i < 3; i++) {
    const a = now * .8 + b.phase + i * 2.1;
    const x = Math.cos(a) * (14 + i * 3), y = -26 + Math.sin(a) * 6;
    ctx.fillStyle = `rgba(151,201,105,${.25 + .2 * Math.sin(a * 2)})`;
    ctx.beginPath(); ctx.arc(x, y, 3 + i, 0, 7); ctx.fill();
  }
}
function drawBuilding(b, now, ghost = false) {
  const p = mapPos(b.x, b.y);
  ctx.save(); ctx.translate(p.x, p.y);
  if (ghost) ctx.globalAlpha = .5;
  else if (b.constructed === false) ctx.globalAlpha = .62;
  if (b.type === 'keep') drawKeep(b, now);
  else if (b.type === 'house') drawHouse(b, now);
  else if (b.type === 'barracks') drawBarracks(b, now);
  else if (b.type === 'tower') drawTower(b, now);
  else if (b.type === 'wall') drawWall(b);
  else if (b.type === 'fountain') drawFountain(b, now);
  else if (b.type === 'workshop') drawWorkshop(b, now);
  else if (b.type === 'market') drawMarket(b, now);
  else if (b.type === 'cathedral') drawCathedral(b, now);
  else if (b.type === 'armory') drawArmory(b, now);
  else if (b.type === 'ballista') drawBallista(b, now);
  else if (b.type === 'watchtower') drawWatchtower(b, now);
  else if (b.type === 'mill') drawMill(b, now);
  else if (b.type === 'forge') drawForge(b, now);
  else if (b.type === 'sunAltar') drawSunAltar(b, now);
  else if (b.type === 'stormSpire') drawStormSpire(b, now);
  else if (b.type === 'plagueWell') drawPlagueWell(b, now);
  ctx.restore();

  // health bar in world coords
  if (b.hp < b.maxHp || S.selectedBuilding === b) {
    const sx = p.x, sy = p.y - B[b.type].h - 16;
    const w = B[b.type].w * 24;
    ctx.fillStyle = 'rgba(10,8,6,.8)'; ctx.fillRect(sx - w / 2, sy, w, 4);
    ctx.fillStyle = b.team === PLAYER ? '#c05a43' : b.team === ALLY ? '#5f9e7f' : '#807a94';
    ctx.fillRect(sx - w / 2 + 1, sy + 1, (w - 2) * clamp(b.hp / b.maxHp, 0, 1), 2);
  }
  if (b.constructed === false && !ghost) {
    const sx = p.x, sy = p.y - B[b.type].h - 26;
    const w = B[b.type].w * 24;
    const prog = clamp(b.progress || 0, 0, 1);
    ctx.fillStyle = 'rgba(7,9,10,.9)'; ctx.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 7);
    ctx.fillStyle = 'rgba(213,179,110,.18)'; ctx.fillRect(sx - w / 2, sy, w, 5);
    ctx.fillStyle = '#d9b65f'; ctx.fillRect(sx - w / 2, sy, w * prog, 5);
    ctx.fillStyle = 'rgba(255,239,197,.28)'; ctx.fillRect(sx - w / 2, sy, w * prog, 1.5);
    ctx.font = '8px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0dcb0';
    ctx.fillText(`${Math.round(prog * 100)}%`, sx, sy - 3);
    ctx.textAlign = 'left';
  }
}
function drawGold(g, now) {
  const p = mapPos(g.x, g.y);
  ctx.save(); ctx.translate(p.x, p.y);
  shadow(ctx, 52, 22, .2);
  const count = Math.max(2, Math.round(g.amount / g.max * 6));
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + .3, rx = Math.cos(a) * (10 + i * 3), ry = Math.sin(a) * (5 + i * 2);
    ctx.fillStyle = i % 2 ? '#7d7666' : '#918877';
    ctx.beginPath(); ctx.ellipse(rx, ry - 6, 15 - i, 9 - i * .5, a * .3, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(38,35,29,.35)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.strokeStyle = '#d7b25c'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 4 - 8); ctx.lineTo(Math.cos(a + .4) * 14, Math.sin(a + .4) * 7 - 15); ctx.stroke();
  }
  const tw = Math.sin(now * 2.4 + g.phase);
  if (tw > .65) {
    ctx.fillStyle = 'rgba(255,235,160,.85)';
    ctx.beginPath(); ctx.arc(-8, -17, 1.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawCrate(c, now) {
  const p = mapPos(c.x, c.y);
  const bob = Math.sin(now * 2.1 + c.phase) * 2.2;
  ctx.save();
  ctx.translate(p.x, p.y + bob * .3);
  shadow(ctx, 17, 7, .26);
  const fade = c.life < 10 ? Math.max(.22, c.life / 10) : 1;
  ctx.globalAlpha = fade;
  const glow = ctx.createRadialGradient(0, -18, 2, 0, -18, 30);
  glow.addColorStop(0, 'rgba(240,205,120,.3)');
  glow.addColorStop(1, 'rgba(240,205,120,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -18, 30, 0, 7); ctx.fill();
  const top = { x: 0, y: -32 }, right = { x: 14, y: -24 }, bot = { x: 0, y: -16 }, left = { x: -14, y: -24 };
  drawPoly(ctx, [top, right, bot, left], '#7a5730', 'rgba(26,18,10,.65)', 1);
  drawPoly(ctx, [left, bot, { x: 0, y: -2 }, { x: -14, y: -10 }], '#4a3218', 'rgba(26,18,10,.65)', 1);
  drawPoly(ctx, [right, bot, { x: 0, y: -2 }, { x: 14, y: -10 }], '#5c3d1f', 'rgba(26,18,10,.65)', 1);
  ctx.strokeStyle = '#e6c67e'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(bot.x, bot.y); ctx.lineTo(right.x, right.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5, -27); ctx.lineTo(5, -27); ctx.stroke();
  const tw = Math.sin(now * 3 + c.phase);
  if (tw > .35) {
    ctx.fillStyle = 'rgba(255,242,196,.9)';
    ctx.beginPath(); ctx.arc(7, -35, 1.9, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
const CRATE_KINDS = ['gold', 'troops', 'supply', 'super'];
function spawnCrate() {
  for (let i = 0; i < 80; i++) {
    const x = rnd(6, MAP - 6), y = rnd(6, MAP - 6);
    if (terrainAt(x, y)) continue;
    if (S.buildings.some(b => Math.hypot(x - b.x, y - b.y) < 5)) continue;
    if (S.goldNodes.some(g => Math.hypot(x - g.x, y - g.y) < 2.5)) continue;
    if (S.crates.some(c => Math.hypot(x - c.x, y - c.y) < 6)) continue;
    const kind = CRATE_KINDS[Math.floor(Math.random() * CRATE_KINDS.length)];
    S.crates.push({ x, y, kind, phase: rnd(0, 9), life: 75 });
    burst(x, y, 'gold', 6);
    return true;
  }
  return false;
}
function grantCrate(c) {
  if (c.kind === 'gold') {
    const amount = 200 + Math.floor(Math.random() * 200);
    S.gold += amount;
    floatText(c.x, c.y, `+${amount} 金币`, '#f0d18a');
    toast(`奖励箱：获得 ${amount} 金币`, '', 'coin');
  } else if (c.kind === 'troops') {
    const pool = [...S.unlocked].filter(k => U[k] && U[k].producer && k !== 'hero' && k !== 'baseVehicle' && U[k].cost > 0);
    const n = 2 + (Math.random() < .5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const type = pool.length ? pool[Math.floor(Math.random() * pool.length)] : 'spearman';
      const a = i / n * Math.PI * 2;
      const u = addUnit(type, PLAYER, c.x + Math.cos(a) * 1.4, c.y + Math.sin(a) * 1.4);
      u.order = { type: 'move', x: c.x + Math.cos(a) * 3, y: c.y + Math.sin(a) * 3 };
      burst(u.x, u.y, 'dust', 5);
    }
    floatText(c.x, c.y, `援军 ×${n}`, '#9ac4ff');
    toast(`奖励箱：${n} 名援军加入队伍`, '', 'sword');
  } else if (c.kind === 'supply') {
    for (const u of S.units) {
      if (u.team !== PLAYER || u.garrisoned || u.hp <= 0) continue;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .25);
    }
    floatText(c.x, c.y, '全军补给 +25%', '#9fd39a');
    toast('奖励箱：全军回复 25% 生命', '', 'shield');
  } else {
    if (S.supersEnabled && S.superKey) {
      S.superCd = 0;
      floatText(c.x, c.y, '超级武器就绪', '#a9d6ff');
      toast('奖励箱：超级武器冷却清零', '', 'scroll');
    } else {
      S.gold += 300;
      floatText(c.x, c.y, '+300 金币', '#f0d18a');
      toast('奖励箱：获得 300 金币', '', 'coin');
    }
  }
  Sound.play('ui');
  burst(c.x, c.y, 'gold', 16);
  updateHud(true);
}
function nearestCrate(u, radius) {
  let best = null, bd = Infinity;
  for (const c of S.crates) {
    const d = Math.hypot(u.x - c.x, u.y - c.y);
    if (d > radius || d >= bd) continue;
    bd = d; best = c;
  }
  return best;
}
function grantCrateAlly(c) {
  let healed = 0;
  for (const u of S.units) {
    if (u.team !== ALLY || u.hp <= 0 || u.garrisoned) continue;
    if (Math.hypot(u.x - c.x, u.y - c.y) > 7) continue;
    if (u.hp >= u.maxHp) continue;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .2);
    healed++;
  }
  floatText(c.x, c.y, '盟军拾取补给', '#9de0bd');
  toast('青杉盟军捡走了奖励箱，治疗了周围友军', '', 'shield');
  Sound.play('ui');
  return healed;
}
function grantCrateEnemy(c) {
  let healed = 0;
  for (const u of S.units) {
    if (u.team !== ENEMY || u.hp <= 0 || u.garrisoned) continue;
    if (Math.hypot(u.x - c.x, u.y - c.y) > 7) continue;
    if (u.hp >= u.maxHp) continue;
    u.hp = Math.min(u.maxHp, u.hp + u.maxHp * .2);
    healed++;
  }
  floatText(c.x, c.y, '黑鸦拾取补给', '#c9a0a0');
  toast('黑鸦部队抢先捡走了一个奖励箱', 'warn', 'shield');
  Sound.play('ui');
  burst(c.x, c.y, 'dust', 10);
  return healed;
}
// AI 决策优先级（写死，不要再改顺序）：
//   交战 > 防守 > 建造/训练 > 拾取宝箱 > 闲逛
// 宝箱只在「AI 决策 tick」里扫一次（默认 1 秒），不随单位数量增长；一次只派一个单位。
function aiCrateTick(dt) {
  S.aiCrateT = (S.aiCrateT || 0) - dt;
  if (S.aiCrateT > 0) return;
  S.aiCrateT = 1;
  S.crateStats.scans++;
  if (S.tutorial || S.run !== 'skirmish') return;
  if (!S.crates.length) return;
  // 已经有人在捡就不要再派人
  if (S.units.some(u => u.team === ENEMY && u.crateRun && S.crates.includes(u.crateRun))) return;
  let best = null, bestD = Infinity;
  for (const c of S.crates) {
    for (const u of S.units) {
      if (u.team !== ENEMY || u.hp <= 0 || u.garrisoned) continue;
      if (u.order || u.target) continue;      // 闲置：无指令、无攻击目标
      if (u.type === 'peasant') continue;      // 采集单位不派
      const vision = VISION_U[u.type] || 7;    // 只用 AI 自己的视野
      const d = Math.hypot(u.x - c.x, u.y - c.y);
      if (d > vision) continue;
      if (d < bestD) { bestD = d; best = { u, c }; }
    }
  }
  if (best) {
    best.u.order = { type: 'move', x: best.c.x, y: best.c.y };
    best.u.crateRun = best.c;
    best.u.crateRunT = S.time;
    const spd = Math.max(.6, U[best.u.type].speed);
    best.u.crateRunLimit = (Math.hypot(best.u.x - best.c.x, best.u.y - best.c.y) / spd) * 2;
    S.crateStats.dispatches++;(S.crateLog = S.crateLog || []).push({ t: Math.round(S.time), id: best.u.id, type: best.u.type, idle: true });
    if (S.crateLog.length > 12) S.crateLog.shift();
  }
}
function updateCrates(dt) {
  S.crateTimer -= dt;
  if (S.crateTimer <= 0) {
    S.crateTimer = 45 + rnd(0, 25);
    if (S.crates.length < 3) spawnCrate();
  }
  for (const c of [...S.crates]) {
    c.life -= dt;
    if (c.life <= 0) { S.crates = S.crates.filter(x => x !== c); continue; }
    for (const u of S.units) {
      if (u.garrisoned || u.hp <= 0) continue;
      if (Math.hypot(u.x - c.x, u.y - c.y) > 1.0) continue;
      if (u.crateRun) { S.crateStats.picksDispatched++; u.crateRun = null; } else { S.crateStats.picksFree++; }
      if (u.team === PLAYER) { grantCrate(c); S.crateStats.picksPlayer++; }
      else if (u.team === ENEMY) { grantCrateEnemy(c); S.crateStats.picksEnemy++; }
      else if (u.team === ALLY) { grantCrateAlly(c); S.crateStats.picksAlly++; }
      else continue;
      S.crates = S.crates.filter(x => x !== c);
      break;
    }
  }
}
function drawTree(t, now) {
  const p = mapPos(t.x, t.y);
  const sway = Math.sin(now * 1.3 + t.phase) * 1.8;
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.scale(t.size, t.size);
  shadow(ctx, 20, 8, .17);
  ctx.strokeStyle = '#4a3622'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sway * .4, -22); ctx.stroke();
  if (t.variant === 2) {
    ctx.fillStyle = '#2b4430';
    for (let i = 0; i < 3; i++) {
      const y = -18 - i * 12;
      ctx.beginPath(); ctx.moveTo(-15 + i * 3 + sway, y); ctx.lineTo(15 - i * 3 + sway, y); ctx.lineTo(sway, y - 24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = i % 2 ? '#385339' : '#2b4430';
    }
  } else {
    const blobs = [[-7, -28, 13], [7, -32, 14], [0, -42, 16], [-12, -37, 10], [12, -22, 9]];
    for (const [x, y, r] of blobs) {
      ctx.fillStyle = t.variant === 1 ? '#3a5735' : '#33502f';
      ctx.beginPath(); ctx.arc(x + sway, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = t.variant === 1 ? '#4c6c40' : '#436039';
      ctx.beginPath(); ctx.arc(x + sway - r * .25, y - r * .25, r * .58, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
}
function drawProp(pr, now) {
  const p = mapPos(pr.x, pr.y);
  ctx.save(); ctx.translate(p.x, p.y);
  if (pr.type === 'rock') {
    shadow(ctx, 17, 7, .17);
    ctx.fillStyle = '#7e7768';
    ctx.beginPath(); ctx.ellipse(0, -7, 15, 10, -.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#958d7b'; ctx.beginPath(); ctx.ellipse(-3, -11, 8, 5, -.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#52613e'; ctx.beginPath(); ctx.ellipse(-5, -6, 5, 2.5, -.3, 0, 7); ctx.fill();
  } else if (pr.type === 'shrub') {
    ctx.fillStyle = '#31492e';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc((i - 1) * 8, -5 - (i % 2) * 3, 8, 0, 7); ctx.fill(); }
  } else if (pr.type === 'ruin') {
    shadow(ctx, 42, 16, .2);
    ctx.strokeStyle = 'rgba(152,143,122,.65)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI * 1.08, Math.PI * 1.72); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI * 1.86, Math.PI * 2.45); ctx.stroke();
    ctx.fillStyle = '#8d8572'; ctx.fillRect(-38, -6, 12, 10); ctx.fillRect(26, -4, 13, 8);
  } else if (pr.type === 'column') {
    shadow(ctx, 15, 6, .2);
    ctx.fillStyle = '#938a76'; ctx.fillRect(-5, -38, 10, 38);
    ctx.fillStyle = '#b0a58d'; ctx.fillRect(-9, -42, 18, 6);
    ctx.fillStyle = '#6e6758'; ctx.fillRect(-9, -3, 18, 5);
  } else if (pr.type === 'rubble') {
    shadow(ctx, 42, 18, .2);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#6e6657' : '#887f6b';
      ctx.fillRect(-25 + (i * 7) % 50, -3 - (i % 3) * 4, 10, 6);
    }
  }
  ctx.restore();
}
function drawHero(u, now, swing, bob) {
  const pulse = (Math.sin(now * 2.6 + u.phase) + 1) / 2;
  ctx.strokeStyle = `rgba(232,196,106,${.16 + pulse * .14})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(0, 0, 18 + pulse * 3, 7 + pulse * 1.5, 0, 0, 7); ctx.stroke();
  // cape
  ctx.fillStyle = '#6c2025';
  ctx.beginPath(); ctx.moveTo(-10, -33 - bob); ctx.lineTo(-19, -3); ctx.lineTo(0, -8); ctx.lineTo(18, -4); ctx.lineTo(10, -33 - bob); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(226,187,104,.45)'; ctx.lineWidth = 1; ctx.stroke();
  // legs
  ctx.strokeStyle = '#4a3727'; ctx.lineWidth = 2.8;
  ctx.beginPath(); ctx.moveTo(-4, -11); ctx.lineTo(-4 + swing, -2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -11); ctx.lineTo(4 - swing, -2); ctx.stroke();
  // armored body
  ctx.fillStyle = '#9ca3a0';
  roundRect(ctx, -9, -33 - bob, 18, 22, 4); ctx.fill();
  ctx.fillStyle = '#6d7675'; ctx.fillRect(-9, -18 - bob, 18, 3);
  ctx.fillStyle = '#c7a451';
  ctx.fillRect(-3, -32 - bob, 6, 19);
  ctx.fillStyle = '#e2c175';
  ctx.beginPath(); ctx.arc(0, -25 - bob, 3.2, 0, 7); ctx.fill();
  // pauldrons
  ctx.fillStyle = '#c9a85a';
  ctx.beginPath(); ctx.ellipse(-10, -31 - bob, 5.2, 4.2, -.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(10, -31 - bob, 5.2, 4.2, .2, 0, 7); ctx.fill();
  // shield
  ctx.fillStyle = '#782d2b';
  ctx.beginPath(); ctx.ellipse(-14, -22 - bob, 7, 9.5, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#d6b36a'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = '#e7c77e';
  ctx.beginPath(); ctx.arc(-14, -22 - bob, 2.2, 0, 7); ctx.fill();
  // head + crowned helm
  ctx.fillStyle = '#d8ab7e';
  ctx.beginPath(); ctx.arc(0, -41 - bob, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#aeb5ae';
  ctx.beginPath(); ctx.arc(0, -43 - bob, 6.6, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#d9b563';
  ctx.fillRect(-6, -46 - bob, 12, 2.5);
  ctx.beginPath();
  ctx.moveTo(-7, -46 - bob); ctx.lineTo(-8, -53 - bob); ctx.lineTo(-3.5, -49 - bob);
  ctx.lineTo(0, -55 - bob); ctx.lineTo(3.5, -49 - bob); ctx.lineTo(8, -53 - bob);
  ctx.lineTo(7, -46 - bob); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#a52f2b';
  ctx.beginPath(); ctx.moveTo(-1, -52 - bob); ctx.quadraticCurveTo(-12, -58 - bob, -16, -48 - bob); ctx.quadraticCurveTo(-7, -50 - bob, -2, -47 - bob); ctx.fill();
  // greatsword
  const ang = u.attackAnim > 0 ? -1.15 : -.4;
  ctx.save(); ctx.translate(10, -24 - bob); ctx.rotate(ang);
  ctx.shadowColor = 'rgba(245,210,125,.65)'; ctx.shadowBlur = 7;
  ctx.strokeStyle = '#ece3cc'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(25, -15); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#d5b15d'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(-4, 3); ctx.lineTo(3, -3); ctx.stroke();
  ctx.restore();
}
function drawSiege(u, now, swing) {
  const c = teamColors(u.team);
  // wheels
  for (const x of [-14, 14]) {
    ctx.fillStyle = '#33261a'; ctx.beginPath(); ctx.arc(x, -4, 7, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 1.4;
    for (let a = 0; a < 6; a++) {
      ctx.beginPath(); ctx.moveTo(x, -4); ctx.lineTo(x + Math.cos(a * 1.047) * 6, -4 + Math.sin(a * 1.047) * 6); ctx.stroke();
    }
    ctx.fillStyle = '#a98652'; ctx.beginPath(); ctx.arc(x, -4, 2, 0, 7); ctx.fill();
  }
  // chassis
  ctx.fillStyle = '#6c4c2c'; roundRect(ctx, -23, -15, 46, 13, 3); ctx.fill();
  ctx.fillStyle = '#8a663c'; ctx.fillRect(-20, -13, 40, 3);
  ctx.fillStyle = c.cloth; ctx.fillRect(-23, -10, 46, 3);

  if (u.type === 'ram') {
    ctx.fillStyle = '#4e3822';
    ctx.fillRect(-19, -28, 3, 14); ctx.fillRect(16, -28, 3, 14);
    ctx.fillStyle = c.roof; ctx.beginPath();
    ctx.moveTo(-24, -27); ctx.lineTo(24, -27); ctx.lineTo(18, -17); ctx.lineTo(-18, -17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.cloth; ctx.fillRect(-24, -28, 48, 3);
    ctx.strokeStyle = '#4b321d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-27, -13); ctx.lineTo(21, -13); ctx.stroke();
    ctx.fillStyle = '#5f6364'; roundRect(ctx, 20, -20, 10, 13, 2); ctx.fill();
    ctx.fillStyle = '#8f9291'; ctx.fillRect(23, -17, 5, 2);
    ctx.strokeStyle = '#2c2118'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-15, -17); ctx.lineTo(-12, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -17); ctx.lineTo(14, -10); ctx.stroke();
  } else if (u.type === 'catapult') {
    const fire = u.attackAnim > 0 ? 1 : 0;
    const arm = fire ? -.55 : -1.15;
    ctx.save(); ctx.translate(-1, -16); ctx.rotate(arm);
    ctx.strokeStyle = '#5a3f25'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(30, 0); ctx.stroke();
    ctx.fillStyle = '#3e2c1c'; ctx.beginPath(); ctx.arc(-7, 0, 5, 0, 7); ctx.fill();
    ctx.fillStyle = '#6d6250'; ctx.beginPath(); ctx.arc(30, 0, 4.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#b09a70'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(36, 6); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = c.metal; ctx.fillRect(-6, -22, 12, 3);
    ctx.fillStyle = c.cloth; ctx.beginPath();
    ctx.moveTo(-18, -29); ctx.lineTo(-18, -38); ctx.lineTo(-4, -34); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#5a3f25'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(13, -20, 10, -1.35, 1.35); ctx.stroke();
    ctx.strokeStyle = '#d9cba8'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(16, -30); ctx.lineTo(16, -10); ctx.stroke();
    ctx.strokeStyle = '#4b321d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, -18); ctx.lineTo(22, -18); ctx.stroke();
    ctx.fillStyle = '#c8c1aa'; ctx.beginPath();
    ctx.moveTo(24, -18); ctx.lineTo(17, -21); ctx.lineTo(17, -15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.cloth; ctx.fillRect(-8, -24, 12, 6);
  }
}
function drawBaseVehicle(u, now) {
  const c = teamColors(u.team);
  // wheels
  for (const x of [-18, 18]) {
    ctx.fillStyle = '#2d2117'; ctx.beginPath(); ctx.arc(x, -5, 8, 0, 7); ctx.fill();
    ctx.strokeStyle = '#765333'; ctx.lineWidth = 2;
    for (let a = 0; a < 6; a++) {
      ctx.beginPath(); ctx.moveTo(x, -5);
      ctx.lineTo(x + Math.cos(a * 1.047) * 7, -5 + Math.sin(a * 1.047) * 7); ctx.stroke();
    }
    ctx.fillStyle = '#b08b55'; ctx.beginPath(); ctx.arc(x, -5, 2.4, 0, 7); ctx.fill();
  }
  // chassis
  ctx.fillStyle = '#563b23'; roundRect(ctx, -25, -15, 50, 13, 4); ctx.fill();
  ctx.fillStyle = '#85603a'; ctx.fillRect(-22, -13, 44, 3);
  ctx.fillStyle = c.cloth; ctx.fillRect(-25, -8, 50, 2);
  // wooden base cabin
  ctx.fillStyle = '#6d4a2a'; roundRect(ctx, -21, -37, 42, 23, 4); ctx.fill();
  ctx.fillStyle = c.wood; roundRect(ctx, -19, -35, 38, 17, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(42,28,16,.65)'; ctx.lineWidth = 1.2;
  for (let x = -14; x <= 14; x += 7) { ctx.beginPath(); ctx.moveTo(x, -34); ctx.lineTo(x, -19); ctx.stroke(); }
  // canvas roof
  ctx.fillStyle = c.cloth; roundRect(ctx, -21, -48, 42, 15, 7); ctx.fill();
  ctx.fillStyle = c.clothD; ctx.fillRect(-21, -38, 42, 3);
  ctx.strokeStyle = c.trim; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-18, -46); ctx.quadraticCurveTo(0, -51, 18, -46); ctx.stroke();
  // poles and pennant
  ctx.strokeStyle = '#4b321d'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-15, -48); ctx.lineTo(-15, -58); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15, -48); ctx.lineTo(15, -58); ctx.stroke();
  ctx.fillStyle = c.cloth;
  ctx.beginPath(); ctx.moveTo(-15, -58); ctx.lineTo(-2, -54); ctx.lineTo(-15, -51); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.metal;
  roundRect(ctx, -6, -43, 12, 7, 2); ctx.fill();
  banner(ctx, 18, -44, c.cloth, c.trim, now + u.phase, 11);
}
function drawUnit(u, now) {
  if (u.garrisoned) return;
  const p = mapPos(u.x, u.y);
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.scale(u.facing, 1);
  const moving = u.moving;
  const swing = moving ? Math.sin(now * 10 + u.phase) * 2.5 : 0;
  const bob = moving ? Math.abs(Math.sin(now * 10 + u.phase)) * 1.2 : 0;
  const c = teamColors(u.team);
  const siege = u.type === 'ram' || u.type === 'catapult' || u.type === 'scorpion';
  const baseVehicle = u.type === 'baseVehicle';
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  const sw = baseVehicle ? 27 : siege ? 24 : u.type === 'knight' ? 19 : u.type === 'hero' ? 14 : 9;
  ctx.beginPath(); ctx.ellipse(0, 1, sw, baseVehicle ? 8 : siege ? 7 : u.type === 'knight' ? 6 : u.type === 'hero' ? 4.6 : 3.4, 0, 0, 7); ctx.fill();

  if (u.militiaT > 0) {
    ctx.fillStyle = '#d9503f';
    ctx.beginPath();
    ctx.moveTo(0, -U[u.type].h - 10);
    ctx.lineTo(6, -U[u.type].h - 4);
    ctx.lineTo(0, -U[u.type].h + 2);
    ctx.closePath(); ctx.fill();
  }
  if (baseVehicle) {
    drawBaseVehicle(u, now);
  } else if (siege) {
    drawSiege(u, now, swing);
  } else if (u.type === 'hero') {
    drawHero(u, now, swing, bob);
  } else if (u.type === 'knight') {
    // horse
    ctx.strokeStyle = '#3b2b1f'; ctx.lineWidth = 2;
    for (const [x, s] of [[-10, swing], [10, -swing]]) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + s * .5, 0); ctx.stroke(); }
    ctx.fillStyle = '#5b4631';
    ctx.beginPath(); ctx.ellipse(0, -15, 20, 10, -.05, 0, 7); ctx.fill();
    ctx.fillStyle = c.cloth;
    ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(17, -17); ctx.lineTo(11, -5); ctx.lineTo(-11, -5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5b4631';
    ctx.beginPath(); ctx.moveTo(15, -20); ctx.lineTo(25, -33); ctx.lineTo(30, -28); ctx.lineTo(22, -13); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(28, -34, 9, 5, -.2, 0, 7); ctx.fill();
    ctx.fillStyle = c.metal;
    roundRect(ctx, -8, -37, 14, 16, 4); ctx.fill();
    ctx.fillStyle = c.skin || '#d1a276'; ctx.beginPath(); ctx.arc(-1, -41, 5, 0, 7); ctx.fill();
    ctx.fillStyle = c.metal; ctx.beginPath(); ctx.arc(-1, -43, 5.5, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = c.trim; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-7, -35); ctx.lineTo(7, -35); ctx.stroke();
    // lance
    ctx.strokeStyle = '#8b6b44'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, -24); ctx.lineTo(38, -44); ctx.stroke();
    ctx.fillStyle = c.metal;
    ctx.beginPath(); ctx.moveTo(38, -44); ctx.lineTo(31, -44); ctx.lineTo(36, -48); ctx.closePath(); ctx.fill();
  } else {
    // legs
    ctx.strokeStyle = '#3c2c1f'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-3, -9); ctx.lineTo(-3 + swing, -2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -9); ctx.lineTo(3 - swing, -2); ctx.stroke();
    // body
    ctx.fillStyle = c.cloth;
    roundRect(ctx, -6, -22 - bob, 12, 15, 3); ctx.fill();
    ctx.fillStyle = c.clothD;
    ctx.fillRect(-6, -12 - bob, 12, 3);
    // arms
    ctx.strokeStyle = c.skin || '#d0a276'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -18 - bob); ctx.lineTo(-9, -12 - bob); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -18 - bob); ctx.lineTo(9, -13 - bob); ctx.stroke();
    // head
    ctx.fillStyle = u.team === PLAYER ? '#d7aa7d' : '#b98f73';
    ctx.beginPath(); ctx.arc(0, -28 - bob, 5, 0, 7); ctx.fill();
    if (u.type === 'peasant') {
      ctx.fillStyle = '#b59758';
      ctx.beginPath(); ctx.ellipse(0, -32 - bob, 8, 3, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6d4f2d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(6, -20 - bob); ctx.lineTo(13, -34 - bob); ctx.stroke();
      if (u.carrying > 0) {
        ctx.fillStyle = '#b18b54';
        ctx.beginPath(); ctx.ellipse(-7, -14 - bob, 4, 5, -.2, 0, 7); ctx.fill();
      }
    } else if (u.type === 'assassin') {
      ctx.fillStyle = '#23212c';
      ctx.beginPath(); ctx.arc(0, -29 - bob, 6.4, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#121118'; ctx.fillRect(-5.5, -29 - bob, 11, 5);
      ctx.fillStyle = '#d95645';
      ctx.beginPath(); ctx.arc(-2.2, -28 - bob, .9, 0, 7); ctx.arc(2.2, -28 - bob, .9, 0, 7); ctx.fill();
      const da = u.attackAnim > 0 ? -.9 : -.3;
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(s * 8, -16 - bob); ctx.rotate(da * s);
        ctx.strokeStyle = '#d9d2bd'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -7); ctx.stroke();
        ctx.strokeStyle = '#6d4e37'; ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(1, 0); ctx.stroke();
        ctx.restore();
      }
    } else if (u.type === 'shaman') {
      ctx.fillStyle = '#3d5545';
      ctx.beginPath(); ctx.arc(0, -30 - bob, 7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#b9b28f'; ctx.beginPath(); ctx.arc(0, -28 - bob, 4.8, 0, 7); ctx.fill();
      ctx.fillStyle = '#29392e'; ctx.beginPath(); ctx.arc(-1.6, -28 - bob, .9, 0, 7); ctx.arc(1.6, -28 - bob, .9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#73552f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(9, -5 - bob); ctx.lineTo(12, -37 - bob); ctx.stroke();
      ctx.shadowColor = 'rgba(118,230,145,.8)'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#8ce79c'; ctx.beginPath(); ctx.arc(12, -39 - bob, 4, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(67,151,83,.45)'; ctx.beginPath(); ctx.arc(12, -39 - bob, 6.5, 0, 7); ctx.fill();
    } else if (u.type === 'spearman') {
      ctx.strokeStyle = '#7b5a36'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, -12 - bob); ctx.lineTo(18, -43 - bob); ctx.stroke();
      ctx.fillStyle = '#d9d2bd';
      ctx.beginPath(); ctx.moveTo(18, -43 - bob); ctx.lineTo(14, -38 - bob); ctx.lineTo(20, -39 - bob); ctx.closePath(); ctx.fill();
    } else if (u.type === 'crossbowman') {
      ctx.strokeStyle = '#6b4d2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -19 - bob); ctx.lineTo(13, -19 - bob); ctx.stroke();
      ctx.strokeStyle = '#9b7b4d'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(12, -19 - bob, 8, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(225,215,188,.7)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(15, -26 - bob); ctx.lineTo(15, -12 - bob); ctx.stroke();
    } else if (u.type === 'halberdier') {
      ctx.fillStyle = '#c6a052';
      ctx.beginPath(); ctx.ellipse(-8, -29 - bob, 5, 4, -.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6f5232'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(8, -7 - bob); ctx.lineTo(19, -41 - bob); ctx.stroke();
      ctx.fillStyle = '#d7d1bd';
      ctx.beginPath(); ctx.moveTo(19, -41 - bob); ctx.lineTo(12, -35 - bob); ctx.lineTo(20, -37 - bob); ctx.lineTo(25, -31 - bob); ctx.lineTo(22, -41 - bob); ctx.closePath(); ctx.fill();
    } else if (u.type === 'priest') {
      ctx.fillStyle = '#e3d8bb';
      roundRect(ctx, -7, -23 - bob, 14, 17, 4); ctx.fill();
      ctx.fillStyle = '#c9a85a'; ctx.fillRect(-7, -12 - bob, 14, 3);
      ctx.fillStyle = '#efe6ce'; ctx.beginPath(); ctx.arc(0, -30 - bob, 6.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#8a6737'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(9, -5 - bob); ctx.lineTo(12, -38 - bob); ctx.stroke();
      ctx.shadowColor = 'rgba(255,220,130,.85)'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffe3a0'; ctx.beginPath(); ctx.arc(12, -40 - bob, 4, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (u.type === 'archer') {
      ctx.fillStyle = '#4d6238';
      ctx.beginPath(); ctx.arc(0, -29 - bob, 6, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#80603c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(8, -20 - bob, 9, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(225,215,188,.7)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(11, -27 - bob); ctx.lineTo(11, -13 - bob); ctx.stroke();
    } else {
      ctx.fillStyle = c.metal;
      ctx.beginPath(); ctx.arc(0, -29 - bob, 5.7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = c.metal; ctx.fillRect(-5, -31 - bob, 10, 2);
      // shield
      ctx.fillStyle = c.clothD;
      ctx.beginPath(); ctx.ellipse(-8, -17 - bob, 5.5, 7.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = c.trim; ctx.lineWidth = 1; ctx.stroke();
      // sword
      const ang = u.attackAnim > 0 ? -.9 : -.35;
      ctx.save(); ctx.translate(8, -18 - bob); ctx.rotate(ang);
      ctx.strokeStyle = '#d9d1bd'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, -8); ctx.stroke();
      ctx.strokeStyle = '#8a6a42'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-2, 1); ctx.lineTo(2, -2); ctx.stroke();
      ctx.restore();
    }
  }
  if (u.flash > 0) {
    ctx.fillStyle = `rgba(255,240,210,${u.flash * 2})`;
    ctx.beginPath(); ctx.arc(0, -20, 12, 0, 7); ctx.fill();
  }
  ctx.restore();

  if (u.hp < u.maxHp || S.selected.includes(u)) {
    const sx = p.x, sy = p.y - U[u.type].h - 10;
    const w = u.type === 'knight' || u.type === 'baseVehicle' ? 30 : 20;
    ctx.fillStyle = 'rgba(10,8,6,.82)'; ctx.fillRect(sx - w / 2, sy, w, 3);
    ctx.fillStyle = u.team === PLAYER ? '#cf634b' : u.team === ALLY ? '#5f9e7f' : '#8d87a3';
    ctx.fillRect(sx - w / 2 + 1, sy + 1, (w - 2) * clamp(u.hp / u.maxHp, 0, 1), 1.5);
  }
  if (u.team === PLAYER && u.rank > 1) {
    const bx = p.x, by = p.y - U[u.type].h - 15;
    ctx.strokeStyle = '#f2cf7d'; ctx.lineWidth = 1.4;
    for (let i = 0; i < u.rank - 1; i++) {
      ctx.beginPath();
      ctx.moveTo(bx - 4 + i * 5, by); ctx.lineTo(bx, by + 3); ctx.lineTo(bx + 4 + i * 5, by);
      ctx.stroke();
    }
  }
}
function drawBuildRadius() {
  if (!S.placing) return;
  const d = B[S.placing.type];
  const cx = S.placing.tx + d.w / 2, cy = S.placing.ty + d.d / 2;
  let near = null, nd = Infinity;
  for (const b of S.buildings) {
    if (b.team !== PLAYER || b.constructed === false || b.hp <= 0) continue;
    const dist2 = Math.hypot(b.x - cx, b.y - cy);
    if (dist2 < nd) { nd = dist2; near = b; }
  }
  if (!near) return;
  const p = mapPos(near.x, near.y);
  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = S.placing.valid ? 'rgba(232,205,139,.5)' : 'rgba(220,124,99,.55)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, BUILD_RADIUS * HW, BUILD_RADIUS * HH, 0, 0, 7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,205,139,.55)';
  ctx.font = '10px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('建造范围', p.x, p.y + 4);
  ctx.restore();
}
function drawRings(now) {
  for (const u of S.selected) {
    if (u.hp <= 0) continue;
    const p = mapPos(u.x, u.y);
    ctx.strokeStyle = 'rgba(241,207,130,.9)'; ctx.lineWidth = 1.2;
    const rw = u.type === 'baseVehicle' ? 23 : 13;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, rw, u.type === 'baseVehicle' ? 11 : 6.5, 0, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (S.selectedBuilding) {
    const b = S.selectedBuilding;
    const p = mapPos(b.x, b.y);
    ctx.strokeStyle = 'rgba(241,207,130,.85)'; ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    const A = mapPos(b.tx, b.ty), Bp = mapPos(b.tx + b.w, b.ty), C = mapPos(b.tx + b.w, b.ty + b.d), D = mapPos(b.tx, b.ty + b.d);
    ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(Bp.x, Bp.y); ctx.lineTo(C.x, C.y); ctx.lineTo(D.x, D.y); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    if (B[b.type].attack) {
      ctx.strokeStyle = 'rgba(219,184,111,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, B[b.type].attack.range * HW * 1.25, B[b.type].attack.range * HH * 1.25, 0, 0, 7); ctx.stroke();
    }
  }
  if (S.superAim && S.mouse.inside) {
    const w = screenToWorld(S.mouse.x, S.mouse.y);
    const p = mapPos(w.x, w.y);
    ctx.fillStyle = 'rgba(240,150,63,.12)';
    ctx.strokeStyle = 'rgba(255,203,112,.85)';
    ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.6 * HW, 4.6 * HH, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,214,128,.8)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 7); ctx.fill();
  }
}
function drawRallyPoints() {
  for (const b of S.buildings) {
    if (!isProducer(b) || !b.rally) continue;
    const p = mapPos(b.rally.x, b.rally.y);
    const q = mapPos(b.x, b.y);
    ctx.save();
    ctx.globalAlpha = S.selectedBuilding === b ? 1 : .45;
    ctx.strokeStyle = 'rgba(240,204,128,.65)'; ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 8, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5a4128'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 27); ctx.stroke();
    ctx.fillStyle = '#c6533d'; ctx.beginPath();
    ctx.moveTo(p.x + 1, p.y - 27); ctx.lineTo(p.x + 17, p.y - 22); ctx.lineTo(p.x + 1, p.y - 17); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#f2d391'; ctx.beginPath(); ctx.arc(p.x, p.y - 28, 2, 0, 7); ctx.fill();
    ctx.restore();
  }
}
function drawSuperFx() {
  for (const f of S.superFx) {
    const k = clamp(f.t / f.dur, 0, 1);
    const p = mapPos(f.x, f.y);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    const beam = ctx.createLinearGradient(0, p.y - 250, 0, p.y + 6);
    beam.addColorStop(0, 'rgba(255,226,150,0)');
    beam.addColorStop(.55, 'rgba(255,190,91,.32)');
    beam.addColorStop(1, 'rgba(255,235,179,.7)');
    ctx.fillStyle = beam; ctx.fillRect(p.x - 16, p.y - 250, 32, 256);
    ctx.strokeStyle = 'rgba(255,201,106,.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.6 * HW * (.2 + k * 1.2), 4.6 * HH * (.2 + k * 1.2), 0, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,184,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 4.6 * HW * (.1 + k * .7), 4.6 * HH * (.1 + k * .7), 0, 0, 7); ctx.stroke();
    ctx.restore();
  }
}
function drawProjectiles() {
  for (const p of S.projs) {
    const s = mapPos(p.sx, p.sy), e = mapPos(p.tx, p.ty);
    const t = clamp(p.t, 0, 1);
    const x = lerp(s.x, e.x, t), y = lerp(s.y, e.y, t) - Math.sin(Math.PI * t) * p.arc - p.sz * (1 - t);
    const t2 = clamp(t - .04, 0, 1);
    const x2 = lerp(s.x, e.x, t2), y2 = lerp(s.y, e.y, t2) - Math.sin(Math.PI * t2) * p.arc - p.sz * (1 - t2);
    const ang = Math.atan2(y - y2, x - x2);
    if (p.boulder) {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.ellipse(0, p.sz * .85 + 8, 7, 3, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6d6250'; ctx.strokeStyle = '#463d31'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8b7d65'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 2, 0, 7); ctx.fill();
      ctx.restore();
      continue;
    }
    if (p.magic) {
      const holy = p.holy;
      ctx.save(); ctx.translate(x, y);
      ctx.shadowColor = holy ? 'rgba(255,224,140,.9)' : 'rgba(125,235,154,.85)'; ctx.shadowBlur = 10;
      ctx.fillStyle = holy ? '#ffe7a6' : '#9bea9f'; ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 7); ctx.fill();
      ctx.fillStyle = holy ? 'rgba(219,172,75,.5)' : 'rgba(63,155,83,.55)'; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill();
      ctx.restore();
      continue;
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = '#d9c79e'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.fillStyle = '#efe1bf'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(1, -2); ctx.lineTo(1, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
function drawParticles() {
  for (const p of S.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.type === 'smoke') {
      ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${.24 * a})`);
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size, 0, 7); ctx.fill();
    } else if (p.type === 'fire') {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size * (.5 + a * .5), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  for (const f of S.floats) {
    const a = clamp(f.life / 1.25, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.font = '600 11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(f.text, f.x, f.y - 16);
    ctx.globalAlpha = 1;
  }
}
function visionRadiusOf(o) {
  return o.kind === 'building' ? (VISION_B[o.type] || 8) : (VISION_U[o.type] || 6.5);
}
function playerVisionSources() {
  const out = [];
  for (const u of S.units) {
    if (u.team !== ENEMY && u.hp > 0 && !u.garrisoned) out.push(u);
  }
  for (const b of S.buildings) {
    if (b.team !== ENEMY && b.hp > 0) out.push(b);
  }
  return out;
}
function isVisibleToPlayer(x, y) {
  if (S.radar) return true;
  for (const s of playerVisionSources()) {
    const r = visionRadiusOf(s);
    if (Math.hypot(x - s.x, y - s.y) <= r) return true;
  }
  return false;
}
function drawFog() {
  if (S.mode === 'menu' || !S.mapCanvas) return;
  const fw = Math.max(1, Math.floor(VW * DPR)), fh = Math.max(1, Math.floor(VH * DPR));
  if (fogCanvas.width !== fw || fogCanvas.height !== fh) {
    fogCanvas.width = fw; fogCanvas.height = fh;
  }
  fogCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  fogCtx.globalCompositeOperation = 'source-over';
  fogCtx.clearRect(0, 0, VW, VH);
  if (S.radar) return;
  fogCtx.fillStyle = 'rgba(4,6,9,.94)';
  fogCtx.fillRect(0, 0, VW, VH);
  fogCtx.globalCompositeOperation = 'destination-out';
  for (const s of playerVisionSources()) {
    const p = worldToScreen(s.x, s.y);
    const r = visionRadiusOf(s) * 32 * S.cam.z;
    if (p.x < -r || p.x > VW + r || p.y < -r || p.y > VH + r) continue;
    const g = fogCtx.createRadialGradient(p.x, p.y, r * .22, p.x, p.y, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(.68, 'rgba(0,0,0,.98)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = g;
    fogCtx.beginPath(); fogCtx.arc(p.x, p.y, r, 0, 7); fogCtx.fill();
  }
  fogCtx.globalCompositeOperation = 'source-over';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(fogCanvas, 0, 0, VW, VH);
}
function render(now) {
  if (!S.mapCanvas) return;
  const t = now / 1000;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, VW, VH);
  ctx.fillStyle = '#0a0c08'; ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(DPR * S.cam.z, 0, 0, DPR * S.cam.z, DPR * S.cam.x, DPR * S.cam.y);
  // 只绘制视口覆盖的地面区域，避免每帧缩放整张地图
  const wx1 = clamp((-S.cam.x) / S.cam.z - 4, 0, MAP_PX_W);
  const wy1 = clamp((-S.cam.y) / S.cam.z - 4, 0, MAP_PX_H);
  const wx2 = clamp((VW - S.cam.x) / S.cam.z + 4, 0, MAP_PX_W);
  const wy2 = clamp((VH - S.cam.y) / S.cam.z + 4, 0, MAP_PX_H);
  if (wx2 > wx1 && wy2 > wy1) {
    ctx.drawImage(S.mapCanvas, wx1, wy1, wx2 - wx1, wy2 - wy1, wx1, wy1, wx2 - wx1, wy2 - wy1);
  }

  // ambient light patches
  const gp = mapPos(24, 24);
  const grd = ctx.createRadialGradient(gp.x, gp.y, 30, gp.x, gp.y, 650);
  grd.addColorStop(0, 'rgba(248,220,150,.07)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd; ctx.fillRect(gp.x - 700, gp.y - 700, 1400, 1400);

  drawRings(t);

  const list = [];
  for (const tr of S.trees) list.push({ sort: tr.y, draw: () => drawTree(tr, t), x: tr.x, y: tr.y });
  for (const pr of S.props) list.push({ sort: pr.y, draw: () => drawProp(pr, t), x: pr.x, y: pr.y });
  for (const g of S.goldNodes) list.push({ sort: g.y, draw: () => drawGold(g, t), x: g.x, y: g.y });
  for (const c of S.crates) list.push({ sort: c.y, draw: () => drawCrate(c, t), x: c.x, y: c.y });
  for (const b of S.buildings) {
    if (b.team === ENEMY && !isVisibleToPlayer(b.x, b.y)) continue;
    list.push({ sort: b.ty + b.d, draw: () => drawBuilding(b, t), x: b.x, y: b.y });
  }
  for (const u of S.units) {
    if (u.garrisoned) continue;
    if (u.team === ENEMY && !isVisibleToPlayer(u.x, u.y)) continue;
    list.push({ sort: u.y, draw: () => drawUnit(u, t), x: u.x, y: u.y });
  }
  list.sort((a, b) => a.sort - b.sort);
  for (const o of list) {
    const p = worldToScreen(o.x, o.y);
    if (p.x < -240 || p.x > VW + 240 || p.y < -260 || p.y > VH + 280) continue;
    o.draw();
  }

  // building placement ghost
  if (S.placing) {
    drawBuildRadius();
    const d = B[S.placing.type];
    const fake = { type: S.placing.type, team: PLAYER, x: S.placing.tx + d.w / 2, y: S.placing.ty + d.d / 2, phase: 0, hp: 1, maxHp: 1 };
    drawBuilding(fake, t, true);
  }

  drawRallyPoints();
  drawSuperFx();
  drawProjectiles();
  drawParticles();
  drawFog();
  // selection rectangle
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (S.drag && S.drag.active) {
    const x = Math.min(S.drag.sx, S.mouse.x), y = Math.min(S.drag.sy, S.mouse.y);
    const w = Math.abs(S.mouse.x - S.drag.sx), h = Math.abs(S.mouse.y - S.drag.sy);
    ctx.fillStyle = 'rgba(223,193,123,.08)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(231,203,139,.7)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w, h);
  }
}

/* ------------- UI ------------- */
/* ===== 9. UI & INPUT ===== */
const els = {
  gold: $('#gold-value'), pop: $('#pop-value'), army: $('#army-value'),
  wave: $('#wave-timer'), waveChip: $('#wave-chip'),
  tabs: $('#command-tabs'), grid: $('#command-grid'), queue: $('#command-queue'),
  selEmpty: $('#selection-empty'), selContent: $('#selection-content'),
  tip: $('#tooltip'), cursorTip: $('#cursor-tip'),
  superBtn: $('#btn-super'), superCd: $('#super-cd'),
  toasts: $('#toasts'), banner: $('#wave-banner'), bannerTitle: $('#wave-banner-title')
};
function icon(id) { return `<svg><use href="#i-${id}"></use></svg>`; }

function renderTabs() {
  $$('#command-tabs .tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === S.tab));
}
function cardDef(key) {
  if (B[key]) return { type: 'building', def: B[key], key };
  if (TECH[key]) return { type: 'tech', def: TECH[key], key };
  return { type: 'unit', def: U[key], key };
}
const SUPER_BUILDINGS = new Set(['sunAltar', 'stormSpire', 'plagueWell']);
function isSuperKey(key) {
  return (TECH[key] && TECH[key].isSuper) || SUPER_BUILDINGS.has(key);
}
function renderCards() {
  const all = TABS[S.tab];
  const keys = all.filter(k => {
    if (isSuperKey(k)) {
      if (!S.supersEnabled) return false;
      if (!factionSuperMatch(k)) return false;
    }
    return TECH[k] ? true : isUnlocked(k);
  });
  if (!keys.length) {
    const next = currentLevel().rewardName;
    els.grid.innerHTML = `<div class="cmd-locked"><b>工事尚未解锁</b><span>${next ? `通关本章解锁：${next}` : '继续推进战役'}</span></div>`;
    updateCards();
    return;
  }
  els.grid.innerHTML = keys.map((key, i) => {
    const c = cardDef(key);
    const def = c.def;
    const cost = def.cost;
    const hi = all.indexOf(key);
    return `<button class="cmd-card" data-key="${key}" data-index="${i}">
      <span class="hotkey">${HOTKEYS[hi] || ''}</span>
      ${c.type === 'tech' ? `<span class="cmd-tier">${def.tier}</span>` : (c.type === 'building' ? `<span class="cmd-tier">T${buildingTier(key)}</span>` : '')}
      <svg class="cmd-icon"><use href="#i-${def.icon || key}"></use></svg>
      <span class="cmd-name">${def.name}</span>
      <span class="cmd-cost cost-gold"><i></i>${cost}</span>
      ${c.type === 'unit' && def.pop > 0 ? `<span class="queue-badge" style="display:none">${def.pop}</span>` : ''}
    </button>`;
  }).join('');
  els.grid.style.gridTemplateColumns = `repeat(${Math.min(4, keys.length)}, 1fr)`;
  $$('.cmd-card', els.grid).forEach(btn => {
    const key = btn.dataset.key;
    btn.addEventListener('click', (e) => onCard(key, e));
    btn.addEventListener('contextmenu', (e) => {
      if (B[key]) { e.preventDefault(); cancelBuild(key); }
      else if (U[key]) { e.preventDefault(); cancelTrain(key); }
    });
    btn.addEventListener('mouseenter', () => showTooltip(key, btn));
    btn.addEventListener('mouseleave', hideTooltip);
  });
  updateCards();
}
function updateCards() {
  if (!els.grid) return;
  $$('.cmd-card', els.grid).forEach(btn => {
    const key = btn.dataset.key;
    let unavailable = false;
    if (TECH[key]) {
      const t = TECH[key];
      const noTechBuilding = !techBuildingReady(t);
      const otherSuper = t.isSuper && S.superKey && S.superKey !== t.superKey;
      unavailable = !!S.tech[key] || S.gold < t.cost || !!(t.req && !S.tech[t.req]) || noTechBuilding || otherSuper;
      btn.classList.toggle('researched', !!S.tech[key]);
    } else if (B[key]) {
      const q = S.buildQ;
      const isReady = !!(q && q.cur && q.cur.ready && q.cur.type === key);
      unavailable = !isReady && (S.gold < B[key].cost || !buildingTierUnlocked(key));
      btn.classList.toggle('ready', isReady);
      btn.classList.toggle('active', !!(S.placing && S.placing.type === key));
    } else {
      const pro = producerFor(key);
      unavailable = !pro || S.gold < U[key].cost || popUsed() + U[key].pop > popCap();
      if (U[key].req && !playerHasBuilding(U[key].req)) unavailable = true;
      if (U[key].hero && (heroAlive() || heroInProduction())) unavailable = true;
    }
    btn.classList.toggle('unavailable', unavailable && !btn.classList.contains('active'));
  });
}
function showTooltip(key, btn) {
  if (!els.tip) return;
  const c = cardDef(key), def = c.def;
  const hotkey = HOTKEYS[TABS[S.tab].indexOf(key)];
  if (c.type === 'tech') {
    const req = def.req && !S.tech[def.req] ? `需要先研究：${TECH[def.req].name}` : '';
    const buildKey = techBuildingKey(def);
    const buildReq = buildKey && !playerHasBuilding(buildKey)
      ? `需要先建造${def.isSuper ? ' T3 ' : ' '}「${B[buildKey].name}」`
      : '';
    const superReq = def.isSuper && S.superKey && S.superKey !== def.superKey ? '已选择其他超级武器' : '';
    els.tip.innerHTML = `<h4>${def.tier} · ${def.name}</h4>
      <div class="tt-sub">${def.isSuper ? '超级武器 · 选择后本局固定' : '科技研究 · 永久生效'}</div>
      <p>${def.desc}</p>
      <div class="tt-cost"><span class="${S.gold < def.cost ? 'lack' : ''}">◈ ${def.cost} 金币</span></div>
      ${req ? `<div class="tt-warn">● ${req}</div>` : ''}
      ${buildReq ? `<div class="tt-warn">● ${buildReq}</div>` : ''}
      ${superReq ? `<div class="tt-warn">● ${superReq}</div>` : ''}
      <div class="tt-hotkey">快捷键 ${hotkey}</div>`;
    els.tip.hidden = false;
    const r = btn.getBoundingClientRect();
    let left = r.left - 250, top = r.top - 20;
    if (left < 10) left = r.right + 12;
    top = clamp(top, 84, VH - 220);
    els.tip.style.left = left + 'px'; els.tip.style.top = top + 'px';
    return;
  }
  const cost = def.cost;
  const req = c.type === 'unit' && !producerFor(key) ? `需要${B[U[key].producer].name}` : '';
  const heroReq = c.type === 'unit' && U[key].req && !playerHasBuilding(U[key].req) ? `需要先建成「${B[U[key].req].name}」（T3）` : '';
  const buildHint = c.type === 'building' ? '点击加入建造队列，完成后点击卡片放置' : '';
  const tierReq = c.type === 'building' && !buildingTierUnlocked(key)
    ? `需要先建造 T${buildingTier(key) - 1}「${B[tierRequirement(key)].name}」` : '';
  const tierLabel = c.type === 'building' ? `T${buildingTier(key)} 建筑` : def.role;
  els.tip.innerHTML = `<h4>${def.name}</h4>
    <div class="tt-sub">${tierLabel} · ${c.type === 'building' ? `占地 ${def.w}×${def.d}` : def.pop ? `人口 ${def.pop}` : '不占人口'}</div>
    <p>${def.desc}</p>
    <div class="tt-cost"><span class="${S.gold < cost ? 'lack' : ''}">◈ ${cost} 金币</span>${c.type === 'unit' ? `<span>训练 ${def.time}s</span>` : ''}</div>
    ${req ? `<div class="tt-warn">● ${req}</div>` : ''}
    ${tierReq ? `<div class="tt-warn">● ${tierReq}</div>` : ''}
    ${heroReq ? `<div class="tt-warn">● ${heroReq}</div>` : ''}
    ${buildHint ? `<div class="tt-sub" style="margin-top:6px">${buildHint}</div>` : ''}
    <div class="tt-hotkey">快捷键 ${hotkey}</div>`;
  els.tip.hidden = false;
  const r = btn.getBoundingClientRect();
  let left = r.left - 250, top = r.top - 20;
  if (left < 10) left = r.right + 12;
  top = clamp(top, 84, VH - 220);
  els.tip.style.left = left + 'px'; els.tip.style.top = top + 'px';
}
function hideTooltip() { if (els.tip) els.tip.hidden = true; }
function onCard(key, ev) {
  if (S.mode !== 'playing' || S.paused) return;
  if (TECH[key]) { researchTech(key); return; }
  if (!isUnlocked(key)) { toast('该军备尚未解锁，通关章节后获得', 'warn', 'scroll'); Sound.play('ui'); return; }
  if (B[key]) queueBuilding(key);
  else tryTrain(key, ev && ev.shiftKey ? 5 : 1);
}
function researchTech(key) {
  if (S.mode !== 'playing' || S.paused) return;
  const t = TECH[key];
if (t && t.isSuper && !factionSuperMatch(key)) {
    toast(`本阵营没有该超级武器（${factionOf().name} 专属：${SUPERS[factionOf().super].name}）`, 'warn', 'scroll');
    Sound.play('ui');
    return;
  }
  if (!t || S.tech[key]) { toast('该科技已完成', '', 'scroll'); return; }
  const buildKey = techBuildingKey(t);
  if (buildKey && !playerHasBuilding(buildKey)) {
    toast(`需要先建造${t.isSuper ? ' T3 ' : ' '}「${B[buildKey].name}」才能${t.isSuper ? '选择该超级武器' : '研究该科技'}`, 'warn', 'castle');
    Sound.play('ui'); return;
  }
  if (t.isSuper) {
    if (S.superKey && S.superKey !== t.superKey) {
      toast('本局已经选择另一种超级武器；超武只能选择一种', 'warn', 'scroll');
      Sound.play('ui'); return;
    }
  }
  if (t.req && !S.tech[t.req]) {
    toast(`需要先研究「${TECH[t.req].name}」`, 'warn', 'scroll'); Sound.play('ui'); return;
  }
  if (S.gold < t.cost) { toast('金币不足', 'warn', 'coin'); Sound.play('ui'); return; }
  S.gold -= t.cost;
  S.tech[key] = true;
  if (t.isSuper) {
    S.superKey = t.superKey;
    S.superCd = 0;
    updateSuperUI();
    toast(`超级武器已选定 · ${t.name}：点击右下角面板释放`, 'warn', t.icon);
  }
  if (key === 'plate') scalePlayerHp(1.2);
  if (key === 'royal') scalePlayerHp(1.2, u => u.type === 'knight' || u.type === 'hero');
  toast(`科技完成 · ${t.name}`, '', 'scroll');
  Sound.play('horn');
  updateHud(true); renderCards(); updateSelectionPanel(true);
}
function armMini() {
  if (S.mode !== 'playing' || S.paused) return;
  if (!playerHasBuilding('drumTower')) { toast('需要先建造战鼓台（T2）', 'warn', 'flag'); Sound.play('ui'); return; }
  if (S.miniCd > 0) { toast(`战鼓冷却中：${Math.ceil(S.miniCd)} 秒`, 'warn', 'flag'); Sound.play('ui'); return; }
  S.placing = null; S.superAim = false;
  S.miniAim = !S.miniAim;
  canvas.style.cursor = S.miniAim ? 'crosshair' : 'default';
  updateSuperUI();
  toast(S.miniAim ? '战鼓号令：左键选择范围（右键取消）' : '已取消战鼓号令', '', 'flag');
}
function applyMiniAt(x, y) {
  const radius = B.drumTower.miniRadius;
  let allies = 0, enemies = 0;
  for (const u of S.units) {
    if (u.hp <= 0 || u.garrisoned) continue;
    if (Math.hypot(u.x - x, u.y - y) > radius) continue;
    if (u.team === PLAYER) {
      u.buffT = 12; u.buffSpd = 1.3; u.buffDmg = 1.2; allies++;
      particle(u.x, u.y, { vx: rnd(-3, 3), vy: -12, z: 18, vz: 12, g: -2, life: .7, size: 2.2, color: '#ffd77a', type: 'spark' });
    } else if (u.team === ENEMY) {
      u.buffT = 12; u.buffSpd = .7; u.buffDmg = .8; enemies++;
      particle(u.x, u.y, { vx: rnd(-3, 3), vy: 10, z: 18, vz: -4, g: 2, life: .7, size: 2.2, color: '#8f7bd6', type: 'spark' });
    }
  }
  S.miniCd = B.drumTower.miniCd;
  S.miniAim = false;
  canvas.style.cursor = 'default';
  burst(x, y, 'gold', 18);
  toast(`战鼓号令：${allies} 名友军增益${enemies ? `，${enemies} 名敌军减益` : ''}`, '', 'flag');
  Sound.play('horn');
  updateSuperUI();
}
function updateMiniUI() {
  const hud = document.getElementById('mini-hud');
  if (!hud) return;
  const has = playerHasBuilding('drumTower');
  hud.hidden = !has;
  if (!has) return;
  hud.classList.toggle('cooling', S.miniCd > 0);
  hud.classList.toggle('ready', S.miniCd <= 0);
  const v = hud.querySelector('.sh-val');
  if (v) v.textContent = S.miniCd > 0 ? Math.ceil(S.miniCd) + 's' : (S.miniAim ? '选点' : '就绪');
  const bar = hud.querySelector('.sh-bar i');
  if (bar) bar.style.width = S.miniCd > 0 ? clamp((1 - S.miniCd / B.drumTower.miniCd) * 100, 0, 100) + '%' : '100%';
}
function updateSuperUI() {
  const btn = els.superBtn;
  if (btn) btn.hidden = true;
  updateMiniUI();
  const hud = $('#super-hud');
  const sup = selectedSuper();
  const show = !!sup && S.supersEnabled;
  if (!hud) return;
  hud.hidden = !show;
  if (!show) return;
  const cooling = S.superCd > 0;
  hud.classList.toggle('cooling', cooling);
  hud.classList.toggle('ready', !cooling);
  hud.classList.toggle('aiming', !!S.superAim);
  const useEl = hud.querySelector('use');
  if (useEl) useEl.setAttribute('href', `#i-${sup.icon}`);
  const nameEl = hud.querySelector('.sh-name');
  if (nameEl) nameEl.textContent = sup.name;
  const valEl = hud.querySelector('.sh-val');
  if (valEl) valEl.textContent = cooling ? Math.ceil(S.superCd) + 's' : (S.superAim ? '选点' : '就绪');
  const barEl = hud.querySelector('.sh-bar i');
  if (barEl) {
    const total = Math.max(1, sup.cd || 60);
    barEl.style.width = cooling ? clamp((1 - S.superCd / total) * 100, 0, 100) + '%' : '100%';
  }
  const hintEl = hud.querySelector('.sh-hint');
  if (hintEl) hintEl.textContent = cooling ? '充能中' : (S.superAim ? '左键选点 · 右键取消' : '点击释放');
  updateMiniUI();
}
function armSuper() {
  if (S.mode !== 'playing' || S.paused) return;
  const sup = selectedSuper();
  if (!sup) { toast('需要先建造对应的 T3 超武建筑，并在科技栏选择超级武器', 'warn', 'scroll'); Sound.play('ui'); return; }
  if (S.superCd > 0) { toast(`${sup.name}冷却中：${Math.ceil(S.superCd)} 秒`, 'warn', sup.icon); Sound.play('ui'); return; }
  S.placing = null; S.drag = null;
  S.superAim = !S.superAim;
  canvas.style.cursor = S.superAim ? 'crosshair' : 'default';
  updateSuperUI();
  toast(S.superAim ? `${sup.name}：左键选择落点（右键取消）` : `已取消${sup.name}瞄准`, '', sup.icon);
  Sound.play('ui');
}
function applySuperAt(key, x, y, caster) {
  const sup = SUPERS[key];
  if (!sup) return 0;
  let hits = 0;
  for (const e of [...S.units]) {
    if (e.hp <= 0 || e.garrisoned || isFriendlyTeam(e.team, caster)) continue;
    if (Math.hypot(e.x - x, e.y - y) > sup.radius) continue;
    damage(e, sup.unitDmg, null);
    if (key === 'storm') e.stunT = 1.5;
    if (key === 'plague') e.slowT = 6;
    hits++;
  }
  for (const b of [...S.buildings]) {
    if (b.hp <= 0 || b.dead || isFriendlyTeam(b.team, caster)) continue;
    if (Math.hypot(b.x - x, b.y - y) > sup.radius + 1) continue;
    damage(b, sup.buildDmg, null); hits++;
  }
  burst(x, y, 'fire', 36); burst(x, y, 'dust', 30); burst(x, y, 'spark', 26);
  S.superFx.push({ x, y, t: 0, dur: 1.8, kind: key });
  return hits;
}
function castSuperAt(sx, sy) {
  const sup = selectedSuper();
  if (!sup) return;
  const w = screenToWorld(sx, sy);
  S.superAim = false; S.superCd = sup.cd;
  const hits = applySuperAt(S.superKey, w.x, w.y, PLAYER);
  floatText(w.x, w.y - 1, sup.name, sup.color);
  Sound.play('boom'); Sound.play('horn');
  canvas.style.cursor = 'default';
  updateSuperUI(); updateHud(true);
  toast(hits ? `${sup.name}命中 ${hits} 个目标` : `${sup.name}落下，但未命中目标`, 'warn', sup.icon);
}
function renderQueue() {
  if (!els.queue) return;
  const labels = { keep: '主堡', barracks: '兵营', workshop: '车厂' };
  const rows = [];
  for (const cat of ['barracks', 'workshop', 'keep']) {
    const line = S.prod[cat];
    if (!line || !line.cur) continue;
    const pct = clamp(line.cur.elapsed / line.cur.total, 0, 1) * 100;
    const sp = trainingSpeedFor(cat);
    const q = line.queue.length;
    rows.push(`<div class="queue-line"><span class="queue-label">${labels[cat]} · ${U[line.cur.type].name}${q ? ` +${q}` : ''}${sp > 1 ? ` · ×${sp.toFixed(1)}` : ''}</span><div class="queue-pip"><i style="width:${pct}%"></i></div><span class="queue-pct">${Math.floor(pct)}%</span></div>`);
  }
  const bq = S.buildQ && S.buildQ.cur;
  if (bq) {
    const pct = clamp(bq.elapsed / bq.total, 0, 1) * 100;
    const more = S.buildQ.queue.length;
    rows.unshift(`<div class="queue-line"><span class="queue-label">建造 · ${B[bq.type].name}${bq.ready ? ' · 就绪' : ''}${more ? ` +${more}` : ''}</span><div class="queue-pip"><i style="width:${pct}%"></i></div><span class="queue-pct">${bq.ready ? '就绪' : Math.floor(pct) + '%'}</span></div>`);
  }
  els.queue.innerHTML = rows.length ? rows.join('') : `<div class="queue-line"><span class="queue-label">产线空闲</span></div>`;
}
function updateHud(force = false) {
  if (!els.gold) return;
  const g = Math.floor(S.gold), p = popUsed(), cap = popCap(), a = armyCount();
  if (force || els.gold.textContent != g) els.gold.textContent = g;
  if (force || els.pop.textContent != `${p}/${cap}`) els.pop.textContent = `${p}/${cap}`;
  if (force || els.army.textContent != a) els.army.textContent = a;
  if (els.wave) {
    els.wave.textContent = fmtTime(S.wave.timer);
    els.waveChip.classList.toggle('urgent', S.wave.timer < 12);
  }
  if (window.__dbgUpdate) window.__dbgUpdate();
}
function selectionSignature() {
  const hero = S.selected.length === 1 && S.selected[0].type === 'hero' ? ':' + Math.ceil(S.selected[0].cleaveCd || 0) : '';
  return S.selected.map(u => `${u.id}:${Math.ceil(u.hp)}:${u.rank}:${Math.ceil(u.xp)}`).join(',')
    + '|' + (S.selectedBuilding ? `${S.selectedBuilding.id}:${Math.ceil(S.selectedBuilding.hp)}:${S.selectedBuilding.garrison?.length || 0}:${S.selectedBuilding.constructed === false ? Math.round((S.selectedBuilding.progress || 0) * 100) : 'done'}` : '')
    + '|' + (S.inspect ? (S.inspect.id + ':' + Math.ceil(S.inspect.hp || 0)) : '') + hero;
}
function updateSelectionPanel(force = false) {
  if (!els.selEmpty) return;
  const sig = selectionSignature();
  if (!force && sig === S.selSig) return;
  S.selSig = sig;
  if (!S.selected.length && !S.selectedBuilding && !S.inspect) {
    els.selEmpty.hidden = false; els.selContent.hidden = true;
    return;
  }
  els.selEmpty.hidden = true; els.selContent.hidden = false;
  if (S.selected.length) {
    const units = S.selected.filter(u => u.hp > 0);
    if (!units.length) { S.selected = []; updateSelectionPanel(true); return; }
    if (units.length === 1) {
      const u = units[0], def = U[u.type];
      const hp = Math.ceil(u.hp / u.maxHp * 100);
      const status = u.order?.type === 'gather' ? (u.carrying ? '运送金币' : '采集金币') : u.target ? '交战中' : u.moving ? '行军中' : '待命';
      els.selContent.innerHTML = `<div class="sel-top">
        <div class="sel-icon">${icon(def.icon)}</div>
        <div class="sel-title"><strong>${uname(u)}</strong><span>${def.role} · ${status}</span></div>
      </div>
      <div class="sel-hp"><i style="width:${hp}%"></i><span>${Math.ceil(u.hp)} / ${u.maxHp}</span></div>
      <div class="sel-meta"><em>攻击 ${def.dmg}</em><em>射程 ${def.range}</em><em>速度 ${def.speed}</em>${u.type === 'peasant' ? `<em>${u.carrying ? '携带 ' + u.carrying + ' 金币' : '采集中'}</em>` : ''}</div>${u.militiaT > 0 ? `<div class="sel-extra"><b>民兵</b><span>剩余 ${Math.ceil(u.militiaT)} 秒 · 征召期间不采集</span></div>` : ''}${u.type === 'hero' ? `<div class="sel-extra"><b>裂地斩</b><span>${u.cleaveCd > 0 ? `冷却 ${u.cleaveCd.toFixed(1)}s` : '就绪'} · 脱战 5 秒后自愈</span></div>` : ''}${u.type === 'baseVehicle' ? `<div class="sel-extra"><b>移动基地</b><span>开到 3×3 的空地，点击下方按钮展开为主堡</span></div><div class="sel-actions"><button class="sel-act" data-unit-action="deploy">部署为基地</button></div>` : ''}
      <div class="sel-extra"><b>战功 · ${RANKS[u.rank]}</b><span>${u.kills} 次击杀${u.rank < 3 ? ` · ${Math.ceil(u.xp)}/${u.rank === 1 ? 100 : 260} 经验` : ' · 已达最高军衔'}</span></div>`;
    } else {
      const groups = {};
      for (const u of units) groups[u.type] = (groups[u.type] || 0) + 1;
      const chips = Object.entries(groups).map(([type, n]) => `<span class="group-chip" title="${U[type].name}">${icon(U[type].icon)}<b>${n}</b></span>`).join('');
      const avg = Math.round(units.reduce((s, u) => s + u.hp / u.maxHp, 0) / units.length * 100);
      els.selContent.innerHTML = `<div class="sel-top">
        <div class="sel-icon">${icon('shield')}</div>
        <div class="sel-title"><strong>赤蔷薇军团</strong><span>${units.length} 支部队 · 左键指挥</span></div>
      </div>
      <div class="sel-hp"><i style="width:${avg}%"></i><span>平均 ${avg}%</span></div>
      <div class="sel-group">${chips}</div>`;
    }
  } else if (S.selectedBuilding) {
    const b = S.selectedBuilding;
    const def = B[b.type];
    const repairCost = Math.ceil((b.maxHp - b.hp) * .6);
    const sellValue = Math.round((def.cost || 0) * .6);
    els.selContent.innerHTML = `<div class="sel-top">
      <div class="sel-icon">${icon(def.icon || b.type)}</div>
      <div class="sel-title"><strong>${bname(b)}</strong><span>我方建筑 · ${b.constructed === false ? '建造中' : def.attack ? '自动射击' : def.dropoff ? '资源存放点' : def.produces ? '训练建筑' : def.pop ? '人口与后勤' : '防御工事'}</span></div>
    </div>
    <div class="sel-hp"><i style="width:${clamp(b.hp / b.maxHp * 100, 0, 100)}%"></i><span>${Math.ceil(b.hp)} / ${b.maxHp}</span></div>
    ${b.constructed === false ? `<div class="sel-extra"><b>建造进度</b><span>${Math.round((b.progress || 0) * 100)}% · 剩余约 ${Math.max(1, Math.ceil((1 - (b.progress || 0)) * (BUILD_TIME[b.type] || 4)))} 秒</span></div>` : ''}
    <div class="sel-meta">${b.constructed === false ? '<em>建造中 · 功能未启用</em>' : `${def.attack ? `<em>射程 ${def.attack.range}</em><em>伤害 ${def.attack.dmg}</em>` : ''}${def.produces ? `<em>可训练 ${def.produces.slice(0, 3).map(t => U[t].name).join(' · ')} 等 ${def.produces.length} 种</em>` : ''}${def.pop ? `<em>人口 +${def.pop}</em>` : ''}${def.dropoff ? '<em>金币交付点</em>' : ''}`}</div>
    ${def.garrison ? `<div class="sel-extra"><b>驻军</b><span>${b.garrison.length}/${def.garrison} 名步兵 · 弓手会从窗口射击</span></div>` : ''}
    ${isProducer(b) ? `<div class="sel-extra"><b>集结点</b><span>${b.rally ? `已设置 · (${Math.round(b.rally.x)}, ${Math.round(b.rally.y)})` : '左键点击地面设置新兵集合点'}</span></div>` : ''}
    <div class="sel-actions">
      <button class="sel-act" data-building-action="repair" ${b.constructed === false || b.hp >= b.maxHp ? 'disabled' : ''}>维修 ${repairCost}</button>
      <button class="sel-act danger" data-building-action="sell" ${b.type === 'keep' ? 'disabled' : ''}>拆除 +${sellValue}</button>
      ${b.garrison.length ? `<button class="sel-act" data-building-action="ungarrison">放出驻军 ${b.garrison.length}</button>` : ''}
    </div>`;
  } else if (S.inspect) {
    const e = S.inspect;
    if (e.kind === 'gold') {
      els.selContent.innerHTML = `<div class="sel-top">
        <div class="sel-icon">${icon('coin')}</div>
        <div class="sel-title"><strong>金矿脉</strong><span>资源 · 农民可采集</span></div>
      </div>
      <div class="sel-hp"><i style="width:${e.amount / e.max * 100}%"></i><span>${Math.ceil(e.amount)} / ${e.max}</span></div>
      <div class="sel-meta"><em>左键点击金矿指派农民</em></div>`;
    } else if (e.kind === 'unit') {
      els.selContent.innerHTML = `<div class="sel-top">
        <div class="sel-icon">${icon(U[e.type].icon)}</div>
        <div class="sel-title"><strong>${uname(e)}</strong><span>${e.team === ALLY ? '盟军单位' : '敌方单位'} · ${U[e.type].role}</span></div>
      </div>
      <div class="sel-hp"><i style="width:${e.hp / e.maxHp * 100}%"></i><span>${Math.ceil(e.hp)} / ${e.maxHp}</span></div>`;
    } else {
      els.selContent.innerHTML = `<div class="sel-top">
        <div class="sel-icon">${icon('castle')}</div>
        <div class="sel-title"><strong>${bname(e)}</strong><span>${e.team === ALLY ? '盟军建筑' : '敌方建筑'}</span></div>
      </div>
      <div class="sel-hp"><i style="width:${e.hp / e.maxHp * 100}%"></i><span>${Math.ceil(e.hp)} / ${e.maxHp}</span></div>`;
    }
  }
}
function toast(msg, type = '', iconName = 'scroll') {
  if (!els.toasts) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(iconName)}<span>${msg}</span>`;
  els.toasts.appendChild(el);
  while (els.toasts.children.length > 4) els.toasts.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3400);
}
function showBanner(n) {
  if (!els.banner) return;
  els.bannerTitle.textContent = `第 ${CN_NUM[n] || n} 波`;
  els.banner.classList.add('show');
  clearTimeout(S.bannerTimer);
  S.bannerTimer = setTimeout(() => els.banner.classList.remove('show'), 3000);
}
function battleRating() {
  let score = 100;
  score -= Math.min(40, S.time / 15);
  score -= Math.min(30, S.stats.losses * 2);
  score += Math.min(20, S.stats.kills / 10);
  if (score >= 85) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}
function showEndScreen(win) {
  S.lastWin = win;
  const end = $('#end-screen');
  end.hidden = false;
  end.querySelector('.end-modal').classList.toggle('defeat', !win);
  const L = currentLevel();
  const next = LEVELS[S.campaignLevel + 1];
  const hasNext = win && S.run === 'campaign' && !!next;
  const n = S.campaignLevel + 1;
  const cn = CN_NUM[n] || n;
  if (S.run === 'skirmish') {
    $('#end-kicker').textContent = win ? '遭遇战 · 大捷' : '遭遇战 · 失利';
    $('#end-title').textContent = win ? '胜 利' : '失 败';
  } else {
    $('#end-kicker').textContent = win ? `第 ${cn} 章 · ${L.name} · 告捷` : `第 ${cn} 章 · ${L.name} · 沦陷`;
    $('#end-title').textContent = win ? '胜 利' : '失 败';
  }
  if (win) {
    $('#end-lore').innerHTML = `${L.rewardName ? `新军备已解锁：<b style="color:#f0d09a">${L.rewardName}</b><br>` : ''}${hasNext ? `下一章：${next.name} · 敌军特质：${next.trait}` : (S.run === 'campaign' ? '黑鸦之王已经倒下，铁与王冠重归赤蔷薇。' : '黑鸦主堡已被踏平，战场归你所有。')}`;
    if (S.run === 'campaign') {
      const st = STORY[S.campaignLevel];
      if (st && st.outro) $('#end-lore').innerHTML += `<br><br><span class="end-outro">${st.outro}</span>`;
      if (!hasNext) $('#end-lore').innerHTML += `<br><br><b class="end-finale">${FINALE}</b>`;
    }
  } else {
    $('#end-lore').innerHTML = S.run === 'campaign'
      ? `败于「${L.name}」。赤蔷薇需要一位新的统帅——整顿残部，再战一次。`
      : '主堡陷落，部队星散。调整开局资源与阵容，再来一场。';
  }
  $('#btn-restart').textContent = win ? (hasNext ? '进入下一章' : (S.run === 'campaign' ? '再战终章' : '再战一场')) : '重新挑战';
  const rating = win ? battleRating() : '—';
  $('#battle-stats').innerHTML = [
    `<div><b>${fmtTime(S.time)}</b><span>用时</span></div>`,
    `<div><b>${S.stats.kills}</b><span>歼灭</span></div>`,
    `<div><b>${S.stats.losses}</b><span>损失</span></div>`,
    `<div><b>${S.stats.gathered}</b><span>采集</span></div>`,
    `<div class="rating rating-${rating}"><b>${rating}</b><span>评价</span></div>`
  ].join('');
  Sound.play(win ? 'victory' : 'defeat');
}
function hideEndScreen() { $('#end-screen').hidden = true; }
function advanceFromEnd() {
  const win = S.lastWin;
  hideEndScreen();
  if (S.run === 'skirmish') { restartGame(); return; }
  if (win && S.campaignLevel < LEVELS.length - 1) {
    S.campaignLevel++;
    startGame();
  } else restartGame();
}

/* ------------- minimap ------------- */
function renderMinimap() {
  if (!S.miniBase) return;
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.drawImage(S.miniBase, 0, 0);
  for (const g of S.goldNodes) {
    if (!isVisibleToPlayer(g.x, g.y)) continue;
    const p = miniPoint(g.x, g.y);
    mctx.fillStyle = '#e0bb62'; mctx.beginPath(); mctx.arc(p.x, p.y, 3, 0, 7); mctx.fill();
  }
  for (const c of S.crates) {
    if (!isVisibleToPlayer(c.x, c.y)) continue;
    const p = miniPoint(c.x, c.y);
    mctx.fillStyle = '#f6dd9b'; mctx.beginPath(); mctx.arc(p.x, p.y, 2.4, 0, 7); mctx.fill();
  }
  for (const b of S.buildings) {
    if (b.team === ENEMY && !isVisibleToPlayer(b.x, b.y)) continue;
    const p = miniPoint(b.x, b.y);
    mctx.fillStyle = b.team === PLAYER ? '#e06a51' : b.team === ALLY ? '#69b391' : '#9b94b1';
    mctx.fillRect(p.x - 3, p.y - 3, 7, 7);
    mctx.strokeStyle = 'rgba(10,8,6,.6)'; mctx.lineWidth = 1; mctx.strokeRect(p.x - 3, p.y - 3, 7, 7);
  }
  for (const u of S.units) {
    if (u.garrisoned) continue;
    if (u.team === ENEMY && !isVisibleToPlayer(u.x, u.y)) continue;
    const p = miniPoint(u.x, u.y);
    mctx.fillStyle = u.team === PLAYER ? '#f0a37f' : u.team === ALLY ? '#9de0bd' : '#c6bfd7';
    mctx.beginPath(); mctx.arc(p.x, p.y, 1.7, 0, 7); mctx.fill();
  }
  // camera rect
  const i = S.miniInfo;
  const x1 = (-S.cam.x) / S.cam.z, y1 = (-S.cam.y) / S.cam.z;
  const x2 = (VW - S.cam.x) / S.cam.z, y2 = (VH - S.cam.y) / S.cam.z;
  mctx.strokeStyle = 'rgba(240,215,158,.9)'; mctx.lineWidth = 1.5;
  mctx.strokeRect(i.ox + x1 * i.s, i.oy + y1 * i.s, (x2 - x1) * i.s, (y2 - y1) * i.s);
}
function minimapClick(e) {
  if (S.mode !== 'playing') return;
  const r = mini.getBoundingClientRect();
  const mx = (e.clientX - r.left) * (mini.width / r.width);
  const my = (e.clientY - r.top) * (mini.height / r.height);
  const i = S.miniInfo;
  const mapX = (mx - i.ox) / i.s, mapY = (my - i.oy) / i.s;
  const u = (mapX - ORIGIN) / HW, v = mapY / HH;
  centerCamera((u + v) / 2, (v - u) / 2, S.cam.z, false);
  Sound.play('ui');
}

/* ------------- selection/input ------------- */
function pickAt(sx, sy) {
  let best = null;
  for (const u of [...S.units].sort((a, b) => b.y - a.y)) {
    if (u.garrisoned) continue;
    if (u.team === ENEMY && !isVisibleToPlayer(u.x, u.y)) continue;
    const p = worldToScreen(u.x, u.y);
    const h = U[u.type].h * S.cam.z;
    if (Math.abs(sx - p.x) < 15 * S.cam.z && sy > p.y - h - 8 && sy < p.y + 8 * S.cam.z) { best = { type: 'unit', ref: u }; break; }
  }
  if (best) return best;
  for (const b of [...S.buildings].sort((a, b) => (b.ty + b.d) - (a.ty + a.d))) {
    if (b.team === ENEMY && !isVisibleToPlayer(b.x, b.y)) continue;
    const p = worldToScreen(b.x, b.y);
    const hw = (b.w + b.d) * HW * .5 * S.cam.z;
    const h = B[b.type].h * S.cam.z;
    if (sx > p.x - hw && sx < p.x + hw && sy > p.y - h - 20 && sy < p.y + hw * .55) { best = { type: 'building', ref: b }; break; }
  }
  if (best) return best;
  for (const g of S.goldNodes) {
    if (!isVisibleToPlayer(g.x, g.y)) continue;
    const p = worldToScreen(g.x, g.y);
    if (Math.hypot(sx - p.x, sy - (p.y - 8)) < 28 * S.cam.z) return { type: 'gold', ref: g };
  }
  return null;
}
function clearSelection() {
  S.selected = []; S.selectedBuilding = null; S.inspect = null;
  updateSelectionPanel(true);
}
function selectAllArmy() {
  const units = S.units.filter(u => u.team === PLAYER && u.hp > 0 && u.type !== 'peasant');
  if (!units.length) { toast('当前没有可集结的部队', 'warn', 'sword'); return; }
  S.selected = units; S.selectedBuilding = null; S.inspect = null;
  updateSelectionPanel(true);
  announceSelection();
  const ax = units.reduce((s, u) => s + u.x, 0) / units.length;
  const ay = units.reduce((s, u) => s + u.y, 0) / units.length;
  floatText(ax, ay, `全军集结 · ${units.length}`, '#e3c88a');
}
function assignControlGroup(n, add = false) {
  const picked = S.selected.filter(u => u.team === PLAYER && u.hp > 0);
  if (!picked.length) { toast('先选择要编队的部队', 'warn', 'sword'); return; }
  const old = add && S.groups[n] ? S.groups[n] : [];
  S.groups[n] = [...new Set([...old, ...picked.map(u => u.id)])];
  toast(`第 ${n} 队已编入 ${S.groups[n].length} 支部队（Alt+${n} 呼叫）`, '', 'shield');
  Sound.play('ui');
}
function recallControlGroup(n) {
  const ids = S.groups[n];
  if (!ids || !ids.length) { toast(`第 ${n} 队为空`, 'warn', 'shield'); return; }
  const units = S.units.filter(u => u.team === PLAYER && u.hp > 0 && ids.includes(u.id));
  if (!units.length) { toast(`第 ${n} 队已全部阵亡`, 'warn', 'shield'); return; }
  S.selected = units; S.selectedBuilding = null; S.inspect = null;
  updateSelectionPanel(true);
  announceSelection();
}
function centerMainKeep() {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0);
  const focus = keep || S.units.find(u => u.team === PLAYER && u.type === 'baseVehicle' && u.hp > 0);
  if (focus) centerCamera(focus.x, focus.y, Math.max(.95, S.cam.z));
}
function zoomCamera(factor) {
  const old = S.cam.z;
  const z = clamp(old * factor, .62, 1.55);
  if (Math.abs(z - old) < .001) return;
  const c = viewCenter();
  S.cam.x = c.x - (c.x - S.cam.x) * (z / old);
  S.cam.y = c.y - (c.y - S.cam.y) * (z / old);
  S.cam.z = z; clampCamera();
}
function announceSelection() {
  const u = S.selected.find(x => x.team === PLAYER && x.hp > 0);
  if (u) Voice.play('select', u);
}
function selectAt(sx, sy, add) {
  const hit = pickAt(sx, sy);
  if (!hit) { clearSelection(); return; }
  S.inspect = null; S.selectedBuilding = null;
  if (hit.type === 'unit') {
    const u = hit.ref;
    if (u.team === PLAYER) {
      if (add) {
        if (S.selected.includes(u)) S.selected = S.selected.filter(x => x !== u);
        else S.selected.push(u);
      } else S.selected = [u];
    } else {
      S.selected = []; S.inspect = u;
    }
  } else if (hit.type === 'building') {
    const b = hit.ref;
    if (b.team === PLAYER) { S.selected = []; S.selectedBuilding = b; }
    else { S.selected = []; S.inspect = b; }
  } else {
    S.selected = []; S.inspect = hit.ref;
  }
  updateSelectionPanel(true);
  announceSelection();
  Sound.play('ui');
}
function dragSelect(d) {
  const r = {
    x1: Math.min(d.sx, S.mouse.x), y1: Math.min(d.sy, S.mouse.y),
    x2: Math.max(d.sx, S.mouse.x), y2: Math.max(d.sy, S.mouse.y)
  };
  const picked = [];
  for (const u of S.units) {
    if (u.team !== PLAYER) continue;
    const p = worldToScreen(u.x, u.y);
    if (p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 - 20 && p.y <= r.y2 + 8) picked.push(u);
  }
  if (d.add) {
    for (const u of picked) if (!S.selected.includes(u)) S.selected.push(u);
  } else S.selected = picked;
  S.selectedBuilding = null; S.inspect = null;
  updateSelectionPanel(true);
  announceSelection();
}
function commandAt(sx, sy) {
  if (S.placing) { cancelPlacement(); return; }
  if (!S.selected.length) return;
  const hit = pickAt(sx, sy);
  const w = screenToWorld(sx, sy);
  if (hit && (hit.type === 'unit' || hit.type === 'building') && hit.ref.team === ENEMY) {
    for (const u of S.selected) orderAttack(u, hit.ref);
    floatText(hit.ref.x, hit.ref.y, '进攻', '#e3b27a');
    Voice.play('attack', S.selected[0]);
    Sound.play('ui');
    return;
  }
  if (hit && hit.type === 'gold') {
    let any = false;
    for (const u of S.selected) {
      if (u.type === 'peasant') { assignGather(u, hit.ref); any = true; }
      else orderMove(u, hit.ref.x + rnd(-1.2, 1.2), hit.ref.y + 1.7);
    }
    Voice.play('move', S.selected[0]);
    if (any) { toast('农民开始采金', '', 'coin'); Sound.play('ui'); }
    return;
  }
  const n = S.selected.length;
  const cols = Math.ceil(Math.sqrt(n));
  S.selected.forEach((u, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const ox = (col - (cols - 1) / 2) * .8, oy = (row - (cols - 1) / 2) * .8;
    orderMove(u, clamp(w.x + ox, .4, MAP - .4), clamp(w.y + oy, .4, MAP - .4));
  });
  Voice.play('move', S.selected[0]);
  Sound.play('ui');
  if (S.placing) cancelPlacement();
}
function attackMoveAt(sx, sy) {
  if (S.superAim) {
    S.superAim = false; canvas.style.cursor = 'default'; updateSuperUI();
    toast('已取消天火瞄准', '', 'catapult'); Sound.play('ui');
    return;
  }
  if (S.placing) { cancelPlacement(); return; }
  if (!S.selected.length) { clearSelection(); return; }
  const hit = pickAt(sx, sy);
  if (hit && (hit.type === 'unit' || hit.type === 'building') && hit.ref.team === ENEMY) {
    for (const u of S.selected) orderAttack(u, hit.ref);
    floatText(hit.ref.x, hit.ref.y, '进攻', '#e3b27a');
    Voice.play('attack', S.selected[0]);
    Sound.play('ui');
    return;
  }
  const w = screenToWorld(sx, sy);
  const n = S.selected.length;
  const cols = Math.ceil(Math.sqrt(n));
  S.selected.forEach((u, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const ox = (col - (cols - 1) / 2) * .8, oy = (row - (cols - 1) / 2) * .8;
    u.order = {
      type: 'attackMove',
      x: clamp(w.x + ox, .4, MAP - .4),
      y: clamp(w.y + oy, .4, MAP - .4)
    };
    u.target = null; u.gather = null;
  });
  floatText(w.x, w.y, '攻击移动', '#e3b27a');
  Voice.play('move', S.selected[0]);
  Sound.play('ui');
}
function forceAttackAt(sx, sy) {
  if (!S.selected.length) { S.forceAim = false; canvas.style.cursor = 'default'; return; }
  const hit = pickAt(sx, sy);
  if (!hit || (hit.type !== 'unit' && hit.type !== 'building')) {
    toast('强制攻击需要选择单位或建筑目标', 'warn', 'sword');
    return;
  }
  const target = hit.ref;
  for (const u of S.selected) orderAttack(u, target);
  S.forceAim = false;
  canvas.style.cursor = 'default';
  els.cursorTip.classList.remove('show');
  floatText(target.x, target.y, '强制攻击', '#e38163');
  Voice.play('attack', S.selected[0]);
  Sound.play('ui');
}
function stopSelected() {
  if (!S.selected.length) { clearSelection(); return; }
  for (const u of S.selected) {
    u.order = null; u.target = null; u.gather = null; u.moving = false;
  }
  toast('部队停止', '', 'shield');
  Sound.play('ui');
}
function isProducer(b) {
  return !!b && b.team === PLAYER && b.constructed !== false && (b.type === 'barracks' || b.type === 'workshop');
}
function setRally(b, sx, sy) {
  const w = screenToWorld(sx, sy);
  if (terrainAt(w.x, w.y) === 'water') {
    toast('集结点不能设在水面上', 'warn', 'flag'); Sound.play('ui'); return;
  }
  b.rally = { x: clamp(w.x, .4, MAP - .4), y: clamp(w.y, .4, MAP - .4) };
  floatText(b.rally.x, b.rally.y, '集结点', '#f0d18a');
  toast(`${bname(b)}集结点已设置，新兵将到此集合`, '', 'flag');
  Sound.play('ui');
  updateSelectionPanel(true);
}
function canGarrisonBuilding(b) {
  return !!b && b.team === PLAYER && b.constructed !== false && !!B[b.type].garrison && B[b.type].garrison > 0;
}
function tryGarrison(units, b) {
  if (!canGarrisonBuilding(b) || !units.length || !units.every(u => GARRISON_TYPES.has(u.type))) return false;
  const space = B[b.type].garrison - b.garrison.length;
  if (space <= 0) {
    toast(`${bname(b)}驻军已满`, 'warn', 'shield'); Sound.play('ui'); return true;
  }
  const take = units.filter(u => u.hp > 0).slice(0, space);
  for (const u of take) {
    u.garrisoned = b.id;
    u.order = null; u.target = null; u.gather = null; u.moving = false;
    b.garrison.push(u);
  }
  S.selected = S.selected.filter(u => !take.includes(u));
  S.selectedBuilding = b; S.inspect = null;
  floatText(b.x, b.y, `驻军 +${take.length}`, '#f0d18a');
  toast(`${take.length} 名步兵进驻${bname(b)}`, '', 'shield');
  Sound.play('ui');
  updateSelectionPanel(true);
  return true;
}
function evacuateGarrison(b) {
  const units = b.garrison ? b.garrison.splice(0) : [];
  const p = spawnPointFor(b);
  for (const u of units) {
    u.garrisoned = null;
    u.x = p.x + rnd(-1.2, 1.2); u.y = p.y + rnd(-.4, .7);
    u.order = null; u.target = null; u.gather = null; u.moving = false;
  }
  return units;
}
function ungarrison(b) {
  const units = evacuateGarrison(b);
  if (!units.length) return;
  S.selected = units;
  S.selectedBuilding = null; S.inspect = null;
  toast('驻军已出城列阵', '', 'sword');
  Sound.play('ui');
  updateSelectionPanel(true);
}
function repairBuilding(b) {
  if (!b || b.team !== PLAYER) return;
  if (b.constructed === false) { toast('建筑尚未完工，无法维修', 'warn', 'wall'); Sound.play('ui'); return; }
  const missing = b.maxHp - b.hp;
  if (missing <= 0) { toast('该建筑无需维修', '', 'shield'); return; }
  const cost = Math.ceil(missing * .6);
  if (S.gold < cost) { toast(`维修需要 ${cost} 金币`, 'warn', 'coin'); Sound.play('ui'); return; }
  S.gold -= cost; b.hp = b.maxHp;
  floatText(b.x, b.y, `维修 -${cost}`, '#e7c982');
  Sound.play('buildPlace');
  updateHud(true); updateSelectionPanel(true);
}
function sellBuilding(b) {
  if (!b || b.team !== PLAYER) return;
  if (b.type === 'keep') { toast('主堡不能拆除', 'warn', 'castle'); Sound.play('ui'); return; }
  const refund = Math.round((B[b.type].cost || 0) * .6);
  const units = evacuateGarrison(b);
  S.buildings = S.buildings.filter(x => x !== b);
  if (S.selectedBuilding === b) S.selectedBuilding = null;
  if (S.inspect === b) S.inspect = null;
  S.selected = units;
  S.gold += refund;
  floatText(b.x, b.y, `拆除 +${refund}`, '#e7c982');
  toast(`已拆除${bname(b)}，回收 ${refund} 金币`, '', 'coin');
  Sound.play('buildCancel');
  updateHud(true); updateSelectionPanel(true); updateCards();
}

/* ------------- events ------------- */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  VW = innerWidth; VH = innerHeight;
  canvas.width = Math.floor(VW * DPR); canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
  clampCamera();
}
function bindUI() {
  $('#btn-start').addEventListener('click', startGame);
  $$('.diff-option').forEach(b => b.addEventListener('click', () => {
    S.diffKey = b.dataset.diff;
    $$('.diff-option').forEach(x => x.classList.toggle('active', x === b));
    Sound.play('ui');
  }));
  $('#ally-toggle')?.addEventListener('click', e => {
    e.currentTarget.classList.toggle('active');
    S.allyEnabled = e.currentTarget.classList.contains('active');
    Sound.play('ui');
  });
  $$('#mode-tabs .mode-tab').forEach(btn => btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    S.tutorial = mode === 'tutorial';
    S.run = (mode === 'skirmish' || mode === 'tutorial') ? 'skirmish' : 'campaign';
    if (S.tutorial) S.skirmish = { gold: 600, inf: 0, supers: false, faction: 'rose', map: 'border' };
    else if (S.run === 'skirmish' && !S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true, faction: 'rose', map: 'random' };
    else if (S.run === 'campaign') S.skirmish = null;
    syncStartUI();
    Sound.play('ui');
  }));
  $$('#sk-gold button').forEach(btn => btn.addEventListener('click', () => {
    if (!S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true };
    S.skirmish.gold = parseInt(btn.dataset.gold, 10);
    $$('#sk-gold button').forEach(b => b.classList.toggle('active', b === btn));
    updateCampaignUI();
    Sound.play('ui');
  }));
  $$('#sk-inf button').forEach(btn => btn.addEventListener('click', () => {
    if (!S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true };
    S.skirmish.inf = parseInt(btn.dataset.inf, 10);
    $$('#sk-inf button').forEach(b => b.classList.toggle('active', b === btn));
    updateCampaignUI();
    Sound.play('ui');
  }));
  $$('#sk-faction button').forEach(btn => btn.addEventListener('click', () => {
    if (!S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true };
    S.skirmish.faction = btn.dataset.faction;
    $$('#sk-faction button').forEach(b => b.classList.toggle('active', b === btn));
    updateCampaignUI();
    Sound.play('ui');
  }));
  $$('#sk-map button').forEach(btn => btn.addEventListener('click', () => {
    if (!S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true };
    S.skirmish.map = btn.dataset.map;
    $$('#sk-map button').forEach(b => b.classList.toggle('active', b === btn));
    updateCampaignUI();
    Sound.play('ui');
  }));
  $('#sk-super')?.addEventListener('click', e => {
    if (!S.skirmish) S.skirmish = { gold: 2000, inf: 4, supers: true };
    S.skirmish.supers = !S.skirmish.supers;
    e.currentTarget.classList.toggle('active', S.skirmish.supers);
    updateCampaignUI();
    Sound.play('ui');
  });
  $$('#command-tabs .tab').forEach(tab => tab.addEventListener('click', () => {
    S.tab = tab.dataset.tab; renderTabs(); renderCards(); hideTooltip(); Sound.play('ui');
  }));
  if (els.selContent) els.selContent.addEventListener('click', e => {
    const unitBtn = e.target.closest('[data-unit-action]');
    if (unitBtn) {
      if (unitBtn.dataset.unitAction === 'deploy' && S.selected.length === 1) deployBaseVehicle(S.selected[0]);
      return;
    }
    const btn = e.target.closest('[data-building-action]');
    if (!btn || !S.selectedBuilding) return;
    const b = S.selectedBuilding;
    if (btn.dataset.buildingAction === 'repair') repairBuilding(b);
    else if (btn.dataset.buildingAction === 'sell') sellBuilding(b);
    else if (btn.dataset.buildingAction === 'ungarrison') ungarrison(b);
  });
  $('#btn-sound').addEventListener('click', toggleMute);
  $('#btn-pause').addEventListener('click', togglePause);
  $('#btn-exit')?.addEventListener('click', () => goMenu());
  $('#btn-quit')?.addEventListener('click', () => { hidePause(); goMenu(); });
  $('#btn-resume').addEventListener('click', togglePause);
  if (els.superBtn) els.superBtn.addEventListener('click', armSuper);
  const superHud = $('#super-hud');
  if (superHud) superHud.addEventListener('click', armSuper);
  const miniHud = $('#mini-hud');
  if (miniHud) miniHud.addEventListener('click', armMini);
  setInterval(updateSuperUI, 250);
  updateSuperUI();
  $('#btn-pause').innerHTML = icon('pause');
  $('#btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  $('#btn-restart-pause').addEventListener('click', () => { hidePause(); restartGame(); });
  $('#btn-restart').addEventListener('click', advanceFromEnd);
  $('#btn-menu').addEventListener('click', () => { hideEndScreen(); goMenu(); });
  $('#btn-story-start')?.addEventListener('click', hideStoryBriefing);
  $('#btn-story-skip')?.addEventListener('click', hideStoryBriefing);
  mini.addEventListener('pointerdown', minimapClick);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', () => { S.mouse.inside = false; els.cursorTip.classList.remove('show'); });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('resize', resize);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', e => { S.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => { S.keys = {}; S.mouse.inside = false; });
}
function onPointerDown(e) {
  if (S.mode !== 'playing' || S.paused) return;
  if (e.button === 1) {
    e.preventDefault();
    S.panning = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (e.button === 2) {
    S.drag = null;
    if (S.miniAim) { S.miniAim = false; canvas.style.cursor = 'default'; updateSuperUI(); return; }
    if (S.forceAim) { S.forceAim = false; canvas.style.cursor = 'default'; return; }
    const r = canvas.getBoundingClientRect();
    attackMoveAt(e.clientX - r.left, e.clientY - r.top);
    return;
  }
  if (e.button !== 0) return;
  if (S.miniAim) {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
    applyMiniAt(w.x, w.y);
    return;
  }
  if (S.forceAim) {
    const r = canvas.getBoundingClientRect();
    forceAttackAt(e.clientX - r.left, e.clientY - r.top);
    return;
  }
  if (S.superAim) { castSuperAt(e.clientX, e.clientY); return; }
  if (S.placing) { placeBuilding(); return; }
  if (!S.mouse.inside) {
    const r = canvas.getBoundingClientRect();
    S.mouse.x = e.clientX - r.left; S.mouse.y = e.clientY - r.top;
  }
  S.drag = { sx: e.clientX, sy: e.clientY, active: false, add: e.shiftKey };
}
function onPointerMove(e) {
  const r = canvas.getBoundingClientRect();
  S.mouse.x = e.clientX - r.left; S.mouse.y = e.clientY - r.top; S.mouse.inside = true;
  const w = screenToWorld(S.mouse.x, S.mouse.y);
  S.mouse.wx = w.x; S.mouse.wy = w.y;
  if (S.panning) {
    S.cam.x += e.clientX - S.panning.x; S.cam.y += e.clientY - S.panning.y;
    S.panning.x = e.clientX; S.panning.y = e.clientY; clampCamera();
    return;
  }
  if (S.drag) {
    if (Math.hypot(e.clientX - S.drag.sx, e.clientY - S.drag.sy) > 5) S.drag.active = true;
  }
  if (S.placing) {
    const d = B[S.placing.type];
    S.placing.tx = Math.round(w.x - d.w / 2);
    S.placing.ty = Math.round(w.y - d.d / 2);
    S.placing.valid = canPlace(S.placing.type, S.placing.tx, S.placing.ty);
    els.cursorTip.textContent = S.placing.valid
      ? `${d.name} · 左键建造`
      : (!playerHasKeep() ? '先展开基地车' : (withinBuildRadius(S.placing.type, S.placing.tx, S.placing.ty) ? '无法在此建造' : '需靠近己方建筑'));
    els.cursorTip.classList.add('show');
    els.cursorTip.style.left = (e.clientX + 16) + 'px';
    els.cursorTip.style.top = (e.clientY + 18) + 'px';
    canvas.style.cursor = 'crosshair';
    return;
  }
  if (S.superAim) {
    els.cursorTip.textContent = '天火圣裁 · 左键落下';
    els.cursorTip.classList.add('show');
    els.cursorTip.style.left = (e.clientX + 16) + 'px';
    els.cursorTip.style.top = (e.clientY + 18) + 'px';
    canvas.style.cursor = 'crosshair';
    return;
  }
  if (S.forceAim) {
    els.cursorTip.textContent = '强制攻击 · 左键选择目标（含友军）';
    els.cursorTip.classList.add('show');
    els.cursorTip.style.left = (e.clientX + 16) + 'px';
    els.cursorTip.style.top = (e.clientY + 18) + 'px';
    canvas.style.cursor = 'crosshair';
    return;
  }
  // hover info
  const hit = pickAt(S.mouse.x, S.mouse.y);
  if (hit) {
    let txt = '';
    if (hit.type === 'unit') txt = `${uname(hit.ref)} · ${Math.ceil(hit.ref.hp)} HP`;
    else if (hit.type === 'building') txt = `${bname(hit.ref)} · ${Math.ceil(hit.ref.hp)} HP`;
    else txt = `金矿 · 剩余 ${Math.ceil(hit.ref.amount)}`;
    els.cursorTip.textContent = txt;
    els.cursorTip.classList.add('show');
    els.cursorTip.style.left = (e.clientX + 16) + 'px';
    els.cursorTip.style.top = (e.clientY + 18) + 'px';
    canvas.style.cursor = hit.ref.team === ENEMY ? 'crosshair' : 'pointer';
    S.hover = hit;
  } else {
    els.cursorTip.classList.remove('show');
    canvas.style.cursor = 'default';
    S.hover = null;
  }
}
function onPointerUp(e) {
  if (S.panning) { S.panning = null; canvas.style.cursor = 'default'; return; }
  if (!S.drag) return;
  const d = S.drag;
  S.drag = null;
  if (S.mode !== 'playing' || S.paused) return;
  if (d.active) { dragSelect(d); return; }
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  const hit = pickAt(sx, sy);
  if (hit && hit.type === 'building' && S.selected.length && canGarrisonBuilding(hit.ref)) {
    if (tryGarrison(S.selected, hit.ref)) return;
  }
  if (S.selectedBuilding && isProducer(S.selectedBuilding) && !S.selected.length && !hit) {
    setRally(S.selectedBuilding, sx, sy);
    return;
  }
  if (hit && hit.type === 'unit' && hit.ref.team === PLAYER) selectAt(sx, sy, e.shiftKey);
  else if (hit && hit.type === 'building' && hit.ref.team === PLAYER) selectAt(sx, sy, false);
  else if (S.selected.length) commandAt(sx, sy);
  else selectAt(sx, sy, e.shiftKey);
}
function onWheel(e) {
  if (S.mode !== 'playing') return;
  e.preventDefault();
  const old = S.cam.z;
  const z = clamp(old * (e.deltaY < 0 ? 1.1 : .9), .62, 1.55);
  const mx = e.clientX, my = e.clientY;
  S.cam.x = mx - (mx - S.cam.x) * (z / old);
  S.cam.y = my - (my - S.cam.y) * (z / old);
  S.cam.z = z; clampCamera();
}
function toggleMute() {
  S.muted = !S.muted;
  Sound.enabled = !S.muted;
  Voice.stopAll();
  if (Sound.master) Sound.master.gain.value = Sound.enabled ? .45 : 0;
  $('#btn-sound').classList.toggle('muted', S.muted);
  $('#btn-sound use').setAttribute('href', S.muted ? '#i-mute' : '#i-sound');
  if (!S.muted) { Sound.init(); Sound.master && (Sound.master.gain.value = .45); Sound.play('ui'); }
}
function onKeyDown(e) {
  const k = e.key.toLowerCase();
  if (k === 'enter' && S.mode === 'menu') { startGame(); return; }
  if (k === 'p') { togglePause(); return; }
  if (k === 'm') { toggleMute(); return; }
  if (k === 'e') { if (S.mode === 'playing' && !S.paused) stopSelected(); return; }
  if (k === 'escape') {
    if (S.forceAim) { S.forceAim = false; canvas.style.cursor = 'default'; return; }
    if (S.superAim) { S.superAim = false; canvas.style.cursor = 'default'; updateSuperUI(); return; }
    if (S.placing) { cancelPlacement(); return; }
    if (S.drag) { S.drag = null; return; }
    if (S.mode === 'ended') return;
    if (S.selected.length || S.selectedBuilding || S.inspect) { clearSelection(); return; }
    return;
  }
  if (S.mode !== 'playing' || S.paused) return;
  if (k === 'tab' && !e.ctrlKey) {
    e.preventDefault();
    const order = ['build', 'units', 'defense', 'siege', 'tech'];
    S.tab = order[(order.indexOf(S.tab) + 1) % order.length];
    renderTabs(); renderCards(); hideTooltip(); Sound.play('ui');
    return;
  }
  if (/^[1-9]$/.test(k) && (e.ctrlKey || e.altKey || e.shiftKey)) {
    e.preventDefault();
    const n = parseInt(k);
    if (e.ctrlKey && e.shiftKey) assignControlGroup(n, true);
    else if (e.ctrlKey) assignControlGroup(n);
    else if (e.altKey) recallControlGroup(n);
    else if (e.shiftKey) { const key = TABS[S.tab][n - 1]; if (key) onCard(key); }
    return;
  }
  if (e.ctrlKey && k === 'a') {
    e.preventDefault();
    selectAllArmy();
    return;
  }
  if (k === 'f') { selectAllArmy(); return; }
  if (k === 'q') {
    if (!S.selected.length) return;
    const c = viewCenter();
    if (S.mouse.inside) attackMoveAt(S.mouse.x, S.mouse.y);
    else attackMoveAt(c.x, c.y);
    return;
  }
  if (k === 'h' || k === 'home') { centerMainKeep(); return; }
  if (k === 't') {
    if (!S.selected.length) { toast('先选择部队再使用强制攻击', 'warn', 'sword'); return; }
    S.forceAim = !S.forceAim;
    canvas.style.cursor = S.forceAim ? 'crosshair' : 'default';
    toast(S.forceAim ? '强制攻击：左键选择任意单位或建筑（包括友军），右键取消' : '已取消强制攻击', '', 'sword');
    return;
  }
  if (k === 'v') { tryMilitia(); return; }
  if (k === 'r' && S.selectedBuilding) { repairBuilding(S.selectedBuilding); return; }
  if (k === 'g' && S.selectedBuilding) { ungarrison(S.selectedBuilding); return; }
  if (k === 'delete' && S.selectedBuilding) {
    e.preventDefault();
    sellBuilding(S.selectedBuilding);
    return;
  }
  if (k === '+' || k === '=' || k === '-' || k === '_') {
    e.preventDefault();
    zoomCamera(k === '+' || k === '=' ? 1.12 : .89);
    return;
  }
  if (k === ' ') {
    e.preventDefault();
    centerMainKeep();
    return;
  }
  if (k in TAB_KEYS) { S.tab = TAB_KEYS[k]; renderTabs(); renderCards(); return; }
  if (/^[1-5]$/.test(k)) {
    const tab = TAB_ORDER[parseInt(k, 10) - 1];
    if (tab && tab !== S.tab) {
      S.tab = tab;
      renderTabs(); renderCards(); hideTooltip();
      toast('页签：' + TAB_LABELS[tab], '', 'scroll');
      Sound.play('ui');
    }
    return;
  }
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    S.keys[k] = true;
    e.preventDefault();
  }
}

/* ------------- flow ------------- */
function playIntroToasts() {
  const L = currentLevel();
  if (S.run === 'skirmish') {
    setTimeout(() => toast(`遭遇战 · ${(MAP_THEMES[S.mapTheme] || MAP_THEMES.border).name}｜起始金币 ${S.gold}｜初始步兵 ${(S.skirmish && S.skirmish.inf) || 0}｜超级武器${S.supersEnabled ? '启用' : '禁用'}`, 'warn', 'shield'), 700);
    setTimeout(() => toast('摧毁黑鸦主堡即可取胜；地图上会刷新奖励箱，派兵去捡。', '', 'scroll'), 1700);
    if (S.allyEnabled) setTimeout(() => toast('青杉盟军已在远处建立营地：他们会自行出兵、进攻黑鸦，并共享视野。', '', 'shield'), 3200);
    return;
  }
  setTimeout(() => toast(`第${CN_NUM[S.campaignLevel + 1]}章 · ${L.name}｜地图：${(MAP_THEMES[S.mapTheme] || MAP_THEMES.border).name}｜敌军特质：${L.trait}`, 'warn', 'shield'), 600);
  setTimeout(() => toast('地形：水域不可通行，沼泽减速，道路加速；建造需靠近己方建筑。', '', 'scroll'), 1700);
  setTimeout(() => toast('开局没有主堡和农民，金币 1200：先选基地车展开主堡，再从主堡训练农民。', '', 'coin'), 2800);
  setTimeout(() => toast('步兵可进驻农舍/大教堂；驻军弓手会从窗口射击。', '', 'shield'), 3800);
  setTimeout(() => toast('战争迷雾已笼罩战场：只有我军视野内可见，派兵侦察。', '', 'scroll'), 4700);
  setTimeout(() => toast('基地车已就绪：选中后点击「部署为基地」，可在远处展开新主堡；工坊也能继续制造。', '', 'workshop'), 5600);
  if (S.allyEnabled) setTimeout(() => toast('青杉盟军已在远处建立营地：他们会自行出兵、进攻黑鸦，并共享视野。', '', 'shield'), 6400);
}
function showStoryBriefing() {
  const st = STORY[S.campaignLevel];
  if (!st) { S.mode = 'playing'; return; }
  S.mode = 'briefing';
  const n = S.campaignLevel + 1;
  const scr = $('#story-screen');
  if (!scr) { S.mode = 'playing'; playIntroToasts(); return; }
  $('#story-kicker').textContent = `第 ${CN_NUM[n] || n} 章 · 赤蔷薇纪年`;
  $('#story-title').textContent = currentLevel().name;
  $('#story-body').innerHTML = st.intro.map(p => `<p>${p}</p>`).join('');
  $('#story-objective').textContent = '作战目标 · ' + st.objective;
  scr.hidden = false;
  requestAnimationFrame(() => scr.classList.add('show'));
  Sound.play('horn');
}
function hideStoryBriefing() {
  const scr = $('#story-screen');
  if (scr) {
    scr.classList.remove('show');
    setTimeout(() => { scr.hidden = true; }, 320);
  }
  S.mode = 'playing';
  playIntroToasts();
}
function startGame() {
  Sound.init(); Sound.play('horn');
  clearToasts();
  S.diffKey = $$('.diff-option').find(b => b.classList.contains('active'))?.dataset.diff || S.diffKey;
  const allyToggle = $('#ally-toggle');
  S.allyEnabled = allyToggle ? allyToggle.classList.contains('active') : params.get('ally') === '1';
  const modeTab = $$('#mode-tabs .mode-tab').find(b => b.classList.contains('active'));
  const modeSel = modeTab ? modeTab.dataset.mode : 'campaign';
  S.tutorial = modeSel === 'tutorial';
  S.tutStep = 0;
  S.run = (modeSel === 'skirmish' || modeSel === 'tutorial') ? 'skirmish' : 'campaign';
  if (S.run === 'skirmish') {
    const gb = $$('#sk-gold button').find(b => b.classList.contains('active'));
    const ib = $$('#sk-inf button').find(b => b.classList.contains('active'));
    const st = $('#sk-super');
    const fb = $$('#sk-faction button').find(b => b.classList.contains('active'));
    const mb = $$('#sk-map button').find(b => b.classList.contains('active'));
    S.skirmish = {
      gold: gb ? parseInt(gb.dataset.gold, 10) : 2000,
      inf: ib ? parseInt(ib.dataset.inf, 10) : 4,
      supers: st ? st.classList.contains('active') : true,
      faction: fb ? fb.dataset.faction : 'rose',
      map: mb ? mb.dataset.map : 'random'
    };
  } else S.skirmish = null;
  if (S.tutorial) S.skirmish = { gold: 600, inf: 0, supers: false, faction: 'rose', map: 'border' };
  updateCampaignUI();
  resetWorld();
  if (S.tutorial) { S.tutStep = 0; renderTutorial(); }
  S.mode = 'playing'; S.paused = false;
  document.body.classList.remove('menu-mode');
  const st = $('#start-screen');
  st.classList.add('hidden-screen');
  setTimeout(() => { st.hidden = true; }, 560);
  renderTabs(); renderCards(); renderQueue(); updateSelectionPanel(true); updateHud(true);
  updateSuperUI();
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0);
  const focus = keep || S.units.find(u => u.team === PLAYER && u.type === 'baseVehicle' && u.hp > 0);
  if (focus) centerCamera(focus.x, focus.y, 1.04, true);
  if (S.run === 'campaign') showStoryBriefing();
  else playIntroToasts();
  if (window.__dbgUpdate) window.__dbgUpdate();
}
function restartGame() {
  hidePause(); hideEndScreen();
  clearToasts();
  updateCampaignUI();
  const st = $('#start-screen'); st.hidden = true; st.classList.add('hidden-screen');
  Sound.play('horn');
  resetWorld();
  S.mode = 'playing'; S.paused = false;
  document.body.classList.remove('menu-mode');
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep' && b.hp > 0);
  const focus = keep || S.units.find(u => u.team === PLAYER && u.type === 'baseVehicle' && u.hp > 0);
  if (focus) centerCamera(focus.x, focus.y, 1.04, true);
  renderTabs(); renderCards(); renderQueue(); updateSelectionPanel(true); updateHud(true);
  updateSuperUI();
  toast(`重新挑战 · ${currentLevel().name}`, '', 'castle');
}
function goMenu() {
  hidePause(); hideEndScreen();
  clearToasts();
  S.mode = 'menu'; S.paused = false;
  updateCampaignUI();
  resetWorld(); menuCamera();
  document.body.classList.add('menu-mode');
  const st = $('#start-screen');
  st.hidden = false; st.classList.remove('hidden-screen');
  updateHud(true);
}
function togglePause() {
  if (S.mode !== 'playing') return;
  S.paused = !S.paused;
  $('#pause-screen').hidden = !S.paused;
  $('#btn-pause').innerHTML = icon(S.paused ? 'play' : 'pause');
  if (!S.paused) Sound.play('ui');
}
function hidePause() { S.paused = false; $('#pause-screen').hidden = true; $('#btn-pause').innerHTML = icon('pause'); }
function clearToasts() { if (els.toasts) els.toasts.innerHTML = ''; hideTooltip(); els.cursorTip.classList.remove('show'); }
function endGame(win) {
  if (S.mode === 'ended') return;
  S.mode = 'ended'; S.paused = false; S.placing = null; S.forceAim = false; S.lastWin = !!win;
  $('#placement-hint').hidden = true;
  canvas.style.cursor = 'default';
  clearTimeout(S.bannerTimer);
  if (els.banner) els.banner.classList.remove('show');
  setTimeout(() => showEndScreen(win), 850);
}

/* ------------- loop ------------- */
let last = performance.now();
let miniLast = 0;
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000);
  last = now;
  if (S.mode === 'playing' && !S.paused) update(dt);
  else {
    updateParticles(dt);
    updateCamera(dt);
  }
  render(now);
  if (now - miniLast > 70) { miniLast = now; renderMinimap(); }
  requestAnimationFrame(loop);
}

/* ===== 10. BOOT & DEBUG ===== */
/* ------------- boot ------------- */
document.body.classList.add('menu-mode');
resize();
resetWorld();
menuCamera();
updateCampaignUI();
bindUI();
renderTabs(); renderCards(); renderQueue(); updateSelectionPanel(true); updateHud(true);
$('#pause-screen').hidden = true;
$('#end-screen').hidden = true;
$('#placement-hint').hidden = true;
$('#btn-pause').innerHTML = icon('pause');
requestAnimationFrame(loop);

// 轻量调试接口（也方便自动化验收）
window.IronCrown = {
  state: S,
  start: startGame,
  restart: restartGame,
  end: endGame,
  add: (type, team, x, y) => team === PLAYER ? addUnit(type, team, x, y) : addUnit(type, team, x, y),
  build: (type, x, y, team = PLAYER) => addBuilding(type, x, y, team),
  voice: Voice,
  sound: Sound,
  center: centerCamera,
  toWorld: (x, y) => screenToWorld(x, y),
  toScreen: (x, y) => worldToScreen(x, y),
  visible: (x, y) => isVisibleToPlayer(x, y),
  canPlace: (type, tx, ty, opts) => canPlace(type, tx, ty, opts),
  deployBase: (u) => deployBaseVehicle(u),
  fog: fogCanvas
};

const params = new URLSearchParams(location.search);
Voice.preload();
if (params.get('mode') === 'skirmish') {
  S.run = 'skirmish';
  const g = parseInt(params.get('gold'), 10);
  const inf = parseInt(params.get('inf'), 10);
  const fac = params.get('faction');
  const mp = params.get('map');
  S.skirmish = {
    gold: Number.isFinite(g) ? clamp(g, 200, 20000) : 2000,
    inf: Number.isFinite(inf) ? clamp(inf, 0, 12) : 4,
    supers: params.get('super') !== '0',
    faction: FACTIONS[fac] ? fac : 'rose',
    map: mp || 'random'
  };
}
if (params.get('mode') === 'tutorial' || params.get('tutorial') === '1') {
  S.tutorial = true;
  S.run = 'skirmish';
  S.skirmish = { gold: 600, inf: 0, supers: false, faction: 'rose', map: 'border' };
}
if (params.get('debug') === '1') {
  window.__ic = S;
  const dbg = document.createElement('pre');
  dbg.id = 'debug-state';
  dbg.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
  document.body.appendChild(dbg);
  window.__dbg = dbg;
  window.__dbgUpdate = () => {
    dbg.textContent = JSON.stringify({
      run: S.run, mode: S.mode, gold: S.gold, supers: S.supersEnabled,
      units: S.units.length,
      playerUnits: S.units.filter(u => u.team === PLAYER).length,
      enemyUnits: S.units.filter(u => u.team === ENEMY).length,
      buildings: S.buildings.length,
      keeps: S.buildings.filter(b => b.type === 'keep').length,
      crates: S.crates.length,
      theme: S.mapTheme,
      wave: Math.round(S.wave.timer),
      enemySuperBuilding: S.buildings.some(b => b.team === ENEMY && SUPER_BUILDINGS.has(b.type)),
      unlocked: S.unlocked.size,
      sidebar: Math.round(sidebarWidth()),
      cam: [Math.round(S.cam.x), Math.round(S.cam.y)],
      prod: {
        keep: (S.prod.keep.cur ? S.prod.keep.cur.type : '-') + '/' + S.prod.keep.queue.length,
        barracks: (S.prod.barracks.cur ? S.prod.barracks.cur.type : '-') + '/' + S.prod.barracks.queue.length,
        workshop: (S.prod.workshop.cur ? S.prod.workshop.cur.type : '-') + '/' + S.prod.workshop.queue.length
      },
      edgeDelta: window.__edgeDelta || 0,
      tutorial: S.tutorial, tutStep: S.tutStep, faction: S.faction, miniCd: Math.round(S.miniCd),
      superKey: S.superKey,
      tab: S.tab,
      perfPath: S.perf ? S.perf.path : 0,
      cratePicks: S.crateStats ? (S.crateStats.picksPlayer + '/' + S.crateStats.picksEnemy) : '0/0',
      crateScan: S.crateStats ? S.crateStats.scans : 0,
      crateDispatch: S.crateStats ? S.crateStats.dispatches : 0,
      crateAborts: S.crateStats ? S.crateStats.aborts : 0,
      cratePicksDisp: S.crateStats ? S.crateStats.picksDispatched : 0,
      cratePicksAlly: S.crateStats ? S.crateStats.picksAlly : 0,
      militia: S.units.filter(u => u.team === PLAYER && u.militiaT > 0).length,
      militiaHp: (S.units.find(u => u.team === PLAYER && u.militiaT > 0) || {}).hp || 0,
      cratePicksFree: S.crateStats ? S.crateStats.picksFree : 0,
      crateInFlight: S.units.filter(u => u.team === ENEMY && u.crateRun && S.crates.includes(u.crateRun)).length,
      crateBalanceOk: S.crateStats ? (S.crateStats.dispatches === S.crateStats.picksDispatched + S.crateStats.aborts + S.units.filter(u => u.team === ENEMY && u.crateRun && S.crates.includes(u.crateRun)).length) : true,
      crateAbortWhy: S.crateAborts || {},
      crateLog: S.crateLog || [],
      pathReq: S.perf ? S.perf.pathReq : 0,
      pathDef: S.perf ? S.perf.pathDef : 0,
      pathDefPct: S.perf && S.perf.pathReq ? Math.round(S.perf.pathDef / S.perf.pathReq * 1000) / 10 : 0,
      pathCool: S.perf ? S.perf.pathCool : 0,
      dmgLog: window.__dmgLog || null,
      fstat: window.__fstat || null,
      pathEffPct: S.perf && (S.perf.pathReq + S.perf.pathCool) ? Math.round(S.perf.pathDef / (S.perf.pathReq + S.perf.pathCool) * 1000) / 10 : 0,
      pushChecks: S.perf ? S.perf.pushChecks : 0,
      sepMsPerFrame: S.perf && S.perf.frames ? Math.round(S.perf.sepMs / S.perf.frames * 1000) / 1000 : 0,
      pushMsPerFrame: S.perf && S.perf.frames ? Math.round(S.perf.pushMs / S.perf.frames * 1000) / 1000 : 0,
      perfSep: S.perf ? S.perf.sep : 0,
      keyLog: window.__keyLog || [],
      buildQ: (S.buildQ.cur ? S.buildQ.cur.type + ':' + (S.buildQ.cur.ready ? 'ready' : Math.round(100 * S.buildQ.cur.elapsed / S.buildQ.cur.total)) : '-') + '/' + S.buildQ.queue.length,
      enemySuper: !!S.enemySuper,
      superHud: (() => {
        const h = document.getElementById('super-hud');
        if (!h) return 'none';
        if (h.hidden) return 'hidden';
        const v = h.querySelector('.sh-val');
        return v ? v.textContent : 'shown';
      })(),
      playerBuildings: S.buildings.filter(b => b.team === PLAYER && b.constructed !== false).length,
      heroes: S.units.filter(u => u.type === 'hero').length,
      moveDist: (() => {
        if (!window.__moveGoal) return -1;
        let best = 999;
        for (const u of S.units) {
          if (u.team !== PLAYER || u.garrisoned) continue;
          const d = Math.hypot(u.x - window.__moveGoal.x, u.y - window.__moveGoal.y);
          if (d < best) best = d;
        }
        return Math.round(best * 10) / 10;
      })()
    });
  };
  window.__dbgUpdate();
}
if (params.has('diff') && DIFFS[params.get('diff')]) {
  S.diffKey = params.get('diff');
  $$('.diff-option').forEach(b => b.classList.toggle('active', b.dataset.diff === S.diffKey));
}
if (params.get('ally') === '1') {
  S.allyEnabled = true;
  $('#ally-toggle')?.classList.add('active');
}
syncStartUI();
if (params.has('autostart')) {
  startGame();
}
// 调试用：?build=house:3 直接排入建筑队列，?move=x,y 让全部我方单位前往该点。
const buildSpec = params.get('build');
if (buildSpec && S.mode === 'playing') {
  for (const part of buildSpec.split(',')) {
    const bits = part.split(':');
    if (B[bits[0]]) { const n = parseInt(bits[1] || '1', 10); for (let i = 0; i < n; i++) queueBuilding(bits[0]); }
  }
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?cancel=house 取消建造并退款；?superselect=fire 选中超武并进入冷却，验证右下角面板。
const cancelSpec = params.get('cancel');
if (cancelSpec && S.mode === 'playing') { cancelBuild(cancelSpec); if (window.__dbgUpdate) window.__dbgUpdate(); }
const supSelSpec = params.get('superselect');
if (supSelSpec && SUPERS[supSelSpec]) {
  S.superKey = supSelSpec;
  S.superCd = 12;
  updateSuperUI();
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?castmini=1 在主堡旁施放战鼓，验证增益/减益。
const castMiniSpec = params.get('castmini');
// 调试用：?cancelunit=spearman 取消兵种训练并退款。
const cancelUnitSpec = params.get('cancelunit');
const moveSpec = params.get('move');
if (moveSpec && S.mode === 'playing') {
  const bits = moveSpec.split(',').map(Number);
  for (const u of S.units.filter(x => x.team === PLAYER && x.hp > 0)) orderMove(u, bits[0], bits[1]);
  window.__moveGoal = { x: bits[0], y: bits[1] };
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?warp=秒数 直接把模拟推进若干秒，便于无头测试检查奖励箱、波次等随时间发生的行为。
const edgeTest = params.get('edgepan');
if (edgeTest && S.mode === 'playing') {
  const x0 = S.cam.x;
  S.mouse.inside = true;
  S.mouse.x = edgeTest === 'far' ? VW - 100 : (panBounds().right - 4);
  S.mouse.y = VH / 2;
  for (let i = 0; i < 30; i++) updateCamera(1 / 30);
  window.__edgeDelta = Math.round(S.cam.x - x0);
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?give=barracks,workshop 在开局主堡旁直接补齐生产建筑，便于无头测试队列。
const giveSpec = params.get('give');
if (giveSpec && S.mode === 'playing') {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
  let kx = keep ? keep.x : 9, ky = keep ? keep.y : 35;
  for (const t of giveSpec.split(',')) {
    if (!B[t]) continue;
    const spot = findKeepSpot(kx + 5, ky + 3);
    if (spot) {
      clearKeepArea(spot.tx, spot.ty);
      const b = addBuilding(t, spot.tx, spot.ty, PLAYER);
      b.constructed = true; b.progress = 1;
      kx = b.x + 4;
    }
  }
}
// 调试用：?train=spearman:3,archer:2 直接向对应产线排队，便于无头测试。
const trainSpec = params.get('train');
if (trainSpec && S.mode === 'playing') {
  for (const part of trainSpec.split(',')) {
    const bits = part.split(':');
    if (U[bits[0]]) tryTrain(bits[0], parseInt(bits[1] || '1', 10));
  }
  if (window.__dbgUpdate) window.__dbgUpdate();
}
if (cancelUnitSpec && S.mode === 'playing') { cancelTrain(cancelUnitSpec); if (window.__dbgUpdate) window.__dbgUpdate(); }
const crateTimeoutSpec = params.get('crateTimeout');
if (crateTimeoutSpec === '1' && S.mode === 'playing') {
  for (const u of S.units) if (u.crateRun) u.crateRunLimit = 0.2;
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const crateSpec = params.get('crate');
if (crateSpec && S.mode === 'playing') {
  const n = Math.max(1, Math.min(6, parseInt(crateSpec, 10) || 1));
  const ek = S.buildings.find(b => b.team === ENEMY && b.type === 'keep');
  if (ek) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      S.crates.push({ x: ek.x + Math.cos(ang) * 3, y: ek.y + Math.sin(ang) * 3, kind: 'gold', phase: i, life: 120 });
    }
    if (window.__dbgUpdate) window.__dbgUpdate();
  }
}
const spawnPlayerSpec = params.get('spawnplayer');
if (spawnPlayerSpec && S.mode === 'playing') {
  // debug only: dx,dy offsets from the ENEMY keep
  const bits = spawnPlayerSpec.split(',').map(Number);
  const ek = S.buildings.find(b => b.team === ENEMY && b.type === 'keep');
  if (ek && isFinite(bits[0]) && isFinite(bits[1])) addUnit('spearman', PLAYER, ek.x + bits[0], ek.y + bits[1]);
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const dmgLogSpec = params.get('dmglog');
if (dmgLogSpec && S.mode === 'playing') {
  const bits = dmgLogSpec.split(':');
  window.__dmgLog = damageLayers(bits[0], bits[1] || 'knight');
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const fstatSpec = params.get('fstat');
if (fstatSpec && U[fstatSpec]) {
  window.__fstat = {
    type: fstatSpec,
    hp: Math.round(U[fstatSpec].hp * playerHpMul(fstatSpec) * unitHpFactionMul(fstatSpec)),
    cost: unitCostFaction(fstatSpec),
    range: U[fstatSpec].range + unitRangeFactionAdd(fstatSpec),
    speed: Math.round(U[fstatSpec].speed * unitSpeedFactionMul(fstatSpec) * 100) / 100
  };
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const peasantSpec = params.get('peasants');
if (peasantSpec && S.mode === 'playing') {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
  const cx = keep ? keep.x : 9.65, cy = keep ? keep.y : 36.35;
  const pn = Math.min(8, parseInt(peasantSpec, 10) || 1);
  for (let i = 0; i < pn; i++) addUnit('peasant', PLAYER, cx + Math.cos(i * 1.6) * 2, cy + Math.sin(i * 1.6) * 2 + 1.5);
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const militiaSpec = params.get('militia');
if (militiaSpec && S.mode === 'playing') {
  for (const u of S.units.filter(x => x.team === PLAYER && x.type === 'peasant')) S.selected.push(u);
  tryMilitia();
  if (window.__dbgUpdate) window.__dbgUpdate();
}
const researchSpec = params.get('research');
if (researchSpec && S.mode === 'playing') { researchTech(researchSpec); if (window.__dbgUpdate) window.__dbgUpdate(); }
const keysSpec = params.get('keys');
if (keysSpec === '1' && S.mode === 'playing') {
  window.__keyLog = [];
  const fireKey = (key, opts) => {
    window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key, bubbles: true }, opts || {})));
    window.__keyLog.push(S.tab);
  };
  for (const kk of ['1', '2', '3', '4', '5']) fireKey(kk);
  fireKey('3', { shiftKey: true });
  if (window.__dbgUpdate) window.__dbgUpdate();
}
if (castMiniSpec && S.mode === 'playing') {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
  if (keep) applyMiniAt(keep.x, keep.y + 2);
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?end=win|lose 直接触发结算画面，便于无头测试结算 UI。
const endSpec = params.get('end');
if (endSpec && S.mode === 'playing') {
  S.stats.kills = 42; S.stats.losses = 3; S.stats.gathered = 2600;
  endGame(endSpec === 'win');
}
const warpSec = parseFloat(params.get('warp') || '0');
if (Number.isFinite(warpSec) && warpSec > 0 && S.mode === 'playing') {
  const steps = Math.min(4000, Math.round(warpSec * 20));
  for (let i = 0; i < steps; i++) update(1 / 20);
  if (window.__dbgUpdate) window.__dbgUpdate();
}
// 调试用：?place=1 把已就绪的建筑直接放到主堡旁（在 warp 之后执行），验证「就绪→放置」流程。
const placeSpec = params.get('place');
if (placeSpec && S.mode === 'playing' && S.buildQ.cur && S.buildQ.cur.ready) {
  const keep = S.buildings.find(b => b.team === PLAYER && b.type === 'keep');
  const spot = findKeepSpot((keep ? keep.x : 9) + 4, (keep ? keep.y : 34) + 4);
  if (spot) {
    startPlacement(S.buildQ.cur.type);
    if (S.placing) {
      S.placing.tx = spot.tx; S.placing.ty = spot.ty;
      S.placing.valid = canPlace(S.buildQ.cur.type, spot.tx, spot.ty);
      if (S.placing.valid) placeBuilding();
    }
  }
  if (window.__dbgUpdate) window.__dbgUpdate();
}
if (params.has('t')) {
  setTimeout(() => { S.time = 0; }, 50);
}
})();
