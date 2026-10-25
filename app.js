// File: app.js
"use strict";

/* ========== 保存処理 ========== */

const KEYS = {
  logs: "illustLab.logs",
  roadmap: "illustLab.roadmap",
  settings: "illustLab.settings",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadLogs() {
  const v = loadJSON(KEYS.logs, []);
  return Array.isArray(v) ? v : [];
}

function saveLogs(logs) {
  saveJSON(KEYS.logs, logs);
}

function loadSettings() {
  const v = loadJSON(KEYS.settings, {});
  return { weeklyGoal: 300, ...(v && typeof v === "object" ? v : {}) };
}

function loadRoadmap() {
  const v = loadJSON(KEYS.roadmap, {});
  return v && typeof v === "object" ? v : {};
}

let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("illustLab", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("images");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("images", mode);
    const req = fn(tx.objectStore("images"));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const imgPut = (id, blob) => idb("readwrite", (s) => s.put(blob, id));
const imgGet = (id) => idb("readonly", (s) => s.get(id));
const imgDelete = (id) => idb("readwrite", (s) => s.delete(id));
const imgClear = () => idb("readwrite", (s) => s.clear());
const imgKeys = () => idb("readonly", (s) => s.getAllKeys());

/* ========== 汎用関数 ========== */

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const sumBy = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0);

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr, rnd = Math.random) => arr[Math.floor(rnd() * arr.length)];

function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

function calcStreaks(logs) {
  const dates = [...new Set(logs.map((l) => l.date))].sort();
  if (!dates.length) return { current: 0, longest: 0 };
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    run = diffDays(dates[i - 1], dates[i]) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(dates);
  const today = todayStr();
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

function notify(message, type = "info") {
  const el = h("div", { class: `toast ${type}` }, message);
  document.getElementById("toast").append(el);
  setTimeout(() => el.remove(), 3000);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rafScheduler(fn) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      fn();
    });
  };
}

/* ========== 画面部品 ========== */

const metric = (label, value) =>
  h("div", { class: "metric" }, h("div", { class: "metric-label" }, label), h("div", { class: "metric-value" }, value));

const card = (...children) => h("section", { class: "card" }, ...children);

function progress(ratio, text) {
  const fill = h("div", { class: "progress-fill" });
  const label = h("div", { class: "progress-text" });
  const el = h("div", { class: "progress-wrap" }, h("div", { class: "progress" }, fill), label);
  el.set = (r, t) => {
    fill.style.width = `${clamp(r, 0, 1) * 100}%`;
    label.textContent = t || "";
    label.hidden = !t;
  };
  el.set(ratio, text);
  return el;
}

function segmented(options, value, onChange) {
  const buttons = options.map((opt) =>
    h(
      "button",
      {
        type: "button",
        class: opt === value ? "seg active" : "seg",
        onclick: (e) => {
          buttons.forEach((b) => b.classList.remove("active"));
          e.currentTarget.classList.add("active");
          onChange(opt);
        },
      },
      opt,
    ),
  );
  return h("div", { class: "segmented" }, buttons);
}

function rangeField(label, min, max, value, step = 1, format = (v) => v) {
  const input = h("input", { type: "range", min, max, step, value });
  const out = h("span", { class: "range-value" }, format(value));
  input.addEventListener("input", () => {
    out.textContent = format(input.value);
  });
  return { input, el: h("label", { class: "field" }, h("span", { class: "field-label" }, label, " ", out), input) };
}

function checkField(label, checked = false) {
  const input = h("input", { type: "checkbox", checked });
  return { input, el: h("label", { class: "check" }, input, h("span", {}, label)) };
}

function labeled(label, control) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control);
}

function fileInput(onFile, { multiple = false, label = "画像を選択" } = {}) {
  const input = h("input", { type: "file", accept: "image/*", multiple });
  const name = h("span", { class: "file-name" }, "未選択");
  input.addEventListener("change", async () => {
    const files = [...input.files];
    if (!files.length) return;
    name.textContent = multiple ? `${files.length} 枚選択中` : files[0].name;
    try {
      await onFile(multiple ? files : files[0]);
    } catch (e) {
      console.error(e);
      notify(e.message || "画像の読み込みに失敗しました", "error");
    }
  });
  return h("label", { class: "file-input" }, input, h("span", { class: "btn" }, label), name);
}

const figure = (media, caption) => h("figure", {}, media, caption ? h("figcaption", {}, caption) : null);

function columnChart(labels, values, unit) {
  const max = Math.max(1, ...values);
  return h(
    "div",
    { class: "col-chart" },
    values.map((v, i) =>
      h(
        "div",
        { class: "col", title: `${labels[i]}: ${v}${unit}` },
        h("div", { class: "col-bar", style: `height:${(v / max) * 100}%` }),
        i % 5 === 4 ? h("div", { class: "col-label" }, labels[i]) : null,
      ),
    ),
  );
}

function rowChart(entries, unit) {
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return h(
    "div",
    { class: "row-chart" },
    entries.map(([label, v]) =>
      h(
        "div",
        { class: "row-item" },
        h("span", {}, label),
        h("div", {}, h("div", { class: "row-bar", style: `width:${(v / max) * 100}%` })),
        h("span", { class: "muted" }, `${v}${unit}`),
      ),
    ),
  );
}

/* ========== 画像処理 ========== */

function newCanvas(w, hgt) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = hgt;
  return c;
}

const ctx2d = (c) => c.getContext("2d", { willReadFrequently: true });

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像を読み込めませんでした"));
    img.src = src;
  });
}

async function fileToCanvas(file, maxSize = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const hgt = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = newCanvas(w, hgt);
    const ctx = ctx2d(c);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, hgt);
    ctx.drawImage(img, 0, 0, w, hgt);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(c, type = "image/jpeg", quality = 0.9) {
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("画像の変換に失敗しました"))), type, quality);
  });
}

function cloneCanvas(src, mirror = false) {
  const c = newCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  if (mirror) {
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

function resizeCanvas(src, w, hgt) {
  const c = newCanvas(w, hgt);
  ctx2d(c).drawImage(src, 0, 0, w, hgt);
  return c;
}

function scaleCanvas(src, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  return resizeCanvas(src, Math.max(1, Math.round(src.width * scale)), Math.max(1, Math.round(src.height * scale)));
}

function grayArray(c) {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
  const g = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  }
  return g;
}

function grayToCanvas(g, w, hgt) {
  const c = newCanvas(w, hgt);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, hgt);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    img.data[i] = g[j];
    img.data[i + 1] = g[j];
    img.data[i + 2] = g[j];
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function posterize(g, levels) {
  const out = new Uint8ClampedArray(g.length);
  const step = 255 / (levels - 1);
  for (let i = 0; i < g.length; i++) {
    const idx = Math.min(levels - 1, Math.floor((g[i] / 256) * levels));
    out[i] = Math.round(idx * step);
  }
  return out;
}

function boxPass(src, dst, w, hgt, r, horizontal) {
  const len = horizontal ? w : hgt;
  const lines = horizontal ? hgt : w;
  const step = horizontal ? 4 : w * 4;
  const lineStep = horizontal ? w * 4 : 4;
  const size = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let ch = 0; ch < 3; ch++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) {
        sum += src[base + clamp(k, 0, len - 1) * step + ch];
      }
      for (let i = 0; i < len; i++) {
        dst[base + i * step + ch] = sum / size;
        const outIdx = Math.max(0, i - r);
        const inIdx = Math.min(len - 1, i + r + 1);
        sum += src[base + inIdx * step + ch] - src[base + outIdx * step + ch];
      }
    }
    for (let i = 0; i < len; i++) {
      dst[base + i * step + 3] = src[base + i * step + 3];
    }
  }
}

function blurCanvas(c, r) {
  const ctx = ctx2d(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const a = Float32Array.from(img.data);
  const b = new Float32Array(a.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, c.width, c.height, r, true);
    boxPass(b, a, c.width, c.height, r, false);
  }
  img.data.set(a);
  ctx.putImageData(img, 0, 0);
}

function drawGrid(src, div, color, diagonal) {
  const c = cloneCanvas(src);
  const ctx = ctx2d(c);
  const w = c.width;
  const hgt = c.height;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, hgt) / 300));
  ctx.beginPath();
  for (let i = 1; i < div; i++) {
    const x = (w * i) / div;
    const y = (hgt * i) / div;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, hgt);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  if (diagonal) {
    ctx.moveTo(0, 0);
    ctx.lineTo(w, hgt);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, hgt);
  }
  ctx.stroke();
  return c;
}

function extractPalette(src, n) {
  const small = scaleCanvas(src, 200);
  const d = ctx2d(small).getImageData(0, 0, small.width, small.height).data;
  const pixels = [];
  for (let i = 0; i < d.length; i += 4) pixels.push([d[i], d[i + 1], d[i + 2]]);
  const boxes = [pixels];
  while (boxes.length < n) {
    let best = -1;
    let bestRange = 0;
    let bestCh = 0;
    boxes.forEach((box, bi) => {
      if (box.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let min = 255;
        let max = 0;
        for (const p of box) {
          if (p[ch] < min) min = p[ch];
          if (p[ch] > max) max = p[ch];
        }
        if (max - min > bestRange) {
          bestRange = max - min;
          best = bi;
          bestCh = ch;
        }
      }
    });
    if (best < 0) break;
    const box = boxes[best].slice().sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, "0").toUpperCase();
  return boxes
    .map((box) => {
      const avg = [0, 1, 2].map((ch) => sumBy(box, (p) => p[ch]) / box.length);
      return { hex: `#${avg.map(hex).join("")}`, ratio: box.length / pixels.length };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

function blendCanvas(ref, mine, alpha) {
  const c = cloneCanvas(ref);
  const ctx = ctx2d(c);
  ctx.globalAlpha = alpha;
  ctx.drawImage(mine, 0, 0, c.width, c.height);
  return c;
}

function diffCanvas(ref, mine) {
  const a = grayArray(ref);
  const b = grayArray(mine);
  const out = new Uint8ClampedArray(a.length);
  let min = 255;
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    out[i] = Math.abs(a[i] - b[i]);
    if (out[i] < min) min = out[i];
    if (out[i] > max) max = out[i];
  }
  if (max > min) {
    const scale = 255 / (max - min);
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) * scale;
  }
  return grayToCanvas(out, ref.width, ref.height);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function dataUrlToBlob(url) {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!m) throw new Error("画像データが不正です。");
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

/* ========== ページ遷移 ========== */

let cleanupFns = [];
let navToken = 0;
const memory = {};

const onCleanup = (fn) => cleanupFns.push(fn);

function trackUrl(url) {
  onCleanup(() => URL.revokeObjectURL(url));
  return url;
}

function runCleanup() {
  for (const fn of cleanupFns) {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  }
  cleanupFns = [];
}

function updateSidebarStreak() {
  document.getElementById("sidebar-streak").textContent = calcStreaks(loadLogs()).current;
}

/* ========== ダッシュボード ========== */

function renderDashboard(main) {
  const logs = loadLogs();
  const settings = loadSettings();
  const { current, longest } = calcStreaks(logs);
  const total = sumBy(logs, (l) => l.minutes);
  const today = todayStr();

  main.append(
    h("h1", {}, "🏠 ダッシュボード"),
    h(
      "div",
      { class: "metrics" },
      metric("連続練習日数", `${current} 日`),
      metric("最長連続記録", `${longest} 日`),
      metric("総練習時間", `${Math.floor(total / 60)} 時間 ${total % 60} 分`),
      metric("練習回数", `${logs.length} 回`),
    ),
  );

  const weekStart = addDays(today, -6);
  const weekMin = sumBy(logs.filter((l) => l.date >= weekStart && l.date <= today), (l) => l.minutes);
  const goalInput = h("input", { type: "number", min: 10, max: 10000, step: 10, value: settings.weeklyGoal });
  const bar = progress(0, "");
  const updateGoal = () => {
    const goal = clamp(toInt(goalInput.value, 300), 10, 10000);
    bar.set(weekMin / goal, `直近7日間: ${weekMin} / ${goal} 分`);
    return goal;
  };
  goalInput.addEventListener("change", () => {
    const goal = updateGoal();
    goalInput.value = goal;
    saveJSON(KEYS.settings, { ...loadSettings(), weeklyGoal: goal });
  });
  updateGoal();
  main.append(card(h("h2", {}, "今週の目標"), h("div", { style: "max-width:220px" }, labeled("1週間の目標（分）", goalInput)), bar));

  const [y, m, d] = today.split("-").map(Number);
  const rnd = seededRandom(y * 10000 + m * 100 + d);
  const topic = `${pick(PLACES, rnd)}で${pick(ACTIONS, rnd)}${pick(SUBJECTS, rnd)}（条件: ${pick(CONSTRAINTS["初級"], rnd)}）`;
  const drill = pick(DRILLS, rnd);
  main.append(
    card(
      h("h2", {}, "今日のお題"),
      h("div", { class: "notice" }, topic),
      h("div", { class: "notice success" }, `今日の基礎ドリル: ${drill[0]} — ${drill[1]}`),
    ),
  );

  if (!logs.length) {
    main.append(h("p", { class: "muted" }, "まだ練習記録がありません。「練習ログ」から最初の記録を付けてみましょう。"));
    return;
  }

  const days = [];
  for (let i = 29; i >= 0; i--) days.push(addDays(today, -i));
  const daily = new Map(days.map((dd) => [dd, 0]));
  for (const l of logs) if (daily.has(l.date)) daily.set(l.date, daily.get(l.date) + l.minutes);

  const catMap = new Map();
  for (const l of logs) for (const c of l.categories || []) catMap.set(c, (catMap.get(c) || 0) + l.minutes);
  const catEntries = [...catMap.entries()].sort((a, b) => b[1] - a[1]);
  const weak = CATEGORIES.filter((c) => !catMap.has(c));

  main.append(
    h(
      "div",
      { class: "grid2" },
      card(
        h("h2", {}, "直近30日の練習時間（分）"),
        columnChart(days.map((dd) => dd.slice(5).replace("-", "/")), days.map((dd) => daily.get(dd)), "分"),
      ),
      card(
        h("h2", {}, "分野別の練習時間（分）"),
        catEntries.length ? rowChart(catEntries, "分") : h("p", { class: "muted" }, "分野の記録がありません。"),
        weak.length ? h("p", { class: "muted small" }, `まだ練習していない分野: ${weak.join("、")}`) : null,
      ),
    ),
  );
}

/* ========== お題ガチャ ========== */

function renderPrompt(main) {
  let level = memory.level || "初級";
  const result = h("div", {});
  const drillBox = h("div", {});

  const showPrompt = (p) => {
    result.replaceChildren(
      h("div", { class: "prompt-title" }, `${p.place}で${p.action}${p.subject}`),
      h("div", { class: "metrics" }, metric("条件", p.constraint), metric("制限時間", p.time)),
    );
    result.classList.remove("pop");
    void result.offsetWidth;
    result.classList.add("pop");
  };
  const showDrill = (dr) => {
    drillBox.replaceChildren(h("div", { class: "notice success pop" }, `${dr[0]}: ${dr[1]}`));
  };

  main.append(
    h("h1", {}, "🎲 お題ガチャ"),
    card(
      h("div", {}, segmented(Object.keys(CONSTRAINTS), level, (v) => {
        level = v;
        memory.level = v;
      })),
      h(
        "button",
        {
          class: "btn primary",
          onclick: () => {
            memory.prompt = {
              subject: pick(SUBJECTS),
              action: pick(ACTIONS),
              place: pick(PLACES),
              constraint: pick(CONSTRAINTS[level]),
              time: pick(TIME_LIMITS),
            };
            showPrompt(memory.prompt);
          },
        },
        "お題を引く",
      ),
      result,
    ),
    card(
      h("h2", {}, "基礎ドリルガチャ"),
      h(
        "button",
        {
          class: "btn",
          onclick: () => {
            memory.drill = pick(DRILLS);
            showDrill(memory.drill);
          },
        },
        "ドリルを引く",
      ),
      h("div", { style: "margin-top:12px" }, drillBox),
      h("details", {}, h("summary", {}, "ドリル一覧"), h("ul", {}, DRILLS.map(([n, d]) => h("li", {}, `${n}: ${d}`)))),
    ),
  );
  if (memory.prompt) showPrompt(memory.prompt);
  if (memory.drill) showDrill(memory.drill);
}

/* ========== クロッキータイマー ========== */

function renderTimer(main) {
  const presetOptions = [
    ["30", "30秒"],
    ["60", "1分"],
    ["120", "2分"],
    ["300", "5分"],
    ["600", "10分"],
    ["custom", "カスタム"],
  ];
  const preset = h("select", {}, presetOptions.map(([v, t]) => h("option", { value: v, selected: v === "60" }, t)));
  const custom = h("input", { type: "number", min: 5, max: 3600, step: 5, value: 90 });
  const customWrap = labeled("秒数", custom);
  customWrap.hidden = true;
  const count = h("input", { type: "number", min: 1, max: 100, value: 10 });
  const rest = h("input", { type: "number", min: 0, max: 300, value: 5 });
  const shuffleCb = checkField("画像をシャッフル", true);
  const soundCb = checkField("通知音を鳴らす", true);
  const totalText = h("p", { class: "muted small" });

  let urls = [];
  const fi = fileInput(
    (files) => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls = files.map((f) => URL.createObjectURL(f));
      updateTotal();
    },
    { multiple: true, label: "資料画像を選択（複数可）" },
  );
  onCleanup(() => urls.forEach((u) => URL.revokeObjectURL(u)));

  const S = { phase: "ready", idx: 0, remain: 60, timer: null, order: [], cfg: null, audio: null, logged: false };

  const status = h("div", { class: "timer-status" });
  const time = h("div", { class: "timer-time" });
  const fill = h("div", { class: "timer-fill" });
  const ref = h("img", { class: "timer-ref", alt: "資料画像" });
  ref.hidden = true;
  const logBtn = h("button", { class: "btn primary" }, "この練習を練習ログに記録");
  const doneBox = h("div", { style: "margin-top:12px" }, logBtn);
  doneBox.hidden = true;

  const startBtn = h("button", { class: "btn primary" }, "スタート");
  const pauseBtn = h("button", { class: "btn" }, "一時停止");
  const skipBtn = h("button", { class: "btn" }, "スキップ");
  const resetBtn = h("button", { class: "btn" }, "リセット");
  const fullBtn = h("button", { class: "btn" }, "全画面");

  const stage = h(
    "div",
    { class: "timer-stage" },
    status,
    time,
    h("div", { class: "timer-bar" }, fill),
    h("div", { class: "timer-buttons" }, startBtn, pauseBtn, skipBtn, resetBtn, fullBtn),
    doneBox,
    ref,
  );

  function readCfg() {
    const pose = preset.value === "custom" ? clamp(toInt(custom.value, 90), 5, 3600) : toInt(preset.value, 60);
    return {
      pose,
      count: clamp(toInt(count.value, 10), 1, 100),
      rest: clamp(toInt(rest.value, 5), 0, 300),
    };
  }

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const fmtDur = (s) => (s % 60 === 0 ? `${s / 60}分` : s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60}秒`);

  function ensureAudio() {
    if (!soundCb.input.checked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!S.audio && AC) S.audio = new AC();
    if (S.audio && S.audio.state === "suspended") S.audio.resume();
  }

  function beep(freq) {
    if (!soundCb.input.checked || !S.audio) return;
    const osc = S.audio.createOscillator();
    const gain = S.audio.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(S.audio.destination);
    osc.start();
    osc.stop(S.audio.currentTime + 0.25);
  }

  function render() {
    const cfg = S.cfg || readCfg();
    time.textContent = fmt(Math.max(0, S.remain));
    const labels = {
      ready: "準備ができたらスタートを押してください",
      draw: `描画中 ${S.idx + 1} / ${cfg.count}`,
      rest: `休憩中（次は ${S.idx + 2} / ${cfg.count}）`,
      done: `お疲れさまでした！全 ${cfg.count} ポーズ完了`,
    };
    status.textContent = labels[S.phase];

    if (S.order.length && (S.phase === "draw" || S.phase === "rest")) {
      const src = S.order[S.idx % S.order.length];
      if (ref.getAttribute("src") !== src) ref.src = src;
      ref.hidden = false;
      ref.classList.toggle("dim", S.phase === "rest");
    } else {
      ref.hidden = true;
    }

    const span = S.phase === "rest" ? cfg.rest : cfg.pose;
    let pct = 0;
    if ((S.phase === "draw" || S.phase === "rest") && span > 0) pct = (100 * (span - S.remain)) / span;
    if (S.phase === "done") pct = 100;
    fill.style.width = `${pct}%`;
    doneBox.hidden = S.phase !== "done";
  }

  function stop() {
    if (S.timer) {
      clearInterval(S.timer);
      S.timer = null;
    }
  }

  function next() {
    if (S.phase === "draw") {
      if (S.idx >= S.cfg.count - 1) {
        S.phase = "done";
        S.remain = 0;
        stop();
        beep(880);
        logBtn.disabled = S.logged;
        render();
        return;
      }
      if (S.cfg.rest > 0) {
        S.phase = "rest";
        S.remain = S.cfg.rest;
      } else {
        S.idx++;
        S.remain = S.cfg.pose;
      }
      beep(660);
    } else if (S.phase === "rest") {
      S.idx++;
      S.phase = "draw";
      S.remain = S.cfg.pose;
      beep(990);
    }
    render();
  }

  function tick() {
    S.remain--;
    if (S.remain <= 0) {
      next();
    } else {
      if (S.remain <= 3) beep(440);
      render();
    }
  }

  function updateTotal() {
    customWrap.hidden = preset.value !== "custom";
    const c = readCfg();
    const t = c.pose * c.count + c.rest * Math.max(0, c.count - 1);
    let text = `合計時間の目安: 約${Math.floor(t / 60)}分${t % 60}秒`;
    if (urls.length && urls.length < c.count) text += `（画像が${urls.length}枚なので繰り返し表示されます）`;
    totalText.textContent = text;
    if (S.phase === "ready") {
      S.remain = c.pose;
      render();
    }
  }

  startBtn.addEventListener("click", () => {
    ensureAudio();
    if (S.phase === "ready" || S.phase === "done") {
      S.cfg = readCfg();
      S.order = shuffleCb.input.checked ? shuffle(urls) : urls.slice();
      S.idx = 0;
      S.phase = "draw";
      S.remain = S.cfg.pose;
      S.logged = false;
      beep(990);
    }
    if (!S.timer) S.timer = setInterval(tick, 1000);
    render();
  });
  pauseBtn.addEventListener("click", stop);
  skipBtn.addEventListener("click", () => {
    if (S.phase === "draw" || S.phase === "rest") next();
  });
  resetBtn.addEventListener("click", () => {
    stop();
    S.phase = "ready";
    S.idx = 0;
    S.cfg = null;
    S.remain = readCfg().pose;
    render();
  });
  fullBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (stage.requestFullscreen) stage.requestFullscreen();
    else notify("このブラウザは全画面表示に対応していません", "error");
  });
  logBtn.addEventListener("click", () => {
    if (S.logged || !S.cfg) return;
    const cfg = S.cfg;
    const logs = loadLogs();
    logs.push({
      id: uid(),
      date: todayStr(),
      minutes: Math.max(1, Math.round((cfg.pose * cfg.count) / 60)),
      title: `クロッキー ${cfg.count}ポーズ（${fmtDur(cfg.pose)}）`,
      categories: ["クロッキー"],
      rating: 3,
      memo: "",
      image: null,
    });
    saveLogs(logs);
    S.logged = true;
    logBtn.disabled = true;
    updateSidebarStreak();
    notify("練習ログに記録しました", "success");
  });

  [preset, custom, count, rest].forEach((el) => el.addEventListener("input", updateTotal));
  onCleanup(() => {
    stop();
    if (S.audio) S.audio.close();
  });

  main.append(
    h("h1", {}, "⏱️ クロッキータイマー"),
    card(
      h("p", { class: "muted" }, "資料画像を選ぶと、時間ごとに自動で切り替わります。画像がなくてもタイマーとして使えます。画像は端末内で表示するだけで、保存や送信はしません。"),
      h(
        "div",
        { class: "row" },
        labeled("1ポーズの時間", preset),
        customWrap,
        labeled("ポーズ数", count),
        labeled("ポーズ間の休憩（秒）", rest),
      ),
      fi,
      h("div", { class: "row" }, shuffleCb.el, soundCb.el),
      totalText,
    ),
    stage,
  );
  updateTotal();
}

/* ========== 画像分析ツール ========== */

function analysisValueTab(panel) {
  let base = null;
  const mirror = checkField("左右反転（形の狂いチェック）");
  const levels = rangeField("階調数", 2, 8, 3);
  const blur = rangeField("ぼかし（目を細めて見る効果）", 0, 30, 0);
  const out = h("div", { class: "grid3" });

  const render = () => {
    if (!base) return;
    const c = cloneCanvas(base, mirror.input.checked);
    const r = toInt(blur.input.value, 0);
    if (r > 0) blurCanvas(c, r);
    const lv = toInt(levels.input.value, 3);
    const g = grayArray(c);
    out.replaceChildren(
      figure(c, "元画像"),
      figure(grayToCanvas(g, c.width, c.height), "グレースケール"),
      figure(grayToCanvas(posterize(g, lv), c.width, c.height), `${lv}階調`),
    );
  };
  const schedule = rafScheduler(render);
  [mirror.input, levels.input, blur.input].forEach((el) => el.addEventListener("input", schedule));

  panel.append(
    fileInput(async (file) => {
      base = await fileToCanvas(file, 1200);
      render();
    }),
    h("div", { class: "row" }, mirror.el, levels.el, blur.el),
    out,
    h("p", { class: "muted small" }, "グレースケールで主役が目立たない場合、明暗差が不足している可能性があります。"),
  );
}

function analysisGridTab(panel) {
  let base = null;
  const div = rangeField("分割数", 2, 12, 3);
  const color = h("input", { type: "color", value: "#ff0000" });
  const diag = checkField("対角線を表示");
  const out = h("div", {});
  const render = () => {
    if (base) out.replaceChildren(figure(drawGrid(base, toInt(div.input.value, 3), color.value, diag.input.checked)));
  };
  [div.input, color, diag.input].forEach((el) => el.addEventListener("input", render));
  panel.append(
    fileInput(async (file) => {
      base = await fileToCanvas(file, 1600);
      render();
    }),
    h("div", { class: "row" }, div.el, labeled("線の色", color), diag.el),
    out,
    h("p", { class: "muted small" }, "分割数3にすると三分割構図の確認に使えます。模写のときは同じ分割数のグリッドを自分の紙にも引きましょう。"),
  );
}

function analysisPaletteTab(panel) {
  let base = null;
  const n = rangeField("抽出する色数", 3, 16, 6);
  const imgBox = h("div", {});
  const list = h("div", {});
  const render = () => {
    if (!base) return;
    list.replaceChildren(
      ...extractPalette(base, toInt(n.input.value, 6)).map(({ hex, ratio }) =>
        h(
          "div",
          {
            class: "swatch",
            title: "クリックでカラーコードをコピー",
            onclick: () => {
              if (navigator.clipboard) {
                navigator.clipboard.writeText(hex).then(
                  () => notify(`${hex} をコピーしました`, "success"),
                  () => notify("コピーできませんでした", "error"),
                );
              }
            },
          },
          h("div", { class: "swatch-color", style: `background:${hex}` }),
          h("code", {}, hex),
          h("span", { class: "muted" }, `${(ratio * 100).toFixed(1)}%`),
        ),
      ),
    );
  };
  n.input.addEventListener("change", render);
  panel.append(
    fileInput(async (file) => {
      base = await fileToCanvas(file, 800);
      imgBox.replaceChildren(figure(cloneCanvas(base)));
      render();
    }),
    h("div", { class: "row" }, n.el),
    h("div", { class: "grid2" }, imgBox, list),
  );
}

function analysisCompareTab(panel) {
  let ref = null;
  let mine = null;
  let mode = "半透明で重ねる";
  const alpha = rangeField("自分の絵の濃さ", 0, 1, 0.5, 0.05);
  const out = h("div", {});
  const render = () => {
    alpha.el.hidden = mode !== "半透明で重ねる";
    if (!ref || !mine) return;
    const m = resizeCanvas(mine, ref.width, ref.height);
    if (mode === "半透明で重ねる") {
      out.replaceChildren(figure(blendCanvas(ref, m, Number(alpha.input.value))));
    } else if (mode === "差分を表示") {
      out.replaceChildren(figure(diffCanvas(ref, m), "明るい部分ほどズレが大きい箇所です"));
    } else {
      out.replaceChildren(h("div", { class: "grid2" }, figure(cloneCanvas(ref), "資料"), figure(m, "自分の絵")));
    }
  };
  alpha.input.addEventListener("input", rafScheduler(render));
  panel.append(
    h(
      "div",
      { class: "row" },
      fileInput(async (file) => {
        ref = await fileToCanvas(file, 1200);
        render();
      }, { label: "資料（お手本）を選択" }),
      fileInput(async (file) => {
        mine = await fileToCanvas(file, 1200);
        render();
      }, { label: "自分の絵を選択" }),
    ),
    h("div", {}, segmented(["半透明で重ねる", "差分を表示", "横に並べる"], mode, (v) => {
      mode = v;
      render();
    })),
    h("div", { style: "max-width:320px" }, alpha.el),
    out,
    h("p", { class: "muted small" }, "模写の答え合わせに使えます。自分の絵は資料と同じ縦横比で描くと正確に比較できます。"),
  );
}

function renderAnalysis(main) {
  const tabs = [
    ["明暗・形チェック", analysisValueTab],
    ["グリッド", analysisGridTab],
    ["パレット抽出", analysisPaletteTab],
    ["重ねて比較", analysisCompareTab],
  ];
  const panels = tabs.map(([, build]) => {
    const p = h("div", {});
    build(p);
    return p;
  });
  const buttons = tabs.map(([label], i) =>
    h(
      "button",
      {
        class: i === 0 ? "tab active" : "tab",
        onclick: () => {
          buttons.forEach((b, j) => b.classList.toggle("active", i === j));
          panels.forEach((p, j) => {
            p.hidden = i !== j;
          });
        },
      },
      label,
    ),
  );
  panels.forEach((p, j) => {
    p.hidden = j !== 0;
  });
  main.append(
    h("h1", {}, "🔍 画像分析ツール"),
    h("p", { class: "muted" }, "資料や自分の絵を選んで、明暗・形・色を確認できます。処理はすべて端末内で行われ、画像は送信も保存もされません。"),
    card(h("div", { class: "tabs" }, buttons), panels),
  );
}

/* ========== 練習ログ ========== */

async function deleteLog(id) {
  const logs = loadLogs();
  const target = logs.find((l) => l.id === id);
  if (!target) return;
  if (!confirm(`「${target.date} ${target.title}」を削除しますか？`)) return;
  if (target.image) await imgDelete(target.image).catch(() => {});
  saveLogs(logs.filter((l) => l.id !== id));
  notify("削除しました");
  navigate();
}

function csvCell(v) {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

function renderLog(main) {
  const logs = loadLogs();
  const date = h("input", { type: "date", value: todayStr(), required: true });
  const minutes = h("input", { type: "number", min: 1, max: 1440, value: 30, required: true });
  const title = h("input", { type: "text", maxlength: 100, placeholder: "例: 手の模写10個" });
  const catInputs = CATEGORIES.map((c) => h("input", { type: "checkbox", value: c }));
  const rating = rangeField("自己評価", 1, 5, 3, 1, (v) => "★".repeat(Number(v)) + "☆".repeat(5 - Number(v)));
  const memo = h("textarea", { rows: 3, placeholder: "例: 親指の付け根の形がわかってきた。次は握った手を描く。" });
  const preview = h("div", { class: "preview" });
  let imageFile = null;
  const submit = h("button", { class: "btn primary", type: "submit" }, "記録する");

  const form = h(
    "form",
    {
      class: "card form",
      onsubmit: async (e) => {
        e.preventDefault();
        const m = toInt(minutes.value, 0);
        if (!date.value || m < 1 || m > 1440) {
          notify("日付と練習時間（1〜1440分）を入力してください", "error");
          return;
        }
        submit.disabled = true;
        try {
          const id = uid();
          let image = null;
          if (imageFile) {
            const c = await fileToCanvas(imageFile, 2000);
            await imgPut(id, await canvasToBlob(c, "image/jpeg", 0.9));
            image = id;
          }
          const current = loadLogs();
          current.push({
            id,
            date: date.value,
            minutes: m,
            title: title.value.trim() || "無題",
            categories: catInputs.filter((i) => i.checked).map((i) => i.value),
            rating: toInt(rating.input.value, 3),
            memo: memo.value,
            image,
          });
          saveLogs(current);
          notify("記録しました！", "success");
          navigate();
        } catch (err) {
          console.error(err);
          notify(`保存できませんでした: ${err.message}`, "error");
          submit.disabled = false;
        }
      },
    },
    h("div", { class: "row" }, labeled("日付", date), labeled("練習時間（分）", minutes)),
    labeled("タイトル", title),
    h("div", {}, h("div", { class: "field-label" }, "分野"), h("div", { class: "chips" }, catInputs.map((i) => h("label", { class: "chip" }, i, i.value)))),
    rating.el,
    labeled("気づき・次の課題", memo),
    h(
      "div",
      {},
      h("div", { class: "field-label" }, "作品画像（任意）"),
      fileInput((file) => {
        imageFile = file;
        preview.replaceChildren(h("img", { src: trackUrl(URL.createObjectURL(file)), alt: "プレビュー" }));
      }),
      preview,
    ),
    h("div", {}, submit),
  );

  main.append(h("h1", {}, "📝 練習ログ"), form);

  if (!logs.length) {
    main.append(h("p", { class: "muted" }, "まだ記録がありません。"));
    return;
  }

  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const downloadCsv = () => {
    const header = ["日付", "タイトル", "分", "分野", "自己評価", "メモ"];
    const rows = sorted.map((l) => [l.date, l.title, l.minutes, (l.categories || []).join("、"), l.rating, l.memo]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv" }), "illust_practice_log.csv");
  };

  main.append(
    card(
      h("div", { class: "row", style: "justify-content:space-between;align-items:center" }, h("h2", { style: "margin:0" }, "記録一覧"), h("button", { class: "btn", onclick: downloadCsv }, "CSVでダウンロード")),
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          {},
          h("thead", {}, h("tr", {}, ["日付", "タイトル", "分", "分野", "評価", "メモ", ""].map((t) => h("th", {}, t)))),
          h(
            "tbody",
            {},
            sorted.map((l) =>
              h(
                "tr",
                {},
                h("td", { style: "white-space:nowrap" }, l.date),
                h("td", {}, l.image ? "🖼️ " : "", l.title),
                h("td", {}, l.minutes),
                h("td", {}, (l.categories || []).join("、")),
                h("td", { style: "white-space:nowrap" }, "★".repeat(l.rating)),
                h("td", { class: "memo" }, l.memo),
                h("td", {}, h("button", { class: "btn small danger", onclick: () => deleteLog(l.id) }, "削除")),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

/* ========== 成長ギャラリー ========== */

async function renderGallery(main) {
  const token = navToken;
  main.append(h("h1", {}, "🖼️ 成長ギャラリー"));
  const status = h("p", { class: "muted" }, "読み込み中…");
  main.append(status);

  const entries = [];
  const logs = loadLogs()
    .filter((l) => l.image)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const log of logs) {
    const blob = await imgGet(log.image).catch(() => null);
    if (token !== navToken) return;
    if (blob) entries.push({ log, url: trackUrl(URL.createObjectURL(blob)) });
  }
  status.remove();

  if (!entries.length) {
    main.append(h("p", { class: "muted" }, "画像付きの練習記録がありません。「練習ログ」で作品画像を登録しましょう。"));
    return;
  }

  const label = (e) => `${e.log.date} ${e.log.title}`;
  const makeSelect = (selected) => h("select", {}, entries.map((e, i) => h("option", { value: i, selected: i === selected }, label(e))));
  const beforeSel = makeSelect(0);
  const afterSel = makeSelect(entries.length - 1);
  const beforeImg = h("img", { alt: "比較元" });
  const afterImg = h("img", { alt: "比較先" });
  const daysText = h("p", { class: "muted small" });
  const updateCompare = () => {
    const b = entries[toInt(beforeSel.value, 0)];
    const a = entries[toInt(afterSel.value, 0)];
    beforeImg.src = b.url;
    afterImg.src = a.url;
    daysText.textContent = `${Math.abs(diffDays(b.log.date, a.log.date))}日間の変化です。`;
  };
  beforeSel.addEventListener("change", updateCompare);
  afterSel.addEventListener("change", updateCompare);
  updateCompare();

  const filterInputs = CATEGORIES.map((c) => h("input", { type: "checkbox", value: c }));
  const grid = h("div", { class: "gallery" });
  const renderList = () => {
    const selected = filterInputs.filter((i) => i.checked).map((i) => i.value);
    const shown = entries
      .slice()
      .reverse()
      .filter((e) => !selected.length || (e.log.categories || []).some((c) => selected.includes(c)));
    grid.replaceChildren(
      ...shown.map((e) => figure(h("img", { src: e.url, alt: e.log.title, loading: "lazy" }), `${label(e)} ／ ${"★".repeat(e.log.rating)}`)),
    );
    if (!shown.length) grid.append(h("p", { class: "muted" }, "該当する作品がありません。"));
  };
  filterInputs.forEach((i) => i.addEventListener("change", renderList));
  renderList();

  main.append(
    card(
      h("h2", {}, "ビフォー・アフター比較"),
      h(
        "div",
        { class: "grid2" },
        h("div", {}, labeled("比較元", beforeSel), h("div", { style: "margin-top:8px" }, figure(beforeImg))),
        h("div", {}, labeled("比較先", afterSel), h("div", { style: "margin-top:8px" }, figure(afterImg))),
      ),
      daysText,
    ),
    card(
      h("h2", {}, "作品一覧"),
      h("div", { class: "chips", style: "margin-bottom:12px" }, filterInputs.map((i) => h("label", { class: "chip" }, i, i.value))),
      grid,
    ),
  );
}

/* ========== ロードマップ ========== */

function renderRoadmap(main) {
  const state = loadRoadmap();
  const total = sumBy(Object.values(ROADMAP), (t) => t.length);
  const overall = progress(0, "");
  const doneMsg = h("div", { class: "notice success" }, "🎉 全ステップ達成です！ここからは描きたいものをどんどん描いていきましょう。");
  const updaters = [];

  main.append(h("h1", {}, "🗺️ 練習ロードマップ"), card(h("h2", {}, "全体の達成率"), overall), doneMsg);

  for (const [stage, tasks] of Object.entries(ROADMAP)) {
    const countSpan = h("span", { class: "muted" });
    const bar = progress(0, "");
    const list = h("div", { class: "task-list" });
    for (const task of tasks) {
      const key = `${stage}::${task}`;
      const cf = checkField(task, !!state[key]);
      cf.input.addEventListener("change", () => {
        if (cf.input.checked) state[key] = true;
        else delete state[key];
        saveJSON(KEYS.roadmap, state);
        refresh();
      });
      list.append(cf.el);
    }
    updaters.push(() => {
      const done = tasks.filter((t) => state[`${stage}::${t}`]).length;
      countSpan.textContent = `（${done}/${tasks.length}）`;
      bar.set(done / tasks.length, "");
      return done;
    });
    main.append(h("details", { class: "card stage", open: tasks.some((t) => !state[`${stage}::${t}`]) }, h("summary", {}, stage, " ", countSpan), bar, list));
  }

  function refresh() {
    const done = updaters.reduce((s, u) => s + u(), 0);
    overall.set(done / total, `${done} / ${total} 項目（${Math.round((done / total) * 100)}%）`);
    doneMsg.hidden = done !== total;
  }
  refresh();
}

/* ========== セルフチェック ========== */

function renderSelfCheck(main) {
  const imgBox = h("div", { class: "grid2" });
  const bar = progress(0, "");
  const tips = h("div", {});
  const checks = SELF_CHECK.map(([item, tip]) => ({ item, tip, cf: checkField(item) }));
  const update = () => {
    const score = checks.filter((c) => c.cf.input.checked).length;
    bar.set(score / checks.length, `${score} / ${checks.length} 項目クリア`);
  };
  checks.forEach((c) => c.cf.input.addEventListener("change", update));
  update();

  main.append(
    h("h1", {}, "✅ セルフチェック"),
    card(
      h("p", { class: "muted" }, "描き終えた絵を見直すときに使います。絵を選ぶと、反転＋グレースケールで並べて表示します（任意）。"),
      fileInput(async (file) => {
        const c = await fileToCanvas(file, 1200);
        const flipped = cloneCanvas(c, true);
        imgBox.replaceChildren(figure(c, "元の絵"), figure(grayToCanvas(grayArray(flipped), c.width, c.height), "反転＋グレースケール"));
      }),
      imgBox,
    ),
    card(
      checks.map((c) => c.cf.el),
      bar,
      h(
        "button",
        {
          class: "btn primary",
          style: "margin:12px 0",
          onclick: () => {
            const weak = checks.filter((c) => !c.cf.input.checked);
            if (!weak.length) {
              tips.replaceChildren(h("div", { class: "notice success" }, "すべてクリアしています。次はより難しいお題に挑戦してみましょう。"));
            } else {
              tips.replaceChildren(...weak.map((c) => h("div", { class: "notice warning" }, `${c.item}\n${c.tip}`)));
            }
          },
        },
        "改善ポイントを表示",
      ),
      tips,
    ),
  );
}

/* ========== データ管理 ========== */

async function buildBackup() {
  const images = {};
  for (const key of await imgKeys()) {
    const blob = await imgGet(key);
    if (blob) images[key] = await blobToDataUrl(blob);
  }
  return {
    app: "illust-lab",
    version: 1,
    exportedAt: new Date().toISOString(),
    logs: loadLogs(),
    roadmap: loadRoadmap(),
    settings: loadSettings(),
    images,
  };
}

function sanitizeLog(l) {
  if (!l || typeof l !== "object") return null;
  if (typeof l.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(l.date)) return null;
  const minutes = toInt(l.minutes, 0);
  if (minutes < 1) return null;
  return {
    id: typeof l.id === "string" && l.id ? l.id : uid(),
    date: l.date,
    minutes: Math.min(minutes, 1440),
    title: typeof l.title === "string" && l.title ? l.title.slice(0, 100) : "無題",
    categories: Array.isArray(l.categories) ? l.categories.filter((c) => CATEGORIES.includes(c)) : [],
    rating: clamp(toInt(l.rating, 3), 1, 5),
    memo: typeof l.memo === "string" ? l.memo : "",
    image: typeof l.image === "string" && l.image ? l.image : null,
  };
}

async function restoreBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSONとして読み込めません。");
  }
  if (!data || data.app !== "illust-lab") throw new Error("イラスト練習ラボのバックアップファイルではありません。");

  const logs = (Array.isArray(data.logs) ? data.logs : []).map(sanitizeLog).filter(Boolean);
  const images = new Map();
  if (data.images && typeof data.images === "object") {
    for (const [k, v] of Object.entries(data.images)) {
      if (typeof v === "string" && v.startsWith("data:image/")) images.set(k, dataUrlToBlob(v));
    }
  }
  for (const l of logs) if (l.image && !images.has(l.image)) l.image = null;

  const roadmap = {};
  if (data.roadmap && typeof data.roadmap === "object") {
    for (const [k, v] of Object.entries(data.roadmap)) if (v === true) roadmap[k] = true;
  }
  const weeklyGoal = clamp(toInt(data.settings && data.settings.weeklyGoal, 300), 10, 10000);

  await imgClear();
  for (const [k, blob] of images) await imgPut(k, blob);
  saveLogs(logs);
  saveJSON(KEYS.roadmap, roadmap);
  saveJSON(KEYS.settings, { weeklyGoal });
  return { logs: logs.length, images: images.size };
}

async function renderData(main) {
  const token = navToken;
  const logs = loadLogs();
  const usage = h("p", { class: "muted small" });
  const persistBox = h("div", {});

  const backupBtn = h("button", { class: "btn primary" }, "バックアップをダウンロード");
  backupBtn.addEventListener("click", async () => {
    backupBtn.disabled = true;
    try {
      const data = await buildBackup();
      downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `illust_lab_backup_${todayStr()}.json`);
    } catch (e) {
      notify(`バックアップに失敗しました: ${e.message}`, "error");
    } finally {
      backupBtn.disabled = false;
    }
  });

  const restoreInput = h("input", { type: "file", accept: ".json,application/json" });
  const restoreBtn = h("button", { class: "btn" }, "このファイルから復元する");
  restoreBtn.addEventListener("click", async () => {
    const file = restoreInput.files[0];
    if (!file) {
      notify("バックアップファイルを選択してください", "error");
      return;
    }
    if (!confirm("現在のデータはすべてバックアップの内容に置き換わります。よろしいですか？")) return;
    restoreBtn.disabled = true;
    try {
      const r = await restoreBackup(await file.text());
      notify(`復元しました（記録 ${r.logs} 件・画像 ${r.images} 枚）`, "success");
      navigate();
    } catch (e) {
      notify(`復元できませんでした: ${e.message}`, "error");
      restoreBtn.disabled = false;
    }
  });

  const confirmCb = checkField("すべての記録・画像・進捗を削除することを理解しました");
  const deleteBtn = h("button", { class: "btn danger", disabled: true }, "全データを削除");
  confirmCb.input.addEventListener("change", () => {
    deleteBtn.disabled = !confirmCb.input.checked;
  });
  deleteBtn.addEventListener("click", async () => {
    try {
      await imgClear();
      Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
      notify("すべてのデータを削除しました");
      navigate();
    } catch (e) {
      notify(`削除できませんでした: ${e.message}`, "error");
    }
  });

  main.append(
    h("h1", {}, "💾 データ管理"),
    h(
      "div",
      { class: "notice" },
      "データはこのブラウザ内（localStorageとIndexedDB）に保存されています。ブラウザのサイトデータを削除すると消えるため、定期的にバックアップしてください。別の端末やブラウザにデータを移すときも、バックアップと復元を使います。",
    ),
    card(h("h2", {}, "保存状況"), h("p", {}, `練習記録: ${logs.length} 件 ／ 作品画像: ${logs.filter((l) => l.image).length} 枚`), usage, persistBox),
    card(h("h2", {}, "バックアップ"), h("p", { class: "muted small" }, "記録・画像・進捗をまとめて1つのJSONファイルに保存します。"), backupBtn),
    card(
      h("h2", {}, "復元"),
      h("div", { class: "notice warning" }, "復元すると、現在のデータはすべてバックアップの内容に置き換わります。"),
      h("div", { class: "row", style: "align-items:center" }, restoreInput, restoreBtn),
    ),
    card(h("h2", {}, "全データの削除"), confirmCb.el, h("div", { style: "margin-top:8px" }, deleteBtn)),
  );

  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    if (token !== navToken) return;
    usage.textContent = `使用容量の目安: 約 ${((est.usage || 0) / 1024 / 1024).toFixed(1)} MB`;
  }
  if (navigator.storage && navigator.storage.persisted && navigator.storage.persist) {
    const persisted = await navigator.storage.persisted();
    if (token !== navToken) return;
    if (persisted) {
      persistBox.append(h("p", { class: "small" }, "✅ 保存データは保護されています（ブラウザが容量不足でも自動削除されにくい状態です）。"));
    } else {
      const btn = h("button", { class: "btn small" }, "保存データを保護する");
      btn.addEventListener("click", async () => {
        const ok = await navigator.storage.persist();
        notify(ok ? "保存データを保護しました" : "ブラウザに保護を許可されませんでした", ok ? "success" : "error");
        if (ok) navigate();
      });
      persistBox.append(h("p", { class: "muted small" }, "ブラウザは容量不足のとき、保護されていないデータを自動で削除することがあります。"), btn);
    }
  }
}

/* ========== 起動 ========== */

const PAGES = [
  { id: "dashboard", label: "🏠 ダッシュボード", render: renderDashboard },
  { id: "prompt", label: "🎲 お題ガチャ", render: renderPrompt },
  { id: "timer", label: "⏱️ クロッキータイマー", render: renderTimer },
  { id: "analysis", label: "🔍 画像分析ツール", render: renderAnalysis },
  { id: "log", label: "📝 練習ログ", render: renderLog },
  { id: "gallery", label: "🖼️ 成長ギャラリー", render: renderGallery },
  { id: "roadmap", label: "🗺️ ロードマップ", render: renderRoadmap },
  { id: "selfcheck", label: "✅ セルフチェック", render: renderSelfCheck },
  { id: "data", label: "💾 データ管理", render: renderData },
];

function navigate() {
  const id = location.hash.slice(1);
  const page = PAGES.find((p) => p.id === id) || PAGES[0];
  runCleanup();
  navToken++;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page.id));
  const main = document.getElementById("main");
  main.replaceChildren();
  Promise.resolve(page.render(main)).catch((e) => {
    console.error(e);
    notify(`エラーが発生しました: ${e.message}`, "error");
  });
  updateSidebarStreak();
  window.scrollTo(0, 0);
}

document.getElementById("nav").append(...PAGES.map((p) => h("a", { href: `#${p.id}`, "data-page": p.id }, p.label)));
window.addEventListener("hashchange", navigate);
navigate();