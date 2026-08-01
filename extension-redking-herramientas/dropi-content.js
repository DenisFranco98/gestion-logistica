(function () {
  const SCAN_DEBOUNCE_MS = 400;
  let debounceTimer = null;
  let lastResult = { total: 0, groups: [] };
  let reviewedSet = new Set();

  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  function loadReviewed(cb) {
    chrome.storage.local.get({ dupReviewedOrders: {} }, (data) => {
      reviewedSet = new Set(Object.keys(data.dupReviewedOrders || {}));
      if (cb) cb();
    });
  }

  function setReviewed(orderKey, reviewed) {
    if (reviewed) reviewedSet.add(orderKey);
    else reviewedSet.delete(orderKey);
    chrome.storage.local.get({ dupReviewedOrders: {} }, (data) => {
      const obj = data.dupReviewedOrders || {};
      if (reviewed) obj[orderKey] = true;
      else delete obj[orderKey];
      chrome.storage.local.set({ dupReviewedOrders: obj });
    });
  }

  function normalizeText(str) {
    return (str || '')
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizePhone(str) {
    return (str || '').replace(/\D/g, '');
  }

  function findTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    for (const table of tables) {
      const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
        normalizeText(th.textContent)
      );
      if (headers.some((h) => h.includes('cliente')) && headers.some((h) => h.includes('producto'))) {
        return table;
      }
    }
    return null;
  }

  function getHeaderIndexes(table) {
    const headers = Array.from(table.querySelectorAll('thead th')).map((th) => normalizeText(th.textContent));
    const idx = {};
    headers.forEach((h, i) => {
      if (h.includes('cliente')) idx.cliente = i;
      if (h.includes('nombre del producto')) idx.producto = i;
    });
    return idx;
  }

  function extractClienteInfo(td) {
    let nombre = '';
    for (const node of td.childNodes) {
      if (node.nodeName === 'BR') break;
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        nombre = node.textContent.trim();
        break;
      }
    }
    const fullText = td.innerText || td.textContent || '';
    const phoneMatch = fullText.match(/Tel:\s*([\d\s\-()]+)/i);
    const telefono = phoneMatch ? phoneMatch[1].trim() : '';
    return { nombre, telefono };
  }

  function clearHighlights(table) {
    table.querySelectorAll('tr.dup-telefono').forEach((tr) => {
      tr.classList.remove('dup-telefono', 'dup-reviewed');
      tr.removeAttribute('title');
      tr.querySelectorAll('.dup-badge').forEach((b) => b.remove());
    });
  }

  function addBadge(td, text, className) {
    const badge = document.createElement('span');
    badge.className = 'dup-badge ' + className;
    badge.textContent = text;
    td.insertBefore(badge, td.firstChild);
  }

  function scan() {
    const table = findTable();
    if (!table) {
      lastResult = { total: 0, groups: [] };
      return lastResult;
    }

    const idx = getHeaderIndexes(table);
    if (idx.cliente === undefined) {
      lastResult = { total: 0, groups: [] };
      return lastResult;
    }

    clearHighlights(table);

    const rows = Array.from(table.querySelectorAll('tbody tr')).filter(
      (tr) => tr.children.length > idx.cliente
    );

    const usedOrderKeys = new Map();
    const rowData = rows.map((tr, i) => {
      const clienteTd = tr.children[idx.cliente];
      const { nombre, telefono } = extractClienteInfo(clienteTd);
      const producto =
        idx.producto !== undefined && tr.children[idx.producto]
          ? tr.children[idx.producto].innerText.trim()
          : '';
      const dupId = 'dup-' + i;
      tr.dataset.dupId = dupId;

      let orderKey = 'ord-' + hashStr(tr.innerText.trim());
      const seen = usedOrderKeys.get(orderKey) || 0;
      usedOrderKeys.set(orderKey, seen + 1);
      if (seen > 0) orderKey += '-' + seen;

      return {
        tr,
        clienteTd,
        nombre,
        telefono,
        producto,
        dupId,
        orderKey,
        reviewed: reviewedSet.has(orderKey),
        phoneKey: normalizePhone(telefono),
      };
    });

    const byPhone = new Map();

    rowData.forEach((r) => {
      if (r.phoneKey) {
        if (!byPhone.has(r.phoneKey)) byPhone.set(r.phoneKey, []);
        byPhone.get(r.phoneKey).push(r);
      }
    });

    const groups = [];
    const flaggedRows = new Set();

    byPhone.forEach((list) => {
      if (list.length > 1) {
        groups.push({
          type: 'telefono',
          label: `Mismo teléfono (${list.length})`,
          sample: list[0].telefono,
          telefono: list[0].telefono,
          phoneKey: list[0].phoneKey,
          rows: list.map((r) => ({
            dupId: r.dupId,
            orderKey: r.orderKey,
            nombre: r.nombre,
            telefono: r.telefono,
            producto: r.producto,
            reviewed: r.reviewed,
          })),
        });
        list.forEach((r) => {
          r.tr.classList.add('dup-telefono');
          r.tr.classList.toggle('dup-reviewed', r.reviewed);
          r.tr.title = `Mismo teléfono "${r.telefono}" en ${list.length} pedidos`;
          if (!flaggedRows.has(r.tr)) {
            addBadge(r.clienteTd, r.reviewed ? '✔ Revisado' : '📞 Teléfono repetido', r.reviewed ? 'dup-badge-reviewed' : 'dup-badge-telefono');
            flaggedRows.add(r.tr);
          }
        });
      }
    });

    groups.sort((a, b) => {
      const pa = a.phoneKey || '';
      const pb = b.phoneKey || '';
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      return pa.localeCompare(pb);
    });

    lastResult = { total: flaggedRows.size, groups };
    return lastResult;
  }

  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scan, SCAN_DEBOUNCE_MS);
  }

  const observer = new MutationObserver(scheduleScan);
  function startObserving() {
    const table = findTable();
    const target = (table && (table.querySelector('tbody') || table)) || document.body;
    observer.disconnect();
    observer.observe(target, { childList: true, subtree: true });
  }

  function init() {
    scan();
    startObserving();
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
  // Reintentos por si la tabla de Angular carga después del evento load
  setTimeout(init, 1500);
  setTimeout(scan, 3500);
  // El estado "revisado" se carga de forma asíncrona; al llegar, se vuelve a escanear
  // para reflejarlo en la tabla aunque ya se haya hecho un escaneo inicial sin él.
  loadReviewed(() => scan());

  function clearFlash() {
    document.querySelectorAll('tr.dup-flash').forEach((tr) => tr.classList.remove('dup-flash'));
  }

  function scrollToRow(dupId, groupDupIds) {
    const tr = document.querySelector(`tr[data-dup-id="${CSS.escape(dupId)}"]`);
    if (!tr) return false;

    clearFlash();
    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const ids = Array.isArray(groupDupIds) && groupDupIds.length ? groupDupIds : [dupId];
    const flashed = [];
    ids.forEach((id) => {
      const row = document.querySelector(`tr[data-dup-id="${CSS.escape(id)}"]`);
      if (row) {
        row.classList.add('dup-flash');
        flashed.push(row);
      }
    });
    setTimeout(() => flashed.forEach((row) => row.classList.remove('dup-flash')), 2000);
    return true;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'rescan') {
      sendResponse(scan());
    } else if (msg && msg.action === 'getLastResult') {
      sendResponse(lastResult);
    } else if (msg && msg.action === 'scrollTo') {
      sendResponse({ found: scrollToRow(msg.dupId, msg.groupDupIds) });
    } else if (msg && msg.action === 'toggleReviewed') {
      setReviewed(msg.orderKey, msg.reviewed);
      sendResponse(scan());
    }
    return true;
  });
})();
