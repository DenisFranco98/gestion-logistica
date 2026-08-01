function iconFor(type) {
  if (type === 'telefono') return '📞';
  return '•';
}

function render(result) {
  const summary = document.getElementById('summary');
  const list = document.getElementById('list');
  list.innerHTML = '';
  summary.classList.remove('summary-ok', 'summary-warn');

  if (!result || !result.groups || result.groups.length === 0) {
    summary.classList.add('summary-ok');
    summary.textContent = '✅ Todo está bien, no hay órdenes duplicadas.';
    return;
  }

  const reviewedCount = result.groups.reduce(
    (acc, g) => acc + (g.rows || []).filter((r) => r.reviewed).length,
    0
  );
  summary.classList.add('summary-warn');
  summary.textContent = `${result.total} pedidos marcados en ${result.groups.length} grupo(s) duplicado(s). (${reviewedCount} revisados)`;
  result.groups.forEach((g) => {
    const li = document.createElement('li');

    const header = document.createElement('div');
    const tel = g.telefono ? ` (Tel: ${g.telefono})` : '';
    header.className = 'group-header';
    header.textContent = `${iconFor(g.type)} ${g.label} — ${g.sample}${g.type === 'telefono' ? '' : tel}`;
    li.appendChild(header);

    const rows = document.createElement('ul');
    rows.className = 'row-list';
    (g.rows || []).forEach((r) => {
      const rowLi = document.createElement('li');
      rowLi.className = 'row-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'reviewed-checkbox';
      checkbox.checked = !!r.reviewed;
      checkbox.title = 'Marcar como revisado';
      checkbox.addEventListener('change', () => toggleReviewed(r.orderKey, checkbox.checked));
      rowLi.appendChild(checkbox);

      const label = document.createElement('span');
      label.className = 'row-label' + (r.reviewed ? ' row-label-reviewed' : '');
      label.textContent = r.producto || r.nombre || r.telefono || 'Pedido';
      rowLi.appendChild(label);

      const groupDupIds = (g.rows || []).map((row) => row.dupId);
      const btn = document.createElement('button');
      btn.className = 'locate-btn';
      btn.textContent = '📍 Ubicar';
      btn.addEventListener('click', () => locateRow(r.dupId, groupDupIds));
      rowLi.appendChild(btn);

      rows.appendChild(rowLi);
    });
    li.appendChild(rows);

    list.appendChild(li);
  });
}

function toggleReviewed(orderKey, reviewed) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('app.dropi.co')) return;
    chrome.tabs.sendMessage(tab.id, { action: 'toggleReviewed', orderKey, reviewed }, (response) => {
      if (chrome.runtime.lastError) return;
      render(response);
    });
  });
}

function locateRow(dupId, groupDupIds) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('app.dropi.co')) return;
    chrome.tabs.sendMessage(tab.id, { action: 'scrollTo', dupId, groupDupIds }, () => {
      // Ignorar errores; si la fila ya no existe simplemente no se mueve nada.
      void chrome.runtime.lastError;
    });
  });
}

function queryContentScript(action) {
  if (action === 'rescan') {
    const summary = document.getElementById('summary');
    summary.classList.remove('summary-ok', 'summary-warn');
    summary.textContent = 'Escaneando...';
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('app.dropi.co')) {
      document.getElementById('summary').textContent =
        'Abre la página de Mis Pedidos de Dropi (app.dropi.co/dashboard/orders) para usar esta extensión.';
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action }, (response) => {
      if (chrome.runtime.lastError) {
        document.getElementById('summary').textContent =
          'No se pudo conectar con la página. Recárgala e intenta de nuevo.';
        return;
      }
      render(response);
    });
  });
}

document.getElementById('rescanBtn').addEventListener('click', () => queryContentScript('rescan'));
queryContentScript('getLastResult');
