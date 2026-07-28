const supabaseUrl = 'https://pda-bridge.pavlov6452.workers.dev'; 
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

function checkSession() {
  let savedUser = localStorage.getItem('freedom_user');
  if (savedUser) {
    window.currentUser = JSON.parse(savedUser);
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('onlineRadar').style.display = 'block';
    document.getElementById('userGreeting').textContent = `👋 Хай, ${window.currentUser.callsign} [${window.currentUser.rank}]`;
    applyRoles(window.currentUser.role);
    fetchObshchak();
    updateOnlineStatus();
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
  document.getElementById('userGreeting').textContent = `👋 Хай, ${data.callsign} [${data.rank}]`;
  
  applyRoles(data.role); 
  fetchObshchak(); 
  updateOnlineStatus();
}

function applyRoles(role) {
  if (role === 'admin' || role === 'curator') document.body.classList.add('is-admin');
  else document.body.classList.remove('is-admin');
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
  
  let newTotal = lastObsValue + amount;
  await db.from('global_state').update({ obshchak_total: newTotal }).eq('id', 1);
  if (!isSilent) await db.from('obshchak_logs').insert([{ callsign: window.currentUser.callsign, amount: amount, reason: reason }]);
  
  msgDiv.textContent = '✓ Операция проведена'; msgDiv.className = 'success-message';
  document.getElementById('amount').value = ''; document.getElementById('reason').value = ''; document.getElementById('silentEdit').checked = false;
  fetchObshchak(); setTimeout(() => { msgDiv.textContent = ''; }, 2000);
}

async function submitPahanki() {
  if (!window.currentUser) return; 
  let amount = parseInt(document.getElementById('p_amount').value);
  let reason = document.getElementById('p_reason').value.trim() || '—';
  let msgDiv = document.getElementById('message');
  if (isNaN(amount)) { msgDiv.textContent = 'Введи сумму для Паханки!'; msgDiv.className = 'error-message'; return; }
  
  let newTotal = (lastPahankiValue || 0) + amount;
  await db.from('global_state').update({ pahanki_total: newTotal }).eq('id', 1);
  await db.from('obshchak_logs').insert([{ callsign: window.currentUser.callsign, amount: amount, reason: `[ПАХАНКА] ${reason}` }]);
  
  msgDiv.textContent = '✓ Паханка обновлена'; msgDiv.className = 'success-message';
  document.getElementById('p_amount').value = ''; document.getElementById('p_reason').value = '';
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
}

function toggleForm(formId) {
  let form = document.getElementById(formId);
  form.style.display = form.style.display === 'block' ? 'none' : 'block';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  if(modalId === 'stalkerModal') { document.getElementById('newTaskForm').style.display = 'none'; currentStalkerId = null; }
  if(modalId === 'factionTaskModal') { currentFactionTaskId = null; }
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
        let priceCell = tr.insertCell(1); priceCell.textContent = item.price;
        if (item.price === 'Не продается') priceCell.style.color = '#ff6666';

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

document.getElementById('pasteArea').addEventListener('paste', function(e) {
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
          document.getElementById('previewImage').src = base64;
          document.getElementById('previewImage').style.display = 'inline-block';
          document.getElementById('s_photo').value = base64;
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(items[index].getAsFile());
    }
  }
});

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
  if (!isTick) grid.innerHTML = '<div style="width: 100%; text-align: center;">Загрузка базы...</div>';
  const { data } = await db.from('stalkers').select('*').order('id', { ascending: true });
  
  let newHTML = '';
  if (!data || data.length === 0) { newHTML = '<div style="width: 100%; text-align: center;">База пуста.</div>'; 
  } else {
    data.forEach(s => {
      let statusColor = s.status === 'Доверенный' ? '#aaffaa' : '#ffaaaa';
      let failedCount = s.failed_tasks || 0;
      
      newHTML += `
        <div class="card" onclick="openStalkerModal(${s.id}, '${s.nickname}', '${s.status}', ${s.completed_tasks}, ${failedCount}, '${s.photo_url || ''}')">
          <div class="stalker-photo">${s.photo_url ? `<img src="${s.photo_url}">` : '<span style="color: #2a6b2a;">[Нет фото]</span>'}</div>
          <h3 style="margin: 5px 0; color: #b3ffb3;">☢️ ${s.nickname}</h3>
          <p style="margin: 0 0 5px; color: ${statusColor}; font-size: 0.9rem;">${s.status}</p>
          <p style="margin: 0; color: #8ab88a; font-size: 0.8rem;">
            Успех: <span style="color:#aaffaa">${s.completed_tasks}</span> | Провал: <span style="color:#ff6666">${failedCount}</span>
          </p>
        </div>`;
    });
  }
  grid.innerHTML = newHTML;
  filterStalkers();
}

async function createStalker() {
  let name = document.getElementById('s_name').value.trim(); let photo = document.getElementById('s_photo').value;
  if (!name) return alert('Укажи позывной!'); 
  await db.from('stalkers').insert([{ nickname: name, status: 'Не доверенный', completed_tasks: 0, failed_tasks: 0, photo_url: photo }]);
  document.getElementById('s_name').value = ''; document.getElementById('s_photo').value = '';
  document.getElementById('previewImage').style.display = 'none'; document.getElementById('previewImage').src = '';
  toggleForm('stalkerForm'); loadStalkers();
}

async function deleteCurrentStalker() {
    if(!currentStalkerId) return;
    if(confirm('Удалить сталкера из базы? Это необратимо.')) {
        await db.from('stalkers').delete().eq('id', currentStalkerId);
        await db.from('stalker_tasks').delete().eq('stalker_id', currentStalkerId);
        closeModal('stalkerModal'); loadStalkers();
    }
}

async function openStalkerModal(id, name, status, completed, failed, photo) {
  currentStalkerId = id; document.getElementById('stalkerModal').style.display = 'flex';
  document.getElementById('m_name').innerHTML = `${name}`; 
  document.getElementById('m_completed').textContent = completed;
  document.getElementById('m_failed').textContent = failed;
  
  let photoContainer = document.getElementById('m_photo');
  if (photo && photo !== 'null') photoContainer.innerHTML = `<img src="${photo}" style="width:100%; height:100%; object-fit:cover;">`; 
  else photoContainer.innerHTML = `<span style="color: #2a6b2a; font-size:0.8rem;">[Нет фото]</span>`;

  let statusContainer = document.getElementById('m_status_container');
  if (document.body.classList.contains('is-admin')) {
    let isTrust = status === 'Доверенный' ? 'selected' : ''; let isNotTrust = status === 'Не доверенный' ? 'selected' : '';
    statusContainer.innerHTML = `<select onchange="changeStalkerStatus(${id}, this.value)" style="width: auto; padding: 5px; font-size: 0.9rem;"><option value="Доверенный" ${isTrust}>Доверенный</option><option value="Не доверенный" ${isNotTrust}>Не доверенный</option></select>`;
  } else {
    let color = status === 'Доверенный' ? '#aaffaa' : '#ffaaaa';
    statusContainer.innerHTML = `<span style="color:${color}; font-weight:bold;">${status}</span>`;
  }
  loadStalkerTasks(id);
}

async function changeStalkerStatus(id, newStatus) { await db.from('stalkers').update({ status: newStatus }).eq('id', id); loadStalkers(); }

async function loadStalkerTasks(stalkerId) {
  let list = document.getElementById('m_tasks_list'); list.innerHTML = '<div style="text-align: center; color: #888;">Загрузка...</div>';
  const { data } = await db.from('stalker_tasks').select('*').eq('stalker_id', stalkerId).order('id', { ascending: false });
  if (!data || data.length === 0) { list.innerHTML = '<div style="text-align: center; color: #555;">Активных контрактов нет</div>'; return; }
  
  list.innerHTML = '';
  data.forEach(t => {
    let giverInfo = document.body.classList.contains('is-admin') ? `<div style="font-size: 0.75rem; color: #ffaa00; margin-bottom: 5px;">Выдал: ${t.giver}</div>` : '';
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

    let actionBtn = '';
    if (!t.is_completed) {
       let safeTitle = t.title.replace(/'/g, "\\'");
       actionBtn = `
          <button class="qty-btn" style="background:#1a3a1a; padding: 4px 10px; font-size: 0.8rem;" onclick="completeTask(${t.id}, ${stalkerId}, ${isLate}, '${safeTitle}')">✅</button>
          <button class="qty-btn" style="background:#552a2a; color:#ffcccc; padding: 4px 10px; font-size: 0.8rem; margin-left:5px;" onclick="failTask(${t.id}, ${stalkerId}, '${safeTitle}')">❌</button>
       `;
    } else {
       if (t.title.includes('[ПРОВАЛ]')) actionBtn = `<span style="color:#ff6666; font-size: 0.9rem;">❌ Провалено</span>`;
       else if (t.title.includes('[ОПОЗДАНИЕ]')) actionBtn = `<span style="color:#ffaa00; font-size: 0.9rem;">⚠️ С опозданием</span>`;
       else actionBtn = `<span style="color:#aaffaa; font-size: 0.9rem;">✓ Закрыто</span>`;
    }

    let safeTitleDel = t.title.replace(/'/g, "\\'");
    let deleteBtn = document.body.classList.contains('is-admin') ? `<button class="qty-btn" style="background:transparent; color:#ff6666; border:none; padding: 2px 6px; margin-left:10px; font-size: 1rem;" onclick="deleteStalkerTask(${t.id}, ${stalkerId}, ${t.is_completed}, '${safeTitleDel}')">✖</button>` : '';

    list.innerHTML += `
      <div class="task-card-list" style="${t.is_completed ? 'opacity:0.6;' : ''}">
        ${giverInfo}
        <div style="font-weight: bold; color: #b3ffb3; margin-bottom: 5px; display:flex; justify-content:space-between;"><span>${t.title.replace('[ПРОВАЛ] ', '').replace('[ОПОЗДАНИЕ] ', '')}</span> ${deleteBtn}</div>
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
  document.getElementById('newTaskForm').style.display = 'none'; loadStalkerTasks(currentStalkerId);
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
      loadStalkers(true);
  }
  loadStalkerTasks(stalkerId);
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

      let safeTitle = task.title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      let safeRisk = task.risk.replace(/'/g, "\\'"); let safeImp = task.importance.replace(/'/g, "\\'");
      let safeDeadline = displayDate.replace(/'/g, "\\'"); let safeReward = task.reward.replace(/'/g, "\\'");
      let safeDesc = (task.description || '').replace(/'/g, "\\'").replace(/\n/g, '\\n');

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

async function loadHousing(isTick = false) {
  let grid = document.getElementById('housingGrid');
  if (!isTick) grid.innerHTML = '<div style="text-align: center; width: 100%;">Загрузка...</div>';
  
  const { data } = await db.from('houses').select('*').order('id', { ascending: true });
  
  let html = '';
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
          
          let editBtn = document.body.classList.contains('is-admin') 
              ? `<button class="qty-btn admin-only" style="background:#2a552a; width:100%; margin-top:10px; padding:8px;" onclick="openHousingModal(${h.id}, '${h.renter || ''}', '${h.deadline || ''}')">✏️ Редактировать</button>` 
              : '';

          html += `<div class="card" style="cursor: default;">
              <h3 style="margin: 0 0 10px; color:#b3ffb3;">Домик #${h.id}</h3>
              <p style="margin: 0 0 5px; color:#8ab88a;">Жилец: <span style="color:${isFree ? '#ffaa00' : '#fff'}; font-weight:bold;">${h.renter || 'Свободно'}</span></p>
              <p style="margin: 0 0 5px; color:#8ab88a;">Срок: <span style="color:${color}; font-weight:bold;">${displayDate}</span></p>
              ${editBtn}
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
    
    if(renter !== 'Свободно' && !deadline) return alert('Укажи срок до какого числа оплачено!');
    
    await db.from('houses').update({renter: renter, deadline: deadline || null}).eq('id', id);
    closeModal('housingModal');
    loadHousing();
}

async function loadRating(isTick = false) {
  let tbody = document.getElementById('ratingBody');
  if (!isTick) tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Подсчет...</td></tr>';
  const { data } = await db.from('obshchak_logs').select('callsign, amount, reason').gt('amount', 0);
  
  let newHTML = '';
  if (!data || data.length === 0) { newHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Пока никто не вносил в общак</td></tr>'; 
  } else {
    let totals = {}; 
    data.forEach(log => { 
      if (!log.reason || !log.reason.startsWith('[ПАХАНКА]')) { totals[log.callsign] = (totals[log.callsign] || 0) + log.amount; }
    });
    let sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) { newHTML = '<tr><td colspan="3" style="text-align: center; border: none; background: transparent;">Пока никто не вносил в общак</td></tr>'; 
    } else {
      sorted.forEach((p, i) => {
        let place = i + 1;
        let placeStyle = '';
        
        if (i === 0) placeStyle = 'color: #ffd700; text-shadow: 0 0 10px #ffd700; font-size: 1.5rem;';
        else if (i === 1) placeStyle = 'color: #c0c0c0; text-shadow: 0 0 8px #c0c0c0; font-size: 1.4rem;';
        else if (i === 2) placeStyle = 'color: #cd7f32; text-shadow: 0 0 6px #cd7f32; font-size: 1.3rem;';

        newHTML += `<tr><td style="${placeStyle}"># ${place}</td><td>${p[0]}</td><td>${p[1].toLocaleString()} руб.</td></tr>`;
      });
    }
  }
  tbody.innerHTML = newHTML;
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
      newHTML += `<tr><td>${dateStr}</td><td>${log.callsign}</td><td style="color:${amtCol}">${amtStr} руб.</td><td style="text-align:left;">${log.reason}</td></tr>`;
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
    if (document.getElementById('main-app').style.display === 'flex') {
      fetchObshchak(); 
      if (currentTab === 'rating') loadRating(true);
      if (currentTab === 'history') loadHistory(true);
      if (currentTab === 'faction-tasks' && currentFactionTaskId === null) loadFactionTasks(true);
      if (currentTab === 'stalkers' && currentStalkerId === null) loadStalkers(true); 
      if (currentTab === 'housing') loadHousing(true);
    }
  }, 20000);

  setInterval(() => {
    if (document.getElementById('main-app').style.display === 'flex') {
      updateOnlineStatus();
    }
  }, 45000);
};


document.addEventListener('contextmenu', event => event.preventDefault()); 
document.onkeydown = function(e) {
  if(e.keyCode == 123) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'I'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'C'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.shiftKey && e.keyCode == 'J'.charCodeAt(0)) return false; 
  if(e.ctrlKey && e.keyCode == 'U'.charCodeAt(0)) return false; 
}