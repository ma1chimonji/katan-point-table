// --- ルールモジュール定義 ---
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
        pointsMod: 2, // 10+2=12点
        desc: "勝利点12 / 盤面で計算",
        rules: [] 
    },
    barbarian_attack: {
        name: "⚔️ 蛮族の襲撃",
        pointsMod: 2, // 10+2=12点
        desc: "捕虜カウント追加 / 最大騎士無効",
        disableArmy: true,
        rules: [
            { id: 'prisoners', name: '⛓️ 捕虜(2体毎)', points: 1, type: 'counter' }
        ]
    },
    traders: {
        name: "🛒 商人と蛮族",
        pointsMod: 3, // 10+3=13点
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

// --- 状態管理 ---
let activeModules = new Set(); 
let userCustomRules = []; 
let targetScore = 10;

// 初期プレイヤー設定：4人（4人目は白）
let players = [
    { id: 1, name: "Player 1", color: "#e74c3c", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
    { id: 2, name: "Player 2", color: "#3498db", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
    { id: 3, name: "Player 3", color: "#f39c12", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} },
    { id: 4, name: "Player 4", color: "#ffffff", settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {} }
];

// --- 初期化 & イベント ---
const container = document.getElementById('player-container');
const checkboxesContainer = document.getElementById('module-checkboxes');
const targetInput = document.getElementById('target-score-input');
const winnerModal = document.getElementById('winner-modal');

// モジュール選択肢の生成
function initCheckboxes() {
    checkboxesContainer.innerHTML = '';
    Object.keys(MODULES).forEach(key => {
        const mod = MODULES[key];
        const label = document.createElement('label');
        label.className = 'config-item';
        label.innerHTML = `
            <input type="checkbox" value="${key}" onchange="updateConfig()">
            ${mod.name}
        `;
        checkboxesContainer.appendChild(label);
    });
}

// 設定更新
function updateConfig() {
    activeModules.clear();
    const checks = checkboxesContainer.querySelectorAll('input[type="checkbox"]');
    
    checks.forEach(chk => {
        if (chk.checked) activeModules.add(chk.value);
    });

    let maxMod = 0;
    activeModules.forEach(key => {
        const mod = MODULES[key];
        if (mod.pointsMod > maxMod) maxMod = mod.pointsMod;
    });
    
    targetScore = 10 + maxMod;
    targetInput.value = targetScore;
    
    render();
}

targetInput.addEventListener('change', (e) => {
    targetScore = parseInt(e.target.value) || 10;
    checkWinner();
});

// --- 描画ロジック ---
function render() {
    container.innerHTML = '';

    let disableRoad = false;
    let disableArmy = false;
    let activeCustomRules = [...userCustomRules];

    activeModules.forEach(key => {
        const mod = MODULES[key];
        if (mod.disableRoad) disableRoad = true;
        if (mod.disableArmy) disableArmy = true;
        activeCustomRules = activeCustomRules.concat(mod.rules);
    });

    players.forEach(player => {
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

// 計算
function calculateScore(p, rules, noRoad, noArmy) {
    let score = (p.settlements * 1) + (p.cities * 2) + (p.vpCards * 1);
    if (!noRoad && p.road) score += 2;
    if (!noArmy && p.army) score += 2;

    rules.forEach(rule => {
        if (rule.type === 'boolean') {
            if (p.custom[rule.id] === true) score += parseInt(rule.points);
        } else if (rule.type === 'counter') {
            const count = p.custom[rule.id] || 0;
            score += count * parseInt(rule.points);
        }
    });

    return Math.max(0, score);
}

function updateCount(id, type, delta) {
    const p = players.find(x => x.id === id);
    if(p[type] + delta < 0) return;
    if(type === 'settlements' && p[type] + delta > 5) return;
    if(type === 'cities' && p[type] + delta > 4) return;
    p[type] += delta;
    render();
}

function updateCustomCount(id, rId, delta) {
    const p = players.find(x => x.id === id);
    if(!p.custom[rId]) p.custom[rId] = 0;
    if(p.custom[rId] + delta < 0) return;
    p.custom[rId] += delta;
    render();
}

function toggleBonus(id, type) {
    const p = players.find(x => x.id === id);
    const isActive = p[type];
    players.forEach(x => x[type] = false);
    if(!isActive) p[type] = true;
    render();
}

function toggleCustomBonus(id, rId, unique) {
    const p = players.find(x => x.id === id);
    const isActive = p.custom[rId] === true;
    
    if(unique) players.forEach(x => x.custom[rId] = false);
    
    if (isActive) {
        p.custom[rId] = false;
    } else {
        p.custom[rId] = true;
    }
    render();
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
    render();
}

// プレイヤー管理
document.getElementById('add-player-btn').addEventListener('click', () => {
    const newId = players.length > 0 ? Math.max(...players.map(p => p.id)) + 1 : 1;
    players.push({
        id: newId, name: `Player ${newId}`, color: '#ffffff',
        settlements: 2, cities: 0, road: false, army: false, vpCards: 0, custom: {}
    });
    render();
});

function removePlayer(id) {
    if(confirm('削除？')) {
        players = players.filter(p => p.id !== id);
        render();
    }
}
function updateName(id, val) { players.find(p => p.id === id).name = val; }
function updateColor(id, val) { players.find(p => p.id === id).color = val; render(); }

// 勝利判定
function checkWinner(noRoad, noArmy) {
    let activeRules = [...userCustomRules];
    activeModules.forEach(key => activeRules = activeRules.concat(MODULES[key].rules));

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

// スタート
initCheckboxes();
render();