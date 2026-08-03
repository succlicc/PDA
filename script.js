const supabaseUrl = 'https://api.pda-freedom.online'; 
const supabaseKey = 'sb_publishable_mPj_HTIpjAiyvwvW23vCdg_sHWFMvAI';
const db = window.supabase.createClient(supabaseUrl, supabaseKey);
 
let currentTab = 'finance';
let currentStalkerId = null;
let currentFactionTaskId = null;
let currentFactionTasksList = []; 
let lastObsValue = null;
let lastPahankiValue = null;

let currentStockData = [];
let stockSortCol = 'name';
let stockSortDir = 1; 

let currentBaseCategory = 'friendly'; 

let allMembersList = [];
let allStalkersList = []; 
let currentMemberCallsign = null;
let currentMemberTasksList = [];

const rankWeights = {
    'anarchist': 1,
    'strong': 2,
    'rastafarian': 3,
    'technick': 4,
    'guardian': 5,
    'freeman': 6,
    'weed': 7,
    'seed': 8
};

function getRankWeight(rank) {
    let r = rank.toLowerCase().trim();
    return rankWeights[r] || 99; 
}

function getMondays() {
    let now = new Date();
    let day = now.getDay() || 7; 
    if (day !== 1) now.setHours(-24 * (day - 1)); 
    now.setHours(0, 0, 0, 0);
    let thisMonday = new Date(now);
    let lastMonday = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);
    return { thisMonday, lastMonday };
}

function checkSession() {
  let savedUser = localStorage.getItem('freedom_user');
  if (savedUser) {
    window.currentUser = JSON.parse(savedUser);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('onlineRadar').style.display = 'block';
    document.getElementById('calc-widget').style.display = 'block';
    document.getElementById('userGreeting').textContent = `👋 Хай, ${window.currentUser.callsign} [${window.currentUser.rank}]`;
    applyRoles(window.currentUser.role);
    fetchObshchak();
    updateOnlineStatus();
    loadMembersList(true); 
  }
}

async function logout() {
  if (window.currentUser) {
      await db.from('online_users').delete().eq('callsign', window.currentUser.callsign);
  }
  localStorage.removeItem('freedom_user');
  window.currentUser = null;
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('onlineRadar').style.display = 'none';
  document.getElementById('calc-widget').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
}

async function login() {
  let user = document.getElementById('username').value.trim();
  let pass = document.getElementById('password').value.trim();
  let msg = document.getElementById('login-msg');
  if (!user || !pass) { msg.textContent = 'Заполни все поля!'; msg.className = 'error-message'; return; }

  let btn = document.getElementById('login-btn'); let originalText = btn.innerHTML;
  btn.innerHTML = 'Подключение...'; btn.classList.add('loading');

  const { data, error } = await db.from('freedom_members').select('*').eq('callsign', user).eq('password', pass).single();

  if (error || !data) {
    msg.textContent = 'Доступ запрещен!'; msg.className = 'error-message'; 
    btn.innerHTML = originalText; btn.classList.remove('loading'); return;
  }

  window.currentUser = data;
  localStorage.setItem('freedom_user', JSON.stringify(data));
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-app').style.display = 'flex';
  document.getElementById('onlineRadar').style.display = 'block';
  document.getElementById('calc-widget').style.display = 'block';
  document.getElementById('userGreeting').textContent = `👋 Хай, ${data.callsign} [${data.rank}]`;
  
  applyRoles(data.role); 
  fetchObshchak(); 
  updateOnlineStatus();
  loadMembersList(true);
}

function applyRoles(role) {
  if (role === 'admin' || role === 'curator') document.body.classList.add('is-admin');
  else document.body.classList.remove('is-admin');
}

function toggleCalc() {
    let body = document.getElementById('calc-body');
    let icon = document.getElementById('calc-toggle-icon');
    if(body.style.display === 'none' || body.style.display === '') {
        body.style.display = 'block';
        icon.textContent = '▼';
    } else {
        body.style.display = 'none';
        icon.textContent = '▲';
    }
}
function calcAppend(val) { document.getElementById('calc-display').value += val; }
function calcClear() { document.getElementById('calc-display').value = ''; }
function calcCalculate() {
    try {
        let expr = document.getElementById('calc-display').value;
        let res = new Function('return ' + expr)();
        if (res !== undefined) document.getElementById('calc-display').value = res;
    } catch(e) {
        document.getElementById('calc-display').value = 'Ошибка';
        setTimeout(calcClear, 1500);
    }
}

async function updateOnlineStatus() {
  if (!window.currentUser) return;
  
  await db.from('online_users').upsert(
      { callsign: window.currentUser.callsign, last_active_at: new Date().toISOString() }, 
      { onConflict: 'callsign' }
  );

  let timeAgo = new Date(Date.now() - 90000).toISOString();
  const { data } = await db.from('online_users').select('callsign').gte('last_active_at', timeAgo);
  
  if (data) {
      document.getElementById('online-count').textContent = data.length;
      let html = '';
      data.forEach(u => {
          let isMe = u.callsign === window.currentUser.callsign ? ' <span style="color:#5a8a5a; font-size:0.6rem;">(Ты)</span>' : '';
          html += `
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <div style="width: 6px; height: 6px; background: #0f0; border-radius: 50%; box-shadow: 0 0 5px #0f0;"></div>
              ${u.callsign}${isMe}
            </div>`;
      });
      document.getElementById('online-list').innerHTML = html;
  }
}

async function fetchObshchak() {
  const { data } = await db.from('global_state').select('obshchak_total, pahanki_total').eq('id', 1).single();
  if (data) { 
      let obsSpan = document.getElementById('obs'); let pahSpan = document.getElementById('pahanki-obs');
      
      if (lastObsValue !== null && lastObsValue !== data.obshchak_total) {
          obsSpan.classList.remove('pulse-anim'); void obsSpan.offsetWidth; obsSpan.classList.add('pulse-anim');
      }
      if (lastPahankiValue !== null && lastPahankiValue !== data.pahanki_total) {
          pahSpan.classList.remove('pulse-pahanka-anim'); void pahSpan.offsetWidth; pahSpan.classList.add('pulse-pahanka-anim');
      }
      
      obsSpan.textContent = data.obshchak_total.toLocaleString(); pahSpan.textContent = (data.pahanki_total || 0).toLocaleString(); 
      lastObsValue = data.obshchak_total; lastPahankiValue = data.pahanki_total;
  }
}

async function submitOperation() {
  if (!window.currentUser) return; 
  let amount = parseInt(document.getElementById('amount').value);
  let reason = document.getElementById('reason').value.trim() || '—';
  let isSilent = document.getElementById('silentEdit').checked;
  let msgDiv = document.getElementById('message');
  if (isNaN(amount)) { msgDiv.textContent = 'Введи сумму!'; msgDiv.className = 'error-message'; return; }
  
  let btn = document.getElementById('submitBtn');
  btn.disabled = true;

  const { data: latestData } = await db.from('global_state').select('obshchak_total').eq('id', 1).single();
  let currentTotal = latestData ? latestData.obshchak_total : 0;
  let newTotal = currentTotal + amount;
  
  await db.from('global_state').update({ obshchak_total: newTotal }).eq('id', 1);
  if (!isSilent) await db.from('obshchak_logs').insert([{ callsign: window.currentUser.callsign, amount: amount, reason: reason }]);
  
  msgDiv.textContent = '✓ Операция проведена'; msgDiv.className = 'success-message';
  document.getElementById('amount').value = ''; document.getElementById('reason').value = ''; document.getElementById('silentEdit').checked = false;
  btn.disabled = false;
  
  fetchObshchak(); setTimeout(() => { msgDiv.textContent = ''; }, 2000);
}

async function submitHabarRating() {
  if (!window.currentUser) return;
  let amount = parseInt(document.getElementById('habar_amount').value);
  let reason = document.getElementById('habar_reason').value.trim() || 'Сдача ценного хабара';
  let msgDiv = document.getElementById('habar_message');

  if (isNaN(amount) || amount <= 0) {
      msgDiv.textContent = 'Введи корректную сумму!'; msgDiv.className = 'error-message'; return;
  }

  let checkboxes = document.querySelectorAll('.habar-cb:checked');
  if (checkboxes.length === 0) {
      msgDiv.textContent = 'Выбери хотя бы одного участника!'; msgDiv.className = 'error-message'; return;
  }

  let btn = document.getElementById('btnSubmitHabar');
  btn.disabled = true;

  let splitAmount = Math.round(amount / checkboxes.length);
  let logsToInsert = [];

  checkboxes.forEach(cb => {
      logsToInsert.push({ callsign: cb.value, amount: splitAmount, reason: `[РЕЙТИНГ] ${reason}` });
  });

  const { error } = await db.from('obshchak_logs').insert(logsToInsert);

  if (error) {
      msgDiv.textContent = 'Ошибка при записи!'; msgDiv.className = 'error-message';
  } else {
      msgDiv.textContent = `✓ Зачислено по ${splitAmount.toLocaleString()} руб. (${checkboxes.length} чел.)`;
      msgDiv.className = 'success-message';
      document.getElementById('habar_amount').value = '';
      document.getElementById('habar_reason').value = '';
      document.querySelectorAll('.habar-cb').forEach(cb => cb.checked = false);
      if (currentTab === 'rating') loadRating(true);
      if (currentTab === 'history') loadHistory(true);
  }

  btn.disabled = false;
  setTimeout(() => { msgDiv.textContent = ''; }, 4000);
}

async function submitPahanki() {
  if (!window.currentUser) return; 
  let amount = parseInt(document.getElementById('p_amount').value);
  let reason = document.getElementById('p_reason').value.trim() || '—';
  let msgDiv = document.getElementById('message');
  if (isNaN(amount)) { msgDiv.textContent = 'Введи сумму для Паханки!'; msgDiv.className = 'error-message'; return; }
  
  let btn = document.getElementById('submitPahankiBtn');
  btn.disabled = true; 

  const { data: latestData } = await db.from('global_state').select('pahanki_total').eq('id', 1).single();
  let currentTotal = latestData ? latestData.pahanki_total : 0;
  let newTotal = currentTotal + amount;

  await db.from('global_state').update({ pahanki_total: newTotal }).eq('id', 1);
  await db.from('obshchak_logs').insert([{ callsign: window.currentUser.callsign, amount: amount, reason: `[ПАХАНКА] ${reason}` }]);
  
  msgDiv.textContent = '✓ Паханка обновлена'; msgDiv.className = 'success-message';
  document.getElementById('p_amount').value = ''; document.getElementById('p_reason').value = '';
  btn.disabled = false;

  fetchObshchak(); setTimeout(() => { msgDiv.textContent = ''; }, 2000);
}

function switchTab(tabName) {
  if (currentTab === 'stock' && tabName !== 'stock') {
      document.getElementById('categorySelect').value = '';
      document.getElementById('stockSearch').value = '';
      currentStockData = [];
      document.getElementById('stockBody').innerHTML = '<tr><td colspan="4" style="text-align: center;">-- Выбери категорию или введи в поиск --</td></tr>';
  }

  currentTab = tabName;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
  document.querySelectorAll('.tabs button').forEach(btn => {
    if(btn.getAttribute('data-tab') === tabName) btn.classList.add('active'); else btn.classList.remove('active');
  });

  if (tabName === 'stock') { if(document.getElementById('categorySelect').value) loadStock(); }
  if (tabName === 'rating') loadRating();
  if (tabName === 'history') loadHistory();
  if (tabName === 'stalkers') loadStalkers();
  if (tabName === 'faction-tasks') loadFactionTasks();
  if (tabName === 'housing') loadHousing();
  if (tabName === 'members-crm') loadMembersList();
}

function toggleForm(formId) {
  let form = document.getElementById(formId);
  form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  if(modalId === 'stalkerModal') { document.getElementById('newTaskForm').style.display = 'none'; currentStalkerId = null; }
  if(modalId === 'factionTaskModal') { currentFactionTaskId = null; }
  if(modalId === 'memberProfileModal') { currentMemberCallsign = null; document.getElementById('newMemberTaskForm').style.display = 'none'; }
  if(modalId === 'editMemberPhotoModal') { document.getElementById('emp_photo_base64').value = ''; document.getElementById('emp_preview').style.display = 'none'; }
  if(modalId === 'editStalkerPhotoModal') { document.getElementById('esp_photo_base64').value = ''; document.getElementById('esp_preview').style.display = 'none'; }
  if(modalId === 'editMemberInfoModal') { document.getElementById('emi_exp').value = ''; document.getElementById('emi_desc').value = ''; }
  if(modalId === 'globalRatingModal') { document.getElementById('globalRatingBody').innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Загрузка...</td></tr>'; }
}

async function searchStock() {
  let query = document.getElementById('stockSearch').value.trim();
  if (!query) return;
  let tbody = document.getElementById('stockBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Поиск по всей базе...</td></tr>';
  
  const { data } = await db.from('stock_items').select('category, name').ilike('name', `%${query}%`).limit(1);
  if (data && data.length > 0) {
    document.getElementById('categorySelect').value = data[0].category;
    await loadStock(data[0].name);
  } else {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ff6666;">Предмет не найден</td></tr>';
    setTimeout(() => {
        let cat = document.getElementById('categorySelect').value;
        if (cat) loadStock();
        else tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">-- Выбери категорию или введи в поиск --</td></tr>';
    }, 2000);
  }
}

function parsePriceForSort(priceStr) {
    if (priceStr === 'Не продается') return 999999999;
    let p = String(priceStr).toUpperCase();
    let num = parseFloat(p.replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return 0;
    if (p.includes('K') || p.includes('К')) num *= 1000;
    return num;
}

function sortStock(col) {
    if (stockSortCol === col) stockSortDir *= -1;
    else { stockSortCol = col; stockSortDir = 1; }
    renderStockTable();
}

function renderStockTable(highlightName = null) {
    let tbody = document.getElementById('stockBody');
    
    document.getElementById('th-name').innerHTML = 'Название' + (stockSortCol === 'name' ? (stockSortDir === 1 ? ' ▲' : ' ▼') : '');
    document.getElementById('th-price').innerHTML = 'Цена' + (stockSortCol === 'price' ? (stockSortDir === 1 ? ' ▲' : ' ▼') : '');
    document.getElementById('th-qty').innerHTML = 'Кол-во' + (stockSortCol === 'quantity' ? (stockSortDir === 1 ? ' ▲' : ' ▼') : '');

    if (!currentStockData || currentStockData.length === 0) {
        let cat = document.getElementById('categorySelect').value;
        if (cat) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Пусто</td></tr>';
        else tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">-- Выбери категорию или введи в поиск --</td></tr>';
        return;
    }

    currentStockData.sort((a, b) => {
        let valA, valB;
        if (stockSortCol === 'name') {
            valA = a.name.toLowerCase(); valB = b.name.toLowerCase();
            if(valA < valB) return -1 * stockSortDir;
            if(valA > valB) return 1 * stockSortDir;
            return 0;
        } else if (stockSortCol === 'price') {
            valA = parsePriceForSort(a.price); valB = parsePriceForSort(b.price);
            return (valA - valB) * stockSortDir;
        } else if (stockSortCol === 'quantity') {
            valA = a.quantity; valB = b.quantity;
            return (valA - valB) * stockSortDir;
        }
    });

    tbody.innerHTML = '';
    currentStockData.forEach(item => {
        let tr = tbody.insertRow(); 
        if (highlightName && item.name === highlightName) {
          tr.style.backgroundColor = 'rgba(76, 175, 80, 0.4)';
          setTimeout(() => tr.style.backgroundColor = 'transparent', 3000);
        }
        
        tr.insertCell(0).textContent = item.name;
        
        let priceCell = tr.insertCell(1); 
        let priceInput = document.createElement('input'); 
        priceInput.type = 'text'; 
        priceInput.value = item.price; 
        priceInput.className = 'qty-input';
        priceInput.style.width = '100px';
        if (item.price === 'Не продается') priceInput.style.color = '#ff6666';
        
        priceInput.addEventListener('change', (e) => { 
            let newVal = e.target.value.trim() || 'Не продается'; 
            updatePriceInDB(item.id, newVal); 
        });
        priceCell.appendChild(priceInput);

        let cellQty = tr.insertCell(2); let div = document.createElement('div'); div.className = 'qty-cell';
        let btnMinus = document.createElement('button'); btnMinus.textContent = '−'; btnMinus.className = 'qty-btn';
        btnMinus.onclick = () => updateQuantityInDB(item.id, item.quantity - 1);
        
        let input = document.createElement('input'); input.type = 'number'; input.value = item.quantity; input.className = 'qty-input';
        if (item.quantity === 0) input.style.borderColor = '#ff0000';
        input.addEventListener('change', (e) => { let newVal = parseInt(e.target.value); if (!isNaN(newVal) && newVal >= 0) updateQuantityInDB(item.id, newVal); else e.target.value = item.quantity; });
        
        let btnPlus = document.createElement('button'); btnPlus.textContent = '+'; btnPlus.className = 'qty-btn';
        btnPlus.onclick = () => updateQuantityInDB(item.id, item.quantity + 1);
        
        div.appendChild(btnMinus); div.appendChild(input); div.appendChild(btnPlus); 
        
        let btnDel = document.createElement('button');
        btnDel.textContent = '❌'; btnDel.className = 'qty-btn admin-only';
        btnDel.style.background = '#552a2a'; btnDel.style.border = 'none'; btnDel.style.marginLeft = '10px';
        btnDel.onclick = () => deleteStockItem(item.id);
        div.appendChild(btnDel);
        
        cellQty.appendChild(div);
    });

    if (highlightName) {
        let rows = tbody.querySelectorAll('tr');
        for(let r of rows) {
          if(r.cells[0].textContent === highlightName) { r.scrollIntoView({ behavior: 'smooth', block: 'center' }); break; }
        }
    }
}

async function loadStock(highlightName = null) {
  let cat = document.getElementById('categorySelect').value; 
  let tbody = document.getElementById('stockBody');
  if (!cat) return; 
  
  if(!highlightName) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Загрузка...</td></tr>';
  
  const { data } = await db.from('stock_items').select('*').eq('category', cat);
  currentStockData = data || [];
  renderStockTable(highlightName);
}

async function updateQuantityInDB(itemId, newQty) { if (newQty < 0) return; await db.from('stock_items').update({ quantity: newQty }).eq('id', itemId); loadStock(); }
async function updatePriceInDB(itemId, newPrice) { await db.from('stock_items').update({ price: newPrice }).eq('id', itemId); loadStock(); }

async function deleteStockItem(itemId) {
  if(!confirm('Удалить этот предмет со склада?')) return;
  await db.from('stock_items').delete().eq('id', itemId);
  loadStock();
}

async function createStockItem() {
  let cat = document.getElementById('si_category').value;
  let name = document.getElementById('si_name').value.trim();
  let price = document.getElementById('si_price').value.trim() || 'Не продается';
  let qty = parseInt(document.getElementById('si_qty').value) || 0;

  if (!cat || !name) return alert('Выбери категорию и впиши название!');

  await db.from('stock_items').insert([{ category: cat, name: name, price: price, quantity: qty }]);
  
  document.getElementById('si_name').value = ''; document.getElementById('si_price').value = ''; document.getElementById('si_qty').value = '1';
  toggleForm('stockItemForm');
  
  document.getElementById('categorySelect').value = cat;
  loadStock();
}

function switchBaseCategory(cat) {
  currentBaseCategory = cat;
  let tabs = document.querySelectorAll('.base-tab');
  tabs.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');
  loadStalkers();
}

function toggleEnemyReason() {
  let cat = document.getElementById('s_category').value;
  let reasonInput = document.getElementById('s_reason');
  if (cat === 'enemy') { reasonInput.style.display = 'block'; } 
  else { reasonInput.style.display = 'none'; reasonInput.value = ''; }
}

function handlePasteEvent(e, previewId, base64Id) {
  let items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let index in items) {
    if (items[index].kind === 'file') {
      let reader = new FileReader();
      reader.onload = function(event) {
        let img = new Image();
        img.onload = function() {
          let canvas = document.createElement('canvas'); let ctx = canvas.getContext('2d');
          let maxWidth = 300; let scale = maxWidth / img.width;
          canvas.width = maxWidth; canvas.height = img.height * scale;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let base64 = canvas.toDataURL('image/jpeg', 0.6);
          document.getElementById(previewId).src = base64;
          document.getElementById(previewId).style.display = 'inline-block';
          document.getElementById(base64Id).value = base64;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(items[index].getAsFile());
    }
  }
}

document.getElementById('pasteArea').addEventListener('paste', function(e) { handlePasteEvent(e, 'previewImage', 's_photo'); });
document.getElementById('memberPasteArea').addEventListener('paste', function(e) { handlePasteEvent(e, 'emp_preview', 'emp_photo_base64'); });
document.getElementById('stalkerPasteAreaEdit').addEventListener('paste', function(e) { handlePasteEvent(e, 'esp_preview', 'esp_photo_base64'); });


function filterStalkers() {
  let term = document.getElementById('stalkerSearch').value.toLowerCase();
  let cards = document.querySelectorAll('#stalkersGrid .card');
  cards.forEach(card => {
    let name = card.querySelector('h3').textContent.toLowerCase();
    if (name.includes(term)) card.style.display = 'block';
    else card.style.display = 'none';
  });
}

async function loadStalkers(isTick = false) {
  let grid = document.getElementById('stalkersGrid');
  if (!isTick) grid.innerHTML = '<div style="text-align: center; width: 100%;">Загрузка базы...</div>';
  
  const { data } = await db.from('stalkers').select('*').order('id', { ascending: false });
  allStalkersList = data || []; 
  
  const { data: tasksData } = await db.from('stalker_tasks').select('stalker_id').eq('is_completed', false);
  let activeCounts = {};
  if (tasksData) {
      tasksData.forEach(t => { activeCounts[t.stalker_id] = (activeCounts[t.stalker_id] || 0) + 1; });
  }

  let newHTML = '';
  if (!allStalkersList || allStalkersList.length === 0) { 
      newHTML = '<div style="text-align: center; width: 100%;">База пуста.</div>'; 
  } else {
    allStalkersList.forEach(s => {
      let cat = s.category || 'friendly';
      if (cat !== currentBaseCategory) return; 

      let statusColor = s.status === 'Доверенный' ? '#aaffaa' : '#ffaaaa';
      
      newHTML += `
        <div class="card" onclick="openStalkerModal(${s.id})" style="cursor: pointer;">
          <div class="stalker-photo">${s.photo_url ? `<img src="${s.photo_url}">` : '<span style="color: #2a6b2a;">[Нет фото]</span>'}</div>
          <h3 style="margin: 5px 0; color: #b3ffb3;">${cat === 'enemy' ? '💀' : '☢️'} ${s.nickname}</h3>`;
          
      if (cat === 'friendly') {
          let actCount = activeCounts[s.id] || 0;
          newHTML += `<p style="margin: 0 0 5px; color: ${statusColor}; font-size: 0.9rem;">${s.status}</p>
                      <p style="margin: 0; color: #8ab88a; font-size: 0.9rem; font-weight:bold;">Активные задания: <span>${actCount}</span></p>`;
      } else {
          newHTML += `<p style="margin: 0; color: #ff6666; font-size: 0.9rem;">За что: <b>${s.reason || 'Не указано'}</b></p>`;
      }

      newHTML += `</div>`;
    });
  }
  if(newHTML === '') newHTML = '<div style="text-align: center; width: 100%;">В этом списке пока пусто.</div>';
  grid.innerHTML = newHTML;
  filterStalkers();
}

async function createStalker() {
  let name = document.getElementById('s_name').value.trim(); 
  let photo = document.getElementById('s_photo').value;
  let category = document.getElementById('s_category').value;
  let reason = document.getElementById('s_reason').value.trim();

  if (!name) return alert('Укажи позывной!'); 
  
  await db.from('stalkers').insert([{ 
      nickname: name, 
      status: 'Не доверенный', 
      completed_tasks: 0, 
      failed_tasks: 0, 
      photo_url: photo,
      category: category,
      reason: reason 
  }]);
  
  document.getElementById('s_name').value = ''; 
  document.getElementById('s_photo').value = '';
  document.getElementById('s_reason').value = '';
  document.getElementById('previewImage').style.display = 'none'; 
  document.getElementById('previewImage').src = '';
  
  toggleForm('stalkerForm'); 
  loadStalkers();
}

async function editStalkerProfile() {
    if(!currentStalkerId) return;
    let newName = prompt('Изменить позывной:', document.getElementById('m_name').textContent);
    if (newName && newName.trim() !== '') {
        await db.from('stalkers').update({ nickname: newName.trim() }).eq('id', currentStalkerId);
        document.getElementById('m_name').textContent = newName.trim();
        loadStalkers(true);
    }
}

async function deleteCurrentStalker() {
    if(!currentStalkerId) return;
    if(confirm('Удалить досье из базы? Это необратимо.')) {
        await db.from('stalkers').delete().eq('id', currentStalkerId);
        await db.from('stalker_tasks').delete().eq('stalker_id', currentStalkerId);
        closeModal('stalkerModal'); loadStalkers();
    }
}

function openStalkerPhotoModal() {
  if (!document.body.classList.contains('is-admin')) return;
  let s = allStalkersList.find(x => x.id === currentStalkerId);
  if (!s) return;
  document.getElementById('esp_name').textContent = s.nickname;
  document.getElementById('esp_photo_base64').value = '';
  document.getElementById('esp_preview').style.display = 'none';
  document.getElementById('esp_preview').src = '';
  document.getElementById('editStalkerPhotoModal').style.display = 'flex';
}

async function saveStalkerPhoto() {
  let photoBase64 = document.getElementById('esp_photo_base64').value;
  if (!photoBase64) return alert('Сначала вставь картинку (Ctrl+V)!');
  
  let btn = document.getElementById('btnSaveStalkerPhoto');
  let oldText = btn.innerHTML;
  btn.innerHTML = 'Загрузка...';
  btn.disabled = true;

  await db.from('stalkers').update({ photo_url: photoBase64 }).eq('id', currentStalkerId);
  
  btn.innerHTML = oldText;
  btn.disabled = false;

  let photoContainer = document.getElementById('m_photo');
  photoContainer.innerHTML = `<img src="${photoBase64}" style="width:100%; height:100%; object-fit:cover;">`;
  
  let s = allStalkersList.find(x => x.id === currentStalkerId);
  if (s) s.photo_url = photoBase64;

  closeModal('editStalkerPhotoModal');
  loadStalkers(true); 
}

async function openStalkerModal(id) {
  currentStalkerId = id; 
  let s = allStalkersList.find(x => x.id === id);
  if (!s) return;

  document.getElementById('stalkerModal').style.display = 'flex';
  document.getElementById('m_name').textContent = s.nickname; 
  document.getElementById('m_completed').textContent = s.completed_tasks;
  document.getElementById('m_failed').textContent = s.failed_tasks || 0;
  
  let photoContainer = document.getElementById('m_photo');
  if (s.photo_url && s.photo_url !== 'null' && s.photo_url !== '') {
      photoContainer.innerHTML = `<img src="${s.photo_url}" style="width:100%; height:100%; object-fit:cover;">`; 
  } else {
      photoContainer.innerHTML = `<span style="color: #2a6b2a; font-size:0.8rem;">[Нет фото]</span>`;
  }

  let statusContainer = document.getElementById('m_status_container');
  let statsLine = document.getElementById('m_stats_line');
  let tasksWrapper = document.getElementById('m_tasks_wrapper');

  let cat = s.category || 'friendly';

  if (cat === 'friendly') {
      statsLine.style.display = 'block';
      tasksWrapper.style.display = 'block';
      if (document.body.classList.contains('is-admin')) {
        let isTrust = s.status === 'Доверенный' ? 'selected' : ''; let isNotTrust = s.status === 'Не доверенный' ? 'selected' : '';
        statusContainer.innerHTML = `<select onchange="changeStalkerStatus(${id}, this.value)" style="width: auto; padding: 5px; font-size: 0.9rem;"><option value="Доверенный" ${isTrust}>Доверенный</option><option value="Не доверенный" ${isNotTrust}>Не доверенный</option></select>`;
      } else {
        let color = s.status === 'Доверенный' ? '#aaffaa' : '#ffaaaa';
        statusContainer.innerHTML = `<span style="color:${color}; font-weight:bold;">${s.status}</span>`;
      }
      loadStalkerTasks(id);
  } else {
      statsLine.style.display = 'none';
      tasksWrapper.style.display = 'none';
      statusContainer.innerHTML = `<span style="color:#ff6666; font-weight:bold;">Причина: ${s.reason || 'Не указано'}</span>`;
  }
}

async function changeStalkerStatus(id, newStatus) { await db.from('stalkers').update({ status: newStatus }).eq('id', id); loadStalkers(); }

async function loadStalkerTasks(stalkerId) {
  let list = document.getElementById('m_tasks_list'); list.innerHTML = '<div style="text-align: center; color: #888;">Загрузка...</div>';
  const { data } = await db.from('stalker_tasks').select('*').eq('stalker_id', stalkerId).order('id', { ascending: false });
  if (!data || data.length === 0) { list.innerHTML = '<div style="text-align: center; color: #555;">Активных контрактов нет</div>'; return; }
  
  let isAdmin = document.body.classList.contains('is-admin');
  list.innerHTML = '';
  
  data.forEach(t => {
    let isGiver = t.giver === window.currentUser.callsign;
    let canEdit = isAdmin || isGiver; 

    let giverInfo = `<div style="font-size: 0.75rem; color: #ffaa00; margin-bottom: 5px;">Выдал: ${t.giver}</div>`;
    let deadlineColor = '#aaffaa'; let displayDate = t.deadline; let isLate = false;

    if (!t.is_completed && t.deadline && t.deadline !== '—') {
        let d = new Date(t.deadline);
        if (!isNaN(d.getTime())) {
            let today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
            let diff = (d - today) / (1000 * 3600 * 24);
            if (diff < 0) { deadlineColor = '#ff3333'; isLate = true; }
            else if (diff === 0) deadlineColor = '#ffaa00';
            else if (diff <= 2) deadlineColor = '#ffffaa';
            displayDate = d.toLocaleDateString();
        }
    } else if (t.is_completed && t.deadline && t.deadline !== '—') {
        let d = new Date(t.deadline);
        if (!isNaN(d.getTime())) displayDate = d.toLocaleDateString();
    }

    let safeTitle = t.title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    let safeReward = t.reward.replace(/'/g, "\\'");
    let cleanTitle = t.title.replace('[ПРОВАЛ] ', '').replace('[ОПОЗДАНИЕ] ', '');

    let actionBtn = '';
    if (!t.is_completed) {
        actionBtn = `
          <button class="qty-btn" style="background:#1a3a1a; padding: 4px 10px; font-size: 0.8rem;" onclick="completeTask(${t.id}, ${stalkerId}, ${isLate}, '${safeTitle}')">✅</button>
          <button class="qty-btn" style="background:#552a2a; color:#ffcccc; padding: 4px 10px; font-size: 0.8rem; margin-left:5px;" onclick="failTask(${t.id}, ${stalkerId}, '${safeTitle}')">❌</button>
        `;
    } else {
       if (t.title.includes('[ПРОВАЛ]')) actionBtn = `<span style="color:#ff6666; font-size: 0.9rem;">❌ Задание провалено</span>`;
       else if (t.title.includes('[ОПОЗДАНИЕ]')) actionBtn = `<span style="color:#ffaa00; font-size: 0.9rem;">⚠️ Задание с опозданием</span>`;
       else actionBtn = `<span style="color:#aaffaa; font-size: 0.9rem;">✓ Задание завершено</span>`;
       
       if (canEdit) {
           actionBtn += ` <button class="qty-btn" style="background:#4CAF50; color:#000; padding: 2px 6px; font-size: 0.8rem; margin-left: 5px;" onclick="reactivateTask(${t.id}, ${stalkerId}, '${safeTitle}')" title="Вернуть в работу">🔄</button>`;
       }
    }

    let editBtn = (canEdit && !t.is_completed) ? `<button class="qty-btn" style="background:transparent; color:#ffaa00; border:none; padding: 2px 6px; font-size: 1rem;" onclick="openEditTaskModal('personal', ${t.id}, '${cleanTitle.replace(/'/g, "\\'")}', '${t.deadline}', '${safeReward}', '', ${stalkerId})">✏️</button>` : '';
    let deleteBtn = canEdit ? `<button class="qty-btn" style="background:transparent; color:#ff6666; border:none; padding: 2px 6px; margin-left:5px; font-size: 1rem;" onclick="deleteStalkerTask(${t.id}, ${stalkerId}, ${t.is_completed}, '${safeTitle}')">✖</button>` : '';

    if (!canEdit && !t.is_completed) editBtn = `<span style="color:#888; font-size:0.7rem; margin-left:10px;">(Только автор)</span>`;

    list.innerHTML += `
      <div class="task-card-list" style="${t.is_completed ? 'opacity:0.6;' : ''}">
        ${giverInfo}
        <div style="font-weight: bold; color: #b3ffb3; margin-bottom: 5px; display:flex; justify-content:space-between;"><span>${cleanTitle}</span> <div>${editBtn}${deleteBtn}</div></div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; color: #8ab88a;">
          <div>Срок: <span style="color:${deadlineColor}; font-weight:bold;">${displayDate}</span> | Награда: ${t.reward}</div>
          <div>${actionBtn}</div>
        </div>
      </div>`;
  });
}

async function submitNewTask() {
  if (!currentStalkerId) return;
  let title = document.getElementById('nt_title').value; let deadline = document.getElementById('nt_deadline').value; let reward = document.getElementById('nt_reward').value;
  if (!title || !deadline) return alert('Укажи задачу и выбери дедлайн!');
  await db.from('stalker_tasks').insert([{ stalker_id: currentStalkerId, giver: window.currentUser.callsign, title: title, deadline: deadline, reward: reward }]);
  document.getElementById('nt_title').value = ''; document.getElementById('nt_deadline').value = ''; document.getElementById('nt_reward').value = '';
  document.getElementById('newTaskForm').style.display = 'none'; loadStalkerTasks(currentStalkerId); loadStalkers(true);
}

async function completeTask(taskId, stalkerId, isLate, title) {
  let newTitle = title;
  if (isLate) {
      newTitle = '[ОПОЗДАНИЕ] ' + title;
      let currentFailed = parseInt(document.getElementById('m_failed').textContent);
      let newFailed = currentFailed + 1;
      await db.from('stalkers').update({ failed_tasks: newFailed }).eq('id', stalkerId);
      document.getElementById('m_failed').textContent = newFailed;
  } else {
      let currentCompleted = parseInt(document.getElementById('m_completed').textContent);
      let newCompleted = currentCompleted + 1;
      await db.from('stalkers').update({ completed_tasks: newCompleted }).eq('id', stalkerId);
      document.getElementById('m_completed').textContent = newCompleted;
  }
  await db.from('stalker_tasks').update({ is_completed: true, title: newTitle }).eq('id', taskId);
  loadStalkerTasks(stalkerId); loadStalkers(true); 
}

async function failTask(taskId, stalkerId, title) {
    if(!confirm('Задание полностью провалено?')) return;
    let newTitle = '[ПРОВАЛ] ' + title;
    let currentFailed = parseInt(document.getElementById('m_failed').textContent);
    let newFailed = currentFailed + 1;
    await db.from('stalkers').update({ failed_tasks: newFailed }).eq('id', stalkerId);
    document.getElementById('m_failed').textContent = newFailed;
    await db.from('stalker_tasks').update({ is_completed: true, title: newTitle }).eq('id', taskId);
    loadStalkerTasks(stalkerId); loadStalkers(true); 
}

async function reactivateTask(taskId, stalkerId, title) {
    let cleanTitle = title.replace('[ПРОВАЛ] ', '').replace('[ОПОЗДАНИЕ] ', '');
    await db.from('stalker_tasks').update({ is_completed: false, title: cleanTitle }).eq('id', taskId);
    
    if (title.includes('[ПРОВАЛ]') || title.includes('[ОПОЗДАНИЕ]')) {
        let f = parseInt(document.getElementById('m_failed').textContent) - 1;
        await db.from('stalkers').update({ failed_tasks: Math.max(0, f) }).eq('id', stalkerId);
        document.getElementById('m_failed').textContent = Math.max(0, f);
    } else {
        let c = parseInt(document.getElementById('m_completed').textContent) - 1;
        await db.from('stalkers').update({ completed_tasks: Math.max(0, c) }).eq('id', stalkerId);
        document.getElementById('m_completed').textContent = Math.max(0, c);
    }
    loadStalkerTasks(stalkerId); loadStalkers(true);
}

async function deleteStalkerTask(taskId, stalkerId, isCompleted, title) {
  if(!confirm('Удалить эту запись из контрактов сталкера?')) return;
  await db.from('stalker_tasks').delete().eq('id', taskId);
  if (isCompleted) {
      if (title.includes('[ПРОВАЛ]') || title.includes('[ОПОЗДАНИЕ]')) {
          let currentFailed = parseInt(document.getElementById('m_failed').textContent);
          let newFailed = Math.max(0, currentFailed - 1);
          await db.from('stalkers').update({ failed_tasks: newFailed }).eq('id', stalkerId);
          document.getElementById('m_failed').textContent = newFailed;
      } else {
          let currentCompleted = parseInt(document.getElementById('m_completed').textContent);
          let newCompleted = Math.max(0, currentCompleted - 1);
          await db.from('stalkers').update({ completed_tasks: newCompleted }).eq('id', stalkerId);
          document.getElementById('m_completed').textContent = newCompleted;
      }
  }
  loadStalkerTasks(stalkerId); loadStalkers(true);
}

async function givePodgon() {
    if(!currentStalkerId) return;
    let result = prompt('Что принес сталкер (инфа/хабар)?');
    if(!result || result.trim() === '') return;
    await db.from('stalker_tasks').insert([{ stalker_id: currentStalkerId, giver: window.currentUser.callsign, title: 'Подгон: ' + result, deadline: '—', reward: '—', is_completed: true }]);
    let currentCompleted = parseInt(document.getElementById('m_completed').textContent); let newCompleted = currentCompleted + 1;
    await db.from('stalkers').update({ completed_tasks: newCompleted }).eq('id', currentStalkerId);
    document.getElementById('m_completed').textContent = newCompleted;
    loadStalkerTasks(currentStalkerId); loadStalkers(true);
}

/* ================================
   ГЛОБАЛЬНЫЕ ЗАДАЧИ
   ================================ */
function openEditTaskModal(type, id, title='', deadline='', reward='', desc='', stalkerId=null) {
    document.getElementById('editTaskModal').style.display = 'flex';
    document.getElementById('et_id').value = id;
    document.getElementById('et_type').value = type;
    document.getElementById('et_title').value = title;
    document.getElementById('et_deadline').value = deadline !== '—' ? deadline : '';
    document.getElementById('et_reward').value = reward !== '—' ? reward : '';
    
    let descBlock = document.getElementById('et_desc_container');
    if (type === 'faction' || type === 'memberTask') {
        if(type === 'faction') {
            let task = currentFactionTasksList.find(t => t.id === id);
            if(task) document.getElementById('et_desc').value = task.description || '';
        } else {
            let task = currentMemberTasksList.find(t => t.id === id);
            if(task) document.getElementById('et_desc').value = task.description || '';
        }
        descBlock.style.display = 'block';
    } else {
        descBlock.style.display = 'none';
        document.getElementById('et_stalker_id').value = stalkerId;
    }
}

async function saveTaskEdit() {
    let id = document.getElementById('et_id').value;
    let type = document.getElementById('et_type').value;
    let title = document.getElementById('et_title').value.trim();
    let deadline = document.getElementById('et_deadline').value;
    let reward = document.getElementById('et_reward').value.trim();
    
    if(!title) return alert("Название не может быть пустым!");

    if (type === 'faction') {
        let desc = document.getElementById('et_desc').value;
        await db.from('faction_tasks').update({ title, deadline, reward, description: desc }).eq('id', id);
        closeModal('editTaskModal'); closeModal('factionTaskModal'); loadFactionTasks();
    } else if (type === 'memberTask') {
        let desc = document.getElementById('et_desc').value;
        await db.from('member_tasks').update({ title, deadline, importance: reward, description: desc }).eq('id', id);
        closeModal('editTaskModal'); loadMemberTasksForProfile(currentMemberCallsign);
    } else {
        await db.from('stalker_tasks').update({ title, deadline, reward }).eq('id', id);
        let sId = document.getElementById('et_stalker_id').value;
        closeModal('editTaskModal'); loadStalkerTasks(sId);
    }
}

async function loadFactionTasks(isTick = false) {
  let grid = document.getElementById('factionTasksGrid');
  if (!isTick) grid.innerHTML = '<div style="text-align: center; width: 100%;">Загрузка...</div>';
  const { data } = await db.from('faction_tasks').select('*');
  
  let newHTML = '';
  if (!data || data.length === 0) { 
      newHTML = '<div style="text-align: center; width: 100%;">Глобальных контрактов нет</div>'; 
  } else {
    currentFactionTasksList = data; 
    data.forEach(task => {
      let impColor = task.importance.toLowerCase().includes('крит') ? '#ff6666' : '#ffffaa';
      let deadlineColor = '#aaffaa'; let displayDate = task.deadline;
      
      if (task.deadline) {
          let d = new Date(task.deadline);
          if (!isNaN(d.getTime())) {
              let today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
              let diff = Math.ceil((d - today) / (1000 * 3600 * 24));
              if (diff < 0) deadlineColor = '#ff3333';
              else if (diff === 0) deadlineColor = '#ffaa00';
              else if (diff <= 2) deadlineColor = '#ffffaa';
              displayDate = d.toLocaleDateString();
          }
      }

      newHTML += `
        <div class="card" onclick="openFactionTaskModal(${task.id}, '${deadlineColor}', '${displayDate}')">
          <h3 style="margin: 0 0 10px; color: #b3ffb3;">${task.title}</h3>
          <p style="margin: 0 0 5px; color: ${impColor}; font-size: 0.9rem;">Важность: ${task.importance}</p>
          <p style="margin: 0 0 5px; color: #8ab88a; font-size: 0.9rem;">Срок: <span style="color:${deadlineColor}; font-weight:bold;">${displayDate}</span></p>
          <p style="margin: 0; color: #ffaa00; font-size: 0.9rem; font-weight: bold;">Награда: ${task.reward}</p>
        </div>`;
    });
  }
  grid.innerHTML = newHTML;
}

function openFactionTaskModal(id, deadlineColor, displayDate) {
  let task = currentFactionTasksList.find(t => t.id === id);
  if(!task) return;

  currentFactionTaskId = id; 
  document.getElementById('factionTaskModal').style.display = 'flex';
  document.getElementById('ft_m_title').textContent = task.title;
  
  let riskColor = task.risk.toLowerCase().includes('смерт') || task.risk.toLowerCase().includes('высок') ? '#ff6666' : '#aaffaa';
  let impColor = task.importance.toLowerCase().includes('крит') ? '#ff6666' : '#ffffaa';
  
  document.getElementById('ft_m_imp').innerHTML = `Важность: <span style="color:${impColor};">${task.importance}</span>`;
  document.getElementById('ft_m_risk').innerHTML = `Риск: <span style="color:${riskColor};">${task.risk}</span>`;
  document.getElementById('ft_m_deadline').innerHTML = `<span style="color:${deadlineColor};">${displayDate}</span>`; 
  document.getElementById('ft_m_reward').textContent = task.reward;
  document.getElementById('ft_m_desc').textContent = task.description || 'Подробности отсутствуют.';
}

async function createFactionTask() {
  let title = document.getElementById('t_title').value; let desc = document.getElementById('t_desc').value;
  let risk = document.getElementById('t_risk').value; let imp = document.getElementById('t_imp').value; 
  let deadline = document.getElementById('t_deadline').value; let reward = document.getElementById('t_reward').value;
  if (!title || !deadline) return alert('Укажи суть контракта и выбери дату дедлайна!');
  
  await db.from('faction_tasks').insert([{ title, description: desc, risk, importance: imp, deadline, reward }]);
  document.getElementById('t_title').value = ''; document.getElementById('t_desc').value = ''; document.getElementById('t_risk').value = ''; 
  document.getElementById('t_imp').value = ''; document.getElementById('t_deadline').value = ''; document.getElementById('t_reward').value = '';
  toggleForm('taskForm'); loadFactionTasks();
}

async function deleteCurrentFactionTask() {
  if(!currentFactionTaskId) return;
  if(confirm('Точно удалить эту глобальную задачу?')) {
    await db.from('faction_tasks').delete().eq('id', currentFactionTaskId);
    closeModal('factionTaskModal'); loadFactionTasks();
  }
}

/* ================================
   ЛИЧНЫЙ СОСТАВ И ЗАДАЧИ (РОСТЕР)
   ================================ */

async function loadMembersList(isTick = false) {
  let grid = document.getElementById('membersGrid');
  if (!isTick) grid.innerHTML = '<div style="text-align: center; width: 100%;">Загрузка состава...</div>';
  
  const { data } = await db.from('freedom_members').select('*');
  
  if (data) {
    allMembersList = data.filter(m => m.role !== 'curator');
    allMembersList.sort((a, b) => getRankWeight(a.rank) - getRankWeight(b.rank));
    
    let habarContainer = document.getElementById('habar_members_list');
    if (habarContainer) {
        let checked = Array.from(habarContainer.querySelectorAll('input.habar-cb:checked')).map(cb => cb.value);
        let habarHtml = '';
        allMembersList.forEach(m => {
            let isChecked = checked.includes(m.callsign) ? 'checked' : '';
            habarHtml += `<label style="display:flex; align-items:center; gap:8px; margin:0; font-size:0.9rem; color:#b3ffb3; cursor:pointer; font-weight:normal; background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; border: 1px solid #1a3a1a;">
                <input type="checkbox" value="${m.callsign}" class="habar-cb" style="width:16px; height:16px; margin:0; cursor:pointer;" ${isChecked}> ${m.callsign}
            </label>`;
        });
        habarContainer.innerHTML = habarHtml;
    }

    const { data: tasksData } = await db.from('member_tasks').select('assigned_to, status');
    let actCounts = {};
    let reviewCounts = {};
    let compCounts = {};
    if (tasksData) {
        tasksData.forEach(t => { 
            if (t.status === 'completed') {
                compCounts[t.assigned_to] = (compCounts[t.assigned_to] || 0) + 1;
            } else if (t.status === 'review') {
                reviewCounts[t.assigned_to] = (reviewCounts[t.assigned_to] || 0) + 1;
            } else {
                actCounts[t.assigned_to] = (actCounts[t.assigned_to] || 0) + 1; 
            }
        });
    }

    let html = '';

    allMembersList.forEach(m => {
        let isMe = (m.callsign === window.currentUser.callsign);
        let safeName = m.callsign.replace(/'/g, "\\'");
        
        let actCount = actCounts[m.callsign] || 0;
        let revCount = reviewCounts[m.callsign] || 0;
        let compCount = compCounts[m.callsign] || 0;
        
        let activeBadge = actCount > 0 ? `<div style="position: absolute; top:-5px; right:-5px; background:#ffaa00; color:#000; border-radius:50%; width:22px; height:22px; font-weight:bold; font-size:0.8rem; line-height:22px; border:2px solid #000; z-index:5;" title="Задач в работе">${actCount}</div>` : '';
        let reviewBadge = revCount > 0 ? `<div style="position: absolute; top:-5px; left:-5px; background:#4CAF50; color:#000; border-radius:50%; width:22px; height:22px; font-weight:bold; font-size:0.8rem; line-height:22px; border:2px solid #000; z-index:5;" title="Сдано на проверку">${revCount}</div>` : '';
        
        html += `
        <div class="card member-card ${isMe ? 'my-card' : ''}" onclick="openMemberProfile('${safeName}')" style="position:relative;">
          ${isMe ? '<div class="my-card-label">ЭТО ТЫ</div>' : ''}
          ${reviewBadge}
          ${activeBadge}
          <div class="stalker-photo">${m.photo_url ? `<img src="${m.photo_url}">` : '<span style="color: #2a6b2a;">[Нет]</span>'}</div>
          <h3 style="margin: 5px 0; color: #b3ffb3; font-size:1.1rem;">${m.callsign}</h3>
          <p style="margin: 0 0 5px; color: #ffaa00; font-size: 0.85rem; font-weight:bold;">${m.rank}</p>
          
          <div style="font-size: 0.8rem; color: #8ab88a; background: rgba(0,0,0,0.5); padding: 4px; border-radius: 6px;">
            В работе: <span style="color:#ffaa00; font-weight:bold;">${actCount}</span><br>
            На проверке: <span style="color:#aaffaa; font-weight:bold;">${revCount}</span>
          </div>
        </div>`;
    });
    grid.innerHTML = html;
  }
}

function openMemberProfile(callsign) {
  currentMemberCallsign = callsign;
  let m = allMembersList.find(x => x.callsign === callsign);
  if (!m) return;

  document.getElementById('memberProfileModal').style.display = 'flex';
  document.getElementById('mp_name').textContent = m.callsign;
  document.getElementById('mp_rank').textContent = m.rank;
  document.getElementById('mp_exp').textContent = m.experience || 'Не указан';
  document.getElementById('mp_desc').textContent = m.description || 'Нет описания';
  
  let photoContainer = document.getElementById('mp_photo');
  if (m.photo_url && m.photo_url !== '') {
      photoContainer.innerHTML = `<img src="${m.photo_url}" style="width:100%; height:100%; object-fit:cover;">`; 
  } else {
      photoContainer.innerHTML = `<span style="color: #2a6b2a; font-size:0.8rem; text-align:center;">Изменить<br>Фото</span>`;
  }
  
  loadMemberTasksForProfile(callsign);
}

function openEditMemberInfoModal() {
  if (!document.body.classList.contains('is-admin')) return;
  let m = allMembersList.find(x => x.callsign === currentMemberCallsign);
  if(!m) return;
  document.getElementById('emi_exp').value = m.experience || '';
  document.getElementById('emi_desc').value = m.description || '';
  document.getElementById('editMemberInfoModal').style.display = 'flex';
}

async function saveMemberInfo() {
  let exp = document.getElementById('emi_exp').value.trim();
  let desc = document.getElementById('emi_desc').value.trim();
  
  await db.from('freedom_members').update({ experience: exp, description: desc }).eq('callsign', currentMemberCallsign);
  
  document.getElementById('mp_exp').textContent = exp || 'Не указан';
  document.getElementById('mp_desc').textContent = desc || 'Нет описания';
  
  let m = allMembersList.find(x => x.callsign === currentMemberCallsign);
  if(m) { m.experience = exp; m.description = desc; }
  
  closeModal('editMemberInfoModal');
}

function openMemberPhotoModal() {
  if (!document.body.classList.contains('is-admin')) return;
  document.getElementById('emp_name').textContent = currentMemberCallsign;
  document.getElementById('emp_photo_base64').value = '';
  document.getElementById('emp_preview').style.display = 'none';
  document.getElementById('emp_preview').src = '';
  document.getElementById('editMemberPhotoModal').style.display = 'flex';
}

async function saveMemberPhoto() {
  let photoBase64 = document.getElementById('emp_photo_base64').value;
  if (!photoBase64) return alert('Сначала вставь картинку (Ctrl+V)!');
  
  let btn = document.getElementById('btnSaveMemberPhoto');
  let oldText = btn.innerHTML;
  btn.innerHTML = 'Загрузка...';
  btn.disabled = true;

  const { error } = await db.from('freedom_members').update({ photo_url: photoBase64 }).eq('callsign', currentMemberCallsign);
  
  btn.innerHTML = oldText;
  btn.disabled = false;

  if (error) {
      alert('Ошибка при сохранении фото: ' + error.message + '\n\nПроверь, отключен ли RLS для таблицы freedom_members в Supabase!');
      return;
  }
  
  let photoContainer = document.getElementById('mp_photo');
  photoContainer.innerHTML = `<img src="${photoBase64}" style="width:100%; height:100%; object-fit:cover;">`;
  
  let member = allMembersList.find(m => m.callsign === currentMemberCallsign);
  if (member) member.photo_url = photoBase64;

  closeModal('editMemberPhotoModal');
  loadMembersList(true); 
}

async function loadMemberTasksForProfile(callsign) {
  let list = document.getElementById('mp_tasks_list');
  list.innerHTML = '<div style="text-align: center; color: #888;">Загрузка...</div>';
  
  const { data } = await db.from('member_tasks').select('*').eq('assigned_to', callsign).order('created_at', { ascending: false });
  let html = '';
  let isAdmin = document.body.classList.contains('is-admin');
  
  let completedCount = 0;
  if (data) {
      completedCount = data.filter(t => t.status === 'completed').length;
  }
  document.getElementById('mp_completed_tasks').textContent = completedCount;

  if (!data || data.length === 0) {
      html = '<div style="text-align: center; color: #555;">Боец отдыхает. Задач нет.</div>';
  } else {
      currentMemberTasksList = data;
      data.forEach(t => {
          let isMine = t.assigned_to === window.currentUser.callsign;
          
          let statusText = 'В работе';
          let statusClass = 'status-active';
          if (t.status === 'review') { statusText = 'На проверке'; statusClass = 'status-review'; }
          if (t.status === 'completed') { statusText = 'Выполнено'; statusClass = 'status-completed'; }
          
          let deadlineColor = '#aaffaa';
          if (t.deadline && t.status !== 'completed') {
              let d = new Date(t.deadline);
              if (!isNaN(d.getTime())) {
                  let today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
                  let diff = Math.ceil((d - today) / (1000 * 3600 * 24));
                  if (diff < 0) deadlineColor = '#ff3333';
                  else if (diff === 0) deadlineColor = '#ffaa00';
                  else if (diff <= 2) deadlineColor = '#ffffaa';
              }
          }

          let safeDesc = (t.description || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
          let safeTitle = t.title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
          let safeImp = t.importance ? t.importance.replace(/'/g, "\\'") : '';
          
          let actionBtns = '<div style="display: flex; gap: 8px; margin-top: 15px; flex-wrap: wrap;">';
          
          if (isMine) {
              actionBtns += `<button class="qty-btn" id="mt_btn_save_${t.id}" style="background: #2a552a;" onclick="saveMemberTaskComment(${t.id})">💾 Сохранить отчет</button>`;
              if (t.status === 'active') {
                  actionBtns += `<button class="qty-btn" style="background: #aa7700; color:#fff;" onclick="submitReviewMemberTask(${t.id})">📤 Отправить на проверку</button>`;
              }
          }
          
          if (isAdmin) {
              if (t.status !== 'completed') {
                  actionBtns += `<button class="qty-btn" style="background: #2a552a;" onclick="setMemberTaskStatus(${t.id}, 'completed')">✅ Принять (Готово)</button>`;
              }
              if (t.status === 'review') {
                  actionBtns += `<button class="qty-btn" style="background: #552a2a; color:#ffcccc;" onclick="setMemberTaskStatus(${t.id}, 'active')">❌ Отклонить отчет</button>`;
              }
              if (t.status === 'completed') {
                  actionBtns += `<button class="qty-btn" style="background: #333;" onclick="setMemberTaskStatus(${t.id}, 'active')">🔄 Вернуть в работу</button>`;
              }
              actionBtns += `<button class="qty-btn" style="border: 1px solid #ffaa00; color: #ffaa00; background:transparent;" onclick="openEditTaskModal('memberTask', ${t.id}, '${safeTitle}', '${t.deadline || ''}', '${safeImp}')">✏️</button>`;
              actionBtns += `<button class="qty-btn" style="border: 1px solid #ff6666; color: #ff6666; background:transparent;" onclick="deleteMemberTask(${t.id})">✖</button>`;
          }
          actionBtns += '</div>';

          let readOnlyAttr = (!isMine) ? 'readonly' : '';
          let placeholderAttr = isMine ? 'Напиши сюда свой отчет или комментарий по задаче...' : 'Боец пока ничего не написал.';
          
          html += `
          <div class="mt-card ${t.status === 'completed' ? 'completed' : ''}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <h3 style="margin: 0 0 5px; color: #b3ffb3;">${t.title}</h3>
                <div class="status-badge ${statusClass}">${statusText}</div>
              </div>
              
              <div style="font-size: 0.85rem; color: #8ab88a; margin-bottom: 10px; border-bottom: 1px dashed #2a6b2a; padding-bottom: 10px;">
                Выдал: <span style="color:#ffaa00;">${t.assigned_by}</span> | 
                Важность: <span style="color:#ffffaa;">${t.importance || 'Обычная'}</span> | 
                Срок: <span style="color:${deadlineColor}; font-weight:bold;">${t.deadline || 'Без срока'}</span>
              </div>
              
              ${safeDesc ? `<div style="font-size: 0.9rem; color: #aaffaa; margin-bottom: 15px; white-space: pre-wrap;">${safeDesc}</div>` : ''}
              
              <label style="font-size: 0.85rem; color:#8ab88a;">Отчет бойца:</label>
              <textarea class="mt-comment-box" id="mt_comment_${t.id}" rows="2" placeholder="${placeholderAttr}" ${readOnlyAttr}>${t.comment || ''}</textarea>
              
              ${actionBtns}
          </div>`;
      });
  }
  list.innerHTML = html;
}

async function submitNewMemberTask() {
  if (!document.body.classList.contains('is-admin')) return alert('Только админ может выдавать задания!');
  if (!currentMemberCallsign) return;
  let title = document.getElementById('nmt_title').value.trim();
  let desc = document.getElementById('nmt_desc').value.trim();
  let imp = document.getElementById('nmt_imp').value.trim();
  let deadline = document.getElementById('nmt_deadline').value;
  
  if (!title) return alert('Укажи суть задачи!');
  
  await db.from('member_tasks').insert([{
     assigned_to: currentMemberCallsign,
     assigned_by: window.currentUser.callsign,
     title: title, description: desc, importance: imp, deadline: deadline || null,
     status: 'active', comment: ''
  }]);
  
  document.getElementById('nmt_title').value = '';
  document.getElementById('nmt_desc').value = '';
  document.getElementById('nmt_imp').value = '';
  document.getElementById('nmt_deadline').value = '';
  
  document.getElementById('newMemberTaskForm').style.display = 'none';
  loadMemberTasksForProfile(currentMemberCallsign);
  loadMembersList(true); 
}

async function setMemberTaskStatus(id, newStatus) {
  await db.from('member_tasks').update({ status: newStatus }).eq('id', id);
  loadMemberTasksForProfile(currentMemberCallsign);
  loadMembersList(true);
}

async function submitReviewMemberTask(id) {
  let textarea = document.getElementById('mt_comment_' + id);
  let comment = textarea ? textarea.value.trim() : '';
  await db.from('member_tasks').update({ status: 'review', comment: comment }).eq('id', id);
  loadMemberTasksForProfile(currentMemberCallsign);
  loadMembersList(true);
}

async function saveMemberTaskComment(id) {
  let textarea = document.getElementById('mt_comment_' + id);
  if(!textarea) return;
  let comment = textarea.value.trim();
  await db.from('member_tasks').update({ comment }).eq('id', id);
  
  let btn = document.getElementById('mt_btn_save_' + id);
  if(btn) {
      let oldText = btn.innerHTML;
      btn.innerHTML = '✓ Сохранено';
      btn.style.color = '#aaffaa';
      setTimeout(() => { btn.innerHTML = oldText; btn.style.color = ''; }, 2000);
  }
}

async function deleteMemberTask(id) {
  if(confirm('Точно удалить эту задачу из базы?')) {
      await db.from('member_tasks').delete().eq('id', id);
      loadMemberTasksForProfile(currentMemberCallsign);
      loadMembersList(true);
  }
}

/* ================================
   ЖИЛЬЕ, РЕЙТИНГ, ИСТОРИЯ
   ================================ */
async function loadHousing(isTick = false) {
  let grid = document.getElementById('housingGrid');
  if (!isTick) grid.innerHTML = '<div style="text-align: center; width: 100%;">Загрузка...</div>';
  
  const { data } = await db.from('houses').select('*').order('id', { ascending: true });
  
  let html = '';
  let isAdmin = document.body.classList.contains('is-admin');

  if(data) {
      data.forEach(h => {
          let isFree = h.renter === 'Свободно' || !h.renter;
          let color = '#aaffaa';
          let displayDate = h.deadline || '—';
          
          if(!isFree && h.deadline) {
              let d = new Date(h.deadline);
              if (!isNaN(d.getTime())) {
                  let today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
                  let diff = (d - today) / (1000 * 3600 * 24);
                  if (diff < 0) color = '#ff3333';
                  else if (diff === 0) color = '#ffaa00';
                  else if (diff <= 2) color = '#ffffaa';
                  displayDate = d.toLocaleDateString();
              }
          } else if(isFree) {
              displayDate = '—';
          }
          
          let safeRenter = (h.renter || '').replace(/'/g, "\\'");
          let safeDeadline = h.deadline || '';
          
          let onclickAction = isAdmin 
              ? `onclick="openHousingModal(${h.id}, '${safeRenter}', '${safeDeadline}')" style="cursor:pointer;"` 
              : `style="cursor:default;"`;

          html += `<div class="card" ${onclickAction}>
              <h3 style="margin: 0 0 10px; color:#b3ffb3;">Домик #${h.id}</h3>
              <p style="margin: 0 0 5px; color:#8ab88a;">Жилец: <span style="color:${isFree ? '#ffaa00' : '#fff'}; font-weight:bold;">${h.renter || 'Свободно'}</span></p>
              <p style="margin: 0 0 5px; color:#8ab88a;">Срок: <span style="color:${color}; font-weight:bold;">${displayDate}</span></p>
              ${isAdmin ? `<div style="font-size: 0.8rem; color:#5a8a5a; margin-top:10px;">(Кликни для редактирования)</div>` : ''}
          </div>`;
      });
  }
  grid.innerHTML = html;
}

function openHousingModal(id, renter, deadline) {
    document.getElementById('housingModal').style.display = 'flex';
    document.getElementById('h_id').value = id;
    document.getElementById('h_id_display').textContent = id;
    document.getElementById('h_renter').value = renter === 'Свободно' ? '' : renter;
    document.getElementById('h_deadline').value = deadline || '';
}

async function saveHousing() {
    let id = document.getElementById('h_id').value;
    let renter = document.getElementById('h_renter').value.trim() || 'Свободно';
    let deadline = document.getElementById('h_deadline').value;
    
    await db.from('houses').update({renter: renter, deadline: deadline || null}).eq('id', id);
    closeModal('housingModal');
    loadHousing();
}

function openGlobalRating() {
  document.getElementById('globalRatingModal').style.display = 'flex';
  loadGlobalRating();
}

async function loadGlobalRating() {
  let tbody = document.getElementById('globalRatingBody');
  tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Загрузка...</td></tr>';
  const { data } = await db.from('obshchak_logs').select('callsign, amount, reason').gt('amount', 0);
  
  if (!data || data.length === 0) { 
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Пусто</td></tr>'; return; 
  }
  
  let totals = {}; 
  data.forEach(log => { 
      if (!log.reason || !log.reason.startsWith('[ПАХАНКА]')) { totals[log.callsign] = (totals[log.callsign] || 0) + log.amount; }
  });
  let sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  let newHTML = '';
  sorted.forEach((p, i) => {
      let placeStyle = i === 0 ? 'color: #ffd700; font-size: 1.2rem;' : (i === 1 ? 'color: #c0c0c0; font-size: 1.1rem;' : (i === 2 ? 'color: #cd7f32; font-size: 1.1rem;' : ''));
      newHTML += `<tr><td style="${placeStyle}"># ${i + 1}</td><td>${p[0]}</td><td>${p[1].toLocaleString()} руб.</td></tr>`;
  });
  tbody.innerHTML = newHTML;
}

async function loadRating(isTick = false) {
  let tbody = document.getElementById('ratingBody');
  let topGrid = document.getElementById('lastWeekTopGrid');
  
  if (!isTick) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Подсчет...</td></tr>';
      topGrid.innerHTML = '<div style="color:#888;">Загрузка...</div>';
  }
  
  const { data } = await db.from('obshchak_logs').select('callsign, amount, reason, created_at').gt('amount', 0);
  
  let newHTML = '';
  if (!data || data.length === 0) { 
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Пока никто не вносил в общак</td></tr>'; 
      topGrid.innerHTML = '<div style="color:#555;">Нет данных за прошлую неделю</div>';
      return;
  }

  let { thisMonday, lastMonday } = getMondays();
  
  let currentTotals = {}; 
  let lastTotals = {};

  data.forEach(log => { 
      if (!log.reason || !log.reason.startsWith('[ПАХАНКА]')) { 
          let logDate = new Date(log.created_at);
          if (logDate >= thisMonday) {
              currentTotals[log.callsign] = (currentTotals[log.callsign] || 0) + log.amount;
          } else if (logDate >= lastMonday && logDate < thisMonday) {
              lastTotals[log.callsign] = (lastTotals[log.callsign] || 0) + log.amount;
          }
      }
  });

  let currentSorted = Object.entries(currentTotals).sort((a, b) => b[1] - a[1]);
  if (currentSorted.length === 0) { 
      newHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">На этой неделе еще никто не пополнял</td></tr>'; 
  } else {
      currentSorted.forEach((p, i) => {
        let place = i + 1;
        let placeStyle = i === 0 ? 'color: #ffd700; text-shadow: 0 0 10px #ffd700; font-size: 1.5rem;' : (i === 1 ? 'color: #c0c0c0; text-shadow: 0 0 8px #c0c0c0; font-size: 1.4rem;' : (i === 2 ? 'color: #cd7f32; text-shadow: 0 0 6px #cd7f32; font-size: 1.3rem;' : ''));
        newHTML += `<tr><td style="${placeStyle}"># ${place}</td><td>${p[0]}</td><td>${p[1].toLocaleString()} руб.</td></tr>`;
      });
  }
  tbody.innerHTML = newHTML;

  let lastSorted = Object.entries(lastTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);
  let topHtml = '';
  if (lastSorted.length === 0) {
      topHtml = '<div style="color:#555;">Нет данных за прошлую неделю</div>';
  } else {
      lastSorted.forEach((p, i) => {
          let colors = ['#ffd700', '#c0c0c0', '#cd7f32'];
          let color = colors[i] || '#fff';
          topHtml += `<div style="background:#111a11; border:1px solid ${color}; border-radius:8px; padding:10px; min-width:120px; text-align:center; box-shadow: 0 0 10px rgba(0,0,0,0.5);">
            <div style="color:${color}; font-size:1.2rem; font-weight:bold; margin-bottom:5px;">#${i+1} ${p[0]}</div>
            <div style="color:#aaffaa;">${p[1].toLocaleString()}</div>
          </div>`;
      });
  }
  topGrid.innerHTML = topHtml;
}

async function loadHistory(isTick = false) {
  let tbody = document.getElementById('historyBody');
  if (!isTick) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Загрузка...</td></tr>';
  const { data } = await db.from('obshchak_logs').select('*').order('created_at', { ascending: false }).limit(30);
  
  let newHTML = '';
  if (!data || data.length === 0) { newHTML = '<tr><td colspan="4" style="text-align: center;">История пуста</td></tr>'; 
  } else {
    data.forEach(log => {
      let d = new Date(log.created_at);
      let dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      let amtStr = log.amount > 0 ? '+ ' + log.amount.toLocaleString() : log.amount.toLocaleString();
      let amtCol = log.amount > 0 ? '#aaffaa' : '#ffaaaa';
      let reasonText = log.reason || '';

      if (reasonText.startsWith('[РЕЙТИНГ]')) {
          amtCol = '#55ccff'; 
          amtStr = '+ ' + log.amount.toLocaleString();
          reasonText = `<span style="background: #113344; color: #55ccff; padding: 2px 4px; border-radius: 4px; font-size: 0.7rem; margin-right: 5px;">В РЕЙТИНГ</span>` + reasonText.replace('[РЕЙТИНГ] ', '');
      } else if (reasonText.startsWith('[ПАХАНКА]')) {
          amtCol = '#ffaa00'; 
          reasonText = `<span style="background: #332200; color: #ffaa00; padding: 2px 4px; border-radius: 4px; font-size: 0.7rem; margin-right: 5px;">ПАХАНКА</span>` + reasonText.replace('[ПАХАНКА] ', '');
      }

      newHTML += `<tr><td>${dateStr}</td><td>${log.callsign}</td><td style="color:${amtCol}">${amtStr} руб.</td><td style="text-align:left;">${reasonText}</td></tr>`;
    });
  }
  tbody.innerHTML = newHTML;
}

window.onload = () => {
  checkSession(); 

  document.querySelectorAll('.tabs button').forEach(btn => { 
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab'))); 
  });
  document.getElementById('categorySelect').addEventListener('change', () => loadStock());

  setInterval(() => {
    let activeTag = document.activeElement ? document.activeElement.tagName : '';
    let isTyping = (activeTag === 'INPUT' || activeTag === 'TEXTAREA');
    
    let isPhotoModalOpen = document.getElementById('editMemberPhotoModal').style.display === 'flex' || 
                           document.getElementById('editStalkerPhotoModal').style.display === 'flex' ||
                           document.getElementById('editMemberInfoModal').style.display === 'flex';
    
    if (isTyping || isPhotoModalOpen) return;

    if (document.getElementById('main-app').style.display === 'flex') {
      fetchObshchak(); 
      if (currentTab === 'rating') loadRating(true);
      if (currentTab === 'history') loadHistory(true);
      if (currentTab === 'faction-tasks' && currentFactionTaskId === null) loadFactionTasks(true);
      if (currentTab === 'stalkers' && currentStalkerId === null) loadStalkers(true); 
      if (currentTab === 'housing') loadHousing(true);
      if (currentTab === 'members-crm' || currentTab === 'finance') {
          loadMembersList(true);
          if (document.getElementById('memberProfileModal').style.display === 'flex' && currentMemberCallsign) {
              loadMemberTasksForProfile(currentMemberCallsign);
          }
      }
    }
  }, 8000); 

  setInterval(() => {
    if (document.getElementById('main-app').style.display === 'flex') {
      updateOnlineStatus();
    }
  }, 15000);
};

document.addEventListener('contextmenu', event => event.preventDefault()); 
document.onkeydown = function(e) {
  if(e.keyCode == 123) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false; 
}
