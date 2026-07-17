const http = require('http');
const fs   = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'curriculum-booklet.html');
const PORT = process.env.PORT || 3737;

// ── Injected toolbar HTML (no inline script) ──────────────────────
const TOOLBAR = `
<div data-injected id="__bar" style="position:fixed;top:0;left:0;right:0;z-index:99999;background:#F8C607;padding:8px 16px;display:flex;align-items:center;gap:12px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.4)">
  <strong style="font-size:13px;letter-spacing:.3px">PEC Editor</strong>
  <span id="__status" style="font-size:12px;color:#555">Loading...</span>
  <button onclick="__save()" style="background:#000;color:#F8C607;border:none;padding:6px 16px;font-size:12px;font-weight:700;border-radius:5px;cursor:pointer;letter-spacing:.3px">Save &#8984;S</button>
  <button onclick="__download()" style="background:#1a6bb5;color:#fff;border:none;padding:6px 16px;font-size:12px;font-weight:700;border-radius:5px;cursor:pointer;letter-spacing:.3px">&#11015; Download</button>
  <label style="background:#333;color:#fff;padding:6px 14px;font-size:12px;font-weight:600;border-radius:5px;cursor:pointer;margin-left:auto;white-space:nowrap">
    Replace Image
    <input type="file" accept="image/*" style="display:none" onchange="__replaceImg(event)">
  </label>
  <span id="__imgtip" style="font-size:11px;color:#555;white-space:nowrap">Double-click any image to select it</span>
</div>
<style data-injected>
body { padding-top: 46px !important; }
.__ed { cursor: text; }
.__ed:hover { outline: 2px dashed rgba(248,198,7,.8) !important; background: rgba(248,198,7,.05) !important; }
.__ed:focus { outline: 2px solid #F8C607 !important; background: rgba(248,198,7,.1) !important; border-radius: 2px; }
.__img:hover { outline: 3px solid #F8C607 !important; cursor: pointer; }
.__img.sel   { outline: 3px solid #e74c3c !important; }
</style>
<script data-injected src="/editor.js"></script>`;

// ── Editor script (served separately to avoid inline-script issues) ──
const EDITOR_JS = `
(function () {
  var dirty = false, selImg = -1;

  function txt(id, msg, color) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || '#555';
  }
  function markDirty() {
    dirty = true;
    txt('__status', '\u25cf Unsaved changes', '#c0392b');
  }

  /* ── Make every text element directly editable ── */
  var tags = ['p','h1','h2','h3','h4','h5','li','td','th','caption','blockquote'];
  var classes = ['.divider-title','.divider-desc','.cover-title','.cover-sub',
    '.cover-brand','.cover-year','.letter-greeting','.logistics-title',
    '.content-section-title','.toc-title','.toc-label','.toc-num','.toc-pg',
    '.step-content strong','.step-content span','.step-num',
    '.warning p','.note p','.tip p'];
  var sel = tags.concat(classes).join(',');

  var count = 0;
  document.querySelectorAll(sel).forEach(function(el) {
    if (el.isContentEditable) return;
    el.setAttribute('contenteditable', 'true');
    el.classList.add('__ed');
    el.addEventListener('input', markDirty);
    count++;
  });
  txt('__status', 'Ready \u2014 ' + count + ' blocks editable. Click any text to edit.');

  /* ── Index embedded images ── */
  document.querySelectorAll('img[src^="data:"]').forEach(function(img, i) {
    img.classList.add('__img');
    img.dataset.edIdx = i;
    img.addEventListener('dblclick', function(e) {
      e.preventDefault(); e.stopPropagation();
      document.querySelectorAll('.__img.sel').forEach(function(x){ x.classList.remove('sel'); });
      img.classList.add('sel');
      selImg = i;
      txt('__imgtip', 'Image #' + i + ' selected \u2014 pick a file above');
    });
  });

  /* ── Clean clone for save/download ── */
  function cleanClone() {
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-injected]').forEach(function(el){ el.remove(); });
    clone.querySelectorAll('[id^="__"]').forEach(function(el){ el.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function(el){ el.removeAttribute('contenteditable'); });
    clone.querySelectorAll('.__ed').forEach(function(el){ el.classList.remove('__ed'); });
    clone.querySelectorAll('.__img').forEach(function(el){
      el.classList.remove('__img','sel');
      delete el.dataset.edIdx;
    });
    var body = clone.querySelector('body');
    if (body) body.style.paddingTop = '';
    return '<!DOCTYPE html>\\n' + clone.outerHTML;
  }

  /* ── Save to server ── */
  window.__save = async function() {
    txt('__status', 'Saving\u2026', '#888');
    try {
      var r = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: cleanClone()
      });
      var d = await r.json();
      if (d.ok) {
        dirty = false;
        txt('__status', '\u2713 Saved');
        setTimeout(function(){ txt('__status', 'Ready \u2014 click any text to edit it'); }, 2000);
      } else {
        txt('__status', '\u274c Save failed: ' + d.error, '#e74c3c');
      }
    } catch(e) {
      txt('__status', '\u274c ' + e.message, '#e74c3c');
    }
  };

  /* ── Download ── */
  window.__download = function() {
    var blob = new Blob([cleanClone()], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'curriculum-booklet.html';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ── Replace image ── */
  window.__replaceImg = function(e) {
    if (selImg < 0) { alert('Double-click an image first to select it, then pick a file.'); e.target.value = ''; return; }
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var img = document.querySelector('img[data-ed-idx="' + selImg + '"]');
      if (img) { img.src = ev.target.result; img.classList.remove('sel'); }
      markDirty();
      txt('__imgtip', 'Image replaced \u2014 \u2318S to save');
      selImg = -1;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /* ── Keyboard shortcut ── */
  document.addEventListener('keydown', function(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); window.__save(); }
  });

  /* ── Warn on close if unsaved ── */
  window.addEventListener('beforeunload', function(e) {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}());
`;

function serveEditor(res) {
  var html = fs.readFileSync(HTML_PATH, 'utf8');
  html = html.replace('</body>', TOOLBAR + '\n</body>');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(html);
}

function collectRaw(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(c) { chunks.push(c); });
    req.on('end',  function()  { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

var server = http.createServer(async function(req, res) {
  var pathname = req.url.split('?')[0];

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (pathname === '/') {
    serveEditor(res);
    return;
  }

  if (pathname === '/editor.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(EDITOR_JS);
    return;
  }

  if (pathname === '/api/save' && req.method === 'POST') {
    var html = await collectRaw(req);
    try {
      fs.writeFileSync(HTML_PATH, html, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, function() {
  console.log('\n\uD83D\uDFE1  PEC Academy Booklet Editor running on port ' + PORT);
});
