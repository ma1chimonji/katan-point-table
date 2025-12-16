// --- 1. Firebase設定 (自分の情報に書き換えてください) ---
const firebaseConfig = {
    apiKey: "AIzaSy...",          // あなたのAPI Key
    authDomain: "...",            // あなたのAuth Domain
    databaseURL: "https://...",   // あなたのDatabase URL
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
};

// Firebase初期化
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
// db変数はfirebaseが使える場合のみ代入
const db = (typeof firebase !== 'undefined') ? firebase.database() : null;

// --- 2. ゲームID管理 ---
const params = new URLSearchParams(window.location.search);
const gameId = params.get("game") || "default_room";
const roomRef = db ? db.ref("catan_games/" + gameId) : null;

// --- 3. ルールモジュール定義 ---
const MODULES = {
    fishermen: {
        name: "🐟 漁師たち",
        pointsMod: 0, 
        desc: "ボロ靴(-1点)を追加",
        rules: [
            { id: 'old_shoe', name: '👢 ボロ靴', points: -1, type: 'boolean', unique: true } 
        ]
    },
    rivers: {
        name: "🌊 河川",
        pointsMod: 0,
        desc: "金持ち(+1)/貧乏(-2)を追加",
        rules: [
            { id: 'wealthiest', name: '💰 金持ち', points: 1, type: 'boolean', unique: true },
            { id: 'poorest', name: '📉 貧乏', points: -2, type: 'boolean', unique: false }
        ]
    },
    caravan: {
        name: "🐪 キャラバン",
        pointsMod: 2, 
        desc: "勝利点12 / 盤面で計算",
        rules: [] 
    },
    barbarian_attack: {
        name: "⚔️ 蛮族の襲撃",
        pointsMod: 2, 
        desc: "捕虜カウント追加 / 最大騎士無効",
        disableArmy: true,
        rules: [
            { id: 'prisoners', name: '⛓️ 捕虜(2体毎)', points: 1, type: 'counter' }
        ]
    },
    traders: {
        name: "🛒 商人と蛮族",
        pointsMod: 3, 
        desc: "配達 / 馬車Lv5 / 交易路無効",
        disableRoad: true,
        rules: [
            { id: 'deliveries', name: '📦 配達完了', points: 1, type: 'counter' },
            { id: 'wagon_lv5', name: '🐎 馬車Lv5', points: 1, type: 'boolean', unique: false }
        ]
    },
    cities_knights: {
        name: "🛡️ 都市と騎士",
        pointsMod: 3,
        desc: "VP加算のみ(簡易版)",
        rules: [
             { id: 'metropolis', name: '🏛️ メトロポリス', points: 2, type: 'counter' },
             { id: 'defender', name: '🎖️ カタンの救世主', points: 1, type: 'counter' }
        ]
    }
};

// --- 4. 状態管理 ---
let activeModules = new Set(); 
let userCustomRules = []; 
let targetScore = 10;
let players = []; 

const container = document.getElementById('player-container');
const checkboxesContainer = document.getElementById('module-checkboxes');
const customRulesListContainer = document.getElementById('active-custom-rules-list'); // 追加
const targetInput = document.getElementById('target-score-input');
const winnerModal = document.getElementById('winner-modal');

// --- 5. 同期・保存処理 ---
function saveToCloud() {
    if (!roomRef) { render(); return; } // Firebaseなしなら即描画
    roomRef.set({
        players: players,
        activeModules: Array.from(activeModules),
        userCustomRules: userCustomRules,
        targetScore: targetScore,
        lastUpdated: Date.now()
    }).catch(console.error);
}

if (roomRef) {
    roomRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            players = data.players || [];
            activeModules = new Set(data.activeModules || []);
            userCustomRules = data.userCustomRules || [];
            targetScore = data.targetScore || 10;
            targetInput.value = targetScore;
            syncCheckboxes();
            renderCustomRulesList(); // 追加ルールの表示更新
            render();
        } else {
            initGameData();
        }
    });
} else {
    initGameData();
}

function initGameData() {
    players = [
        { id: 1, name: "Player 1", color: "#e74c3c", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
        { id: 2, name: "Player 2", color: "#3498db", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
        { id: 3, name: "Player 3", color: "#f39c12", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
        { id: 4, name: "Player 4", color: "#ffffff", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} }
    ];
    activeModules = new Set();
    userCustomRules = [];
    targetScore = 10;
    saveToCloud();
}

// --- 6. UI操作系 ---

function syncCheckboxes() {
    initCheckboxes(); 
    const checks = checkboxesContainer.querySelectorAll('input[type="checkbox"]');
    checks.forEach(chk => {
        if (activeModules.has(chk.value)) {
            chk.checked = true;
        }
    });
}

function initCheckboxes() {
    checkboxesContainer.innerHTML = '';
    Object.keys(MODULES).forEach(key => {
        const mod = MODULES[key];
        const label = document.createElement('label');
        label.className = 'config-item';
        label.innerHTML = `
            <input type="checkbox" value="${key}" onchange="handleConfigChange()">
            ${mod.name}
        `;
        checkboxesContainer.appendChild(label);
    });
}

function handleConfigChange() {
    const checks = checkboxesContainer.querySelectorAll('input[type="checkbox"]');
    const newModules = new Set();
    checks.forEach(chk => {
        if (chk.checked) newModules.add(chk.value);
    });
    
    let maxMod = 0;
    newModules.forEach(key => {
        const mod = MODULES[key];
        if (mod.pointsMod > maxMod) maxMod = mod.pointsMod;
    });
    
    activeModules = newModules;
    targetScore = 10 + maxMod;
    saveToCloud();
}

targetInput.addEventListener('change', (e) => {
    targetScore = parseInt(e.target.value) || 10;
    saveToCloud();
});

// 手動追加ルールのリスト表示・削除機能
function renderCustomRulesList() {
    customRulesListContainer.innerHTML = '';
    userCustomRules.forEach(rule => {
        const tag = document.createElement('div');
        tag.className = 'custom-rule-tag';
        tag.innerHTML = `
            ${rule.name} (${rule.points})
            <button class="remove-rule-btn" onclick="deleteCustomRule('${rule.id}')">✕</button>
        `;
        customRulesListContainer.appendChild(tag);
    });
}

// 追加ルール削除
function deleteCustomRule(ruleId) {
    if (!confirm('この追加ルールを削除しますか？')) return;
    
    // ルール一覧から削除
    userCustomRules = userCustomRules.filter(r => r.id !== ruleId);
    
    // 全プレイヤーの該当ルールのデータもゴミ掃除（必須ではないが綺麗にするため）
    players.forEach(p => {
        if (p.custom && p.custom[ruleId] !== undefined) {
            delete p.custom[ruleId];
        }
    });
    
    saveToCloud();
}

function addCustomRule() {
    const name = document.getElementById('new-rule-name').value;
    const pts = document.getElementById('new-rule-points').value;
    const type = document.getElementById('new-rule-type').value;
    if(!name) return;
    
    userCustomRules.push({
        id: 'u_' + Date.now(),
        name: name,
        points: parseInt(pts),
        type: type,
        unique: type === 'boolean'
    });
    document.getElementById('new-rule-name').value = '';
    saveToCloud();
}

// --- アクション系 ---

function updateCount(id, type, delta) {
    const p = players.find(x => x.id === id);
    if(p[type] + delta < 0) return;
    if(type === 'settlements' && p[type] + delta > 5) return;
    if(type === 'cities' && p[type] + delta > 4) return;
    p[type] += delta;
    saveToCloud(); 
}

function updateCustomCount(id, rId, delta) {
    const p = players.find(x => x.id === id);
    if(!p.custom) p.custom = {};
    if(!p.custom[rId]) p.custom[rId] = 0;
    if(p.custom[rId] + delta < 0) return;
    p.custom[rId] += delta;
    saveToCloud();
}

function toggleBonus(id, type) {
    const p = players.find(x => x.id === id);
    const isActive = p[type];
    players.forEach(x => x[type] = false);
    if(!isActive) p[type] = true;
    saveToCloud();
}

// ★修正: 金持ち/貧乏の排他制御を追加
function toggleCustomBonus(id, rId, unique) {
    const p = players.find(x => x.id === id);
    if(!p.custom) p.custom = {};
    const isActive = p.custom[rId] === true;
    
    // ユニーク（独占）なら他プレイヤーのフラグを折る
    if(unique) players.forEach(x => {
        if(!x.custom) x.custom = {};
        x.custom[rId] = false;
    });
    
    // ▼▼▼ 追加修正箇所 ▼▼▼
    // 「金持ち(wealthiest)」をONにする時、その人の「貧乏(poorest)」をOFFにする
    if (rId === 'wealthiest' && !isActive) {
        p.custom['poorest'] = false;
    }
    // 「貧乏(poorest)」をONにする時、その人の「金持ち(wealthiest)」をOFFにする
    if (rId === 'poorest' && !isActive) {
        p.custom['wealthiest'] = false;
    }
    // ▲▲▲ 追加修正箇所 ▲▲▲

    if (isActive) {
        p.custom[rId] = false;
    } else {
        p.custom[rId] = true;
    }
    saveToCloud();
}

// プレイヤー管理
document.getElementById('add-player-btn').addEventListener('click', () => {
    const newId = players.length > 0 ? Math.max(...players.map(p => p.id)) + 1 : 1;
    players.push({
        id: newId, name: `Player ${newId}`, color: '#ffffff',
        settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {}
    });
    saveToCloud();
});

function removePlayer(id) {
    if(confirm('削除？')) {
        players = players.filter(p => p.id !== id);
        saveToCloud();
    }
}
function updateName(id, val) { 
    players.find(p => p.id === id).name = val; 
    saveToCloud(); 
}
function updateColor(id, val) { 
    players.find(p => p.id === id).color = val; 
    saveToCloud(); 
}

// --- 描画ロジック ---
function render() {
    container.innerHTML = '';
    renderCustomRulesList(); // ルールリストも再描画

    let disableRoad = false;
    let disableArmy = false;
    let activeCustomRules = [...userCustomRules];

    activeModules.forEach(key => {
        if (MODULES[key]) {
            const mod = MODULES[key];
            if (mod.disableRoad) disableRoad = true;
            if (mod.disableArmy) disableArmy = true;
            activeCustomRules = activeCustomRules.concat(mod.rules);
        }
    });

    players.forEach(player => {
        if (!player.custom) player.custom = {};

        const score = calculateScore(player, activeCustomRules, disableRoad, disableArmy);
        const card = document.createElement('div');
        card.className = 'player-card';
        card.style.borderTopColor = player.color;

        let countersHtml = '';
        let buttonsHtml = '';

        activeCustomRules.forEach(rule => {
            if (rule.type === 'counter') {
                const val = player.custom[rule.id] || 0;
                countersHtml += `
                <div class="score-row">
                    <span>${rule.name} (${rule.points}点)</span>
                    <div class="control-group">
                        <button class="control-btn" onclick="updateCustomCount(${player.id}, '${rule.id}', -1)">-</button>
                        <span class="count-display">${val}</span>
                        <button class="control-btn" onclick="updateCustomCount(${player.id}, '${rule.id}', 1)">+</button>
                    </div>
                </div>`;
            } else if (rule.type === 'boolean') {
                const isActive = player.custom[rule.id] === true;
                const isNegative = rule.points < 0;
                buttonsHtml += `
                    <button class="bonus-btn ${isActive ? 'active' : ''} ${isNegative ? 'negative' : ''}" 
                            onclick="toggleCustomBonus(${player.id}, '${rule.id}', ${rule.unique})">
                        ${rule.name}<br>(${rule.points}点)
                    </button>
                `;
            }
        });

        let baseBonusHtml = '';
        if (!disableRoad) {
            baseBonusHtml += `<button class="bonus-btn ${player.road ? 'active' : ''}" onclick="toggleBonus(${player.id}, 'road')">🛤️ 最長交易路<br>(2点)</button>`;
        }
        if (!disableArmy) {
            baseBonusHtml += `<button class="bonus-btn ${player.army ? 'active' : ''}" onclick="toggleBonus(${player.id}, 'army')">⚔️ 最大騎士力<br>(2点)</button>`;
        }

        card.innerHTML = `
            <div class="player-header">
                <input type="text" class="player-name" value="${player.name}" onchange="updateName(${player.id}, this.value)">
                <input type="color" class="color-select" value="${player.color}" onchange="updateColor(${player.id}, this.value)">
                <span class="total-score">${score} VP</span>
            </div>

            <div class="score-row">
                <span>🏠 開拓地 (1点)</span>
                <div class="control-group">
                    <button class="control-btn" onclick="updateCount(${player.id}, 'settlements', -1)">-</button>
                    <span class="count-display">${player.settlements}</span>
                    <button class="control-btn" onclick="updateCount(${player.id}, 'settlements', 1)">+</button>
                </div>
            </div>
            <div class="score-row">
                <span>🏰 都市 (2点)</span>
                <div class="control-group">
                    <button class="control-btn" onclick="updateCount(${player.id}, 'cities', -1)">-</button>
                    <span class="count-display">${player.cities}</span>
                    <button class="control-btn" onclick="updateCount(${player.id}, 'cities', 1)">+</button>
                </div>
            </div>
            <div class="score-row">
                <span>🃏 発展カード (1点)</span>
                <div class="control-group">
                    <button class="control-btn" onclick="updateCount(${player.id}, 'vpCards', -1)">-</button>
                    <span class="count-display">${player.vpCards}</span>
                    <button class="control-btn" onclick="updateCount(${player.id}, 'vpCards', 1)">+</button>
                </div>
            </div>

            ${countersHtml}

            <div class="bonus-grid">
                ${baseBonusHtml}
                ${buttonsHtml}
            </div>
            
            <button class="delete-btn" onclick="removePlayer(${player.id})">削除</button>
        `;
        container.appendChild(card);
    });
    
    checkWinner(disableRoad, disableArmy);
}

function calculateScore(p, rules, noRoad, noArmy) {
    let score = (p.settlements * 1) + (p.cities * 2) + (p.vpCards * 1);
    if (!noRoad && p.road) score += 2;
    if (!noArmy && p.army) score += 2;

    rules.forEach(rule => {
        if (!p.custom) p.custom = {}; 
        if (rule.type === 'boolean') {
            if (p.custom[rule.id] === true) score += parseInt(rule.points);
        } else if (rule.type === 'counter') {
            const count = p.custom[rule.id] || 0;
            score += count * parseInt(rule.points);
        }
    });

    return Math.max(0, score);
}

function checkWinner(noRoad, noArmy) {
    let activeRules = [...userCustomRules];
    activeModules.forEach(key => {
        if (MODULES[key]) activeRules = activeRules.concat(MODULES[key].rules);
    });

    const winner = players.find(p => calculateScore(p, activeRules, noRoad, noArmy) >= targetScore);
    if (winner) {
        setTimeout(() => {
            document.getElementById('winner-score-display').textContent = targetScore;
            winnerModal.querySelector('h2').textContent = `${winner.name} の勝利！`;
            winnerModal.classList.remove('hidden');
        }, 100);
    }
}
function closeModal() { winnerModal.classList.add('hidden'); }
