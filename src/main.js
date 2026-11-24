/* 圣诞照片树 —— 密集粒子树引擎 + 星空雪夜 + 交互 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const people = Array.isArray(window.PEOPLE) ? window.PEOPLE.filter(p => p && p.img) : [];

  /* ---------- DOM ---------- */
  const stage = document.getElementById("stage");
  const treeEl = document.getElementById("tree");
  const starTop = document.getElementById("star-top");
  const hint = document.getElementById("hint");
  const count = document.getElementById("count");

  count.innerHTML = `这棵树上挂着 <b>${people.length}</b> 位重要的人`;

  function fallbackAvatar(name) {
    const ch = (name || "?").trim().slice(0, 1);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">` +
      `<rect width="200" height="200" fill="#3a3f5c"/>` +
      `<text x="100" y="118" font-size="72" text-anchor="middle" fill="#f2e3c0" ` +
      `font-family="serif">${ch}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- 照片卡片（挂在树上的拍立得） ---------- */
  const items = people.map((data, k) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "person";
    btn.style.setProperty("--tilt", ((k % 2 ? 1 : -1) * (2 + (k * 37 % 5))) + "deg");
    btn.setAttribute("aria-label", `查看 ${data.name || "Ta"} 的照片`);
    btn.innerHTML = `<span class="card"><img src="${data.img}" alt="" loading="lazy" draggable="false"></span>` +
      (data.name ? `<span class="tag" aria-hidden="true"></span>` : "");
    if (data.name) btn.querySelector(".tag").textContent = data.name;
    btn.querySelector("img").addEventListener("error", (e) => {
      e.target.src = fallbackAvatar(data.name || "?");
    }, { once: true });
    treeEl.appendChild(btn);
    return btn;
  });

  // 每张照片在树上的位置：沿锥面排布（略微嵌入树体）
  const N = Math.max(items.length, 1);
  const slots = people.map((_, k) => ({
    y: N === 1 ? 0.5 : 0.10 + 0.78 * (k / (N - 1)),   // 0 下 → 1 上
    ang: k * 2.399963,                                 // 黄金角，四周均匀
    ph: Math.random() * Math.PI * 2,                   // 浮动相位
  }));

  /* ---------- 状态 ---------- */
  let rotY = 0, velY = 0, velX = 0;
  let tiltBase = -0.10, tilt = tiltBase;
  let autoSpin = !reduceMotion;
  let zoom = 1;
  let spreadTarget = 0, spread = 0;                    // 绽放程度 0..1
  let dragging = false, moved = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let W = 0, H = 0, cx = 0, cy = 0, treeH = 0, maxR = 0, itemSize = 84;
  let ox = 0, oy = 0;                                  // 舞台在视口中的偏移（画布铺满整个窗口）

  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    const T = Math.min(W, H);
    treeH = T * 0.60 * zoom;
    maxR = treeH * 0.34;
    cy = H / 2 + T * 0.02;
    cx = W / 2;
    itemSize = Math.max(50, Math.min(96, T * 0.105));
    treeEl.style.setProperty("--psize", itemSize + "px");
  }
  window.addEventListener("resize", measure);

  /* ---------- 画布：星星 + 雪 + 粒子树 ---------- */
  const canvas = document.getElementById("bg");
  const ctx = canvas.getContext("2d");
  let stars = [], flakes = [];

  function buildSky() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round(innerWidth * innerHeight / 6000) }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.85,
      r: 0.4 + Math.random() * 1.2, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random(),
      warm: Math.random() < 0.3,
    }));
    flakes = Array.from({ length: Math.round(Math.min(150, innerWidth / 9)) }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: 0.8 + Math.random() * 1.8, vy: 0.25 + Math.random() * 0.6,
      ph: Math.random() * Math.PI * 2, sway: 0.3 + Math.random() * 0.7,
    }));
  }
  window.addEventListener("resize", buildSky);

  /* ---------- 发光粒子精灵（离屏预渲染） ---------- */
  function makeSprite(r, g, b, soft) {
    const s = 64, c = document.createElement("canvas");
    c.width = c.height = s;
    const x = c.getContext("2d");
    const grad = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (soft) {
      grad.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
      grad.addColorStop(0.35, `rgba(${r},${g},${b},0.32)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    } else {
      grad.addColorStop(0, `rgba(255,255,255,0.95)`);
      grad.addColorStop(0.25, `rgba(${r},${g},${b},0.9)`);
      grad.addColorStop(0.6, `rgba(${r},${g},${b},0.35)`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    }
    x.fillStyle = grad;
    x.fillRect(0, 0, s, s);
    return c;
  }
  const SP = {
    gold: makeSprite(255, 208, 118, false),
    goldSoft: makeSprite(255, 196, 96, true),
    amber: makeSprite(255, 160, 60, false),
    red: makeSprite(255, 92, 92, true),
    white: makeSprite(255, 246, 226, false),
  };

  /* ---------- 粒子树：密集锥体 + 螺旋灯带 + 外围光尘 ---------- */
  const TURNS = 5;
  const treePts = [];
  (function buildTree() {
    // ① 锥体填充（主体，密）
    for (let i = 0; i < 3200; i++) {
      const y = Math.random();
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());             // 体积内均匀
      const c = Math.random();
      treePts.push({
        y, ang, rr, glow: Math.random() < 0.12,
        sp: c < 0.66 ? SP.gold : c < 0.78 ? SP.amber : c < 0.88 ? SP.white : c < 0.95 ? SP.red : SP.goldSoft,
        size: 3 + Math.random() * 5,
        tw: Math.random() * Math.PI * 2, tws: 0.5 + Math.random() * 1.6,
        sx: 0, sy: 0, sz: 0,
      });
    }
    // ② 螺旋灯带（亮色描边）
    for (let i = 0; i < 900; i++) {
      const y = Math.random();
      const ang = y * TURNS * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      treePts.push({
        y, ang, rr: 0.98 + Math.random() * 0.10, glow: Math.random() < 0.35,
        sp: Math.random() < 0.7 ? SP.goldSoft : SP.white,
        size: 3.5 + Math.random() * 5,
        tw: Math.random() * Math.PI * 2, tws: 0.8 + Math.random() * 2,
        sx: 0, sy: 0, sz: 0,
      });
    }
    // ③ 外围光尘（散落树周围的微光）
    for (let i = 0; i < 260; i++) {
      const y = Math.random();
      const ang = Math.random() * Math.PI * 2;
      treePts.push({
        y, ang, rr: 1.08 + Math.random() * 0.5, glow: true,
        sp: Math.random() < 0.6 ? SP.goldSoft : SP.white,
        size: 4 + Math.random() * 8,
        tw: Math.random() * Math.PI * 2, tws: 0.3 + Math.random(),
        sx: 0, sy: 0, sz: 0,
      });
    }
    // 每个粒子的「绽放」目标位置：以树心为中心的大球
    for (const p of treePts) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const R = Math.cbrt(Math.random());              // 球体内均匀（相对单位）
      p.sx = R * Math.sin(ph) * Math.cos(th);
      p.sy = R * Math.cos(ph);
      p.sz = R * Math.sin(ph) * Math.sin(th);
    }
  })();

  function coneR(y) { return (1 - y) * maxR; }

  /* 统一投影：绕竖轴 rotY（并入角度）+ 绕横轴 tilt */
  function project(x, wy, z) {
    const sinT = Math.sin(tilt), cosT = Math.cos(tilt);
    const y2 = wy * cosT - z * sinT;
    const z2 = wy * sinT + z * cosT;
    return { sx: ox + cx + x, sy: oy + cy - y2, depth: Math.max(0, Math.min(1, z2 / (maxR * 1.3) / 2 + 0.5)) };
  }

  function draw(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // 星星
    for (const st of stars) {
      const a = reduceMotion ? 0.7 : 0.35 + 0.35 * Math.sin(st.p + t / 900 * st.s);
      ctx.globalAlpha = Math.max(0.06, a);
      ctx.fillStyle = st.warm ? "#f4dfae" : "#dfe6ff";
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
    }

    // 树下光晕
    const glowY = oy + cy + treeH * 0.52;
    const g = ctx.createRadialGradient(ox + cx, glowY, 0, ox + cx, glowY, maxR * 1.8);
    g.addColorStop(0, "rgba(255,205,120,0.18)");
    g.addColorStop(1, "rgba(255,205,120,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(ox + cx, glowY, maxR * 1.8, maxR * 0.5, 0, 0, Math.PI * 2); ctx.fill();

    // 粒子树（发光叠加，绽放时插值到球状散布）
    ctx.globalCompositeOperation = "lighter";
    const scatterR = treeH * 0.62;
    const sAng = rotY * 0.25;                          // 散开时也缓慢流转
    const sCos = Math.cos(sAng), sSin = Math.sin(sAng);
    for (const p of treePts) {
      // 树上位置
      const ang = p.ang + rotY;
      const r = coneR(p.y) * p.rr;
      const tx = Math.cos(ang) * r;
      const tz = Math.sin(ang) * r;
      const ty = (p.y - 0.5) * treeH;
      let x = tx, wy = ty, z = tz;
      if (spread > 0.001) {
        // 散开位置
        const bx = p.sx * scatterR, by = p.sy * scatterR, bz = p.sz * scatterR;
        const rx = bx * sCos - bz * sSin;
        const rz = bx * sSin + bz * sCos;
        x = tx + (rx - tx) * spread;
        wy = ty + (by - ty) * spread;
        z = tz + (rz - tz) * spread;
      }
      const pr = project(x, wy, z);
      const tw = reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(p.tw + t / 700 * p.tws));
      const a = tw * (0.3 + pr.depth * 0.7) * (p.glow ? 0.55 : 1);
      const s = p.size * (0.55 + pr.depth * 0.65) * (p.glow ? 2.2 : 1);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(p.sp, pr.sx - s / 2, pr.sy - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 雪
    for (const f of flakes) {
      if (!reduceMotion) {
        f.y += f.vy; f.ph += 0.01 * f.sway;
        if (f.y > innerHeight + 4) { f.y = -4; f.x = Math.random() * innerWidth; }
      }
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f.ph * 3);
      ctx.fillStyle = "#eef3ff";
      ctx.beginPath(); ctx.arc(f.x + Math.sin(f.ph) * 14, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 渲染 ---------- */
  function render(t) {
    const rect = stage.getBoundingClientRect();
    ox = rect.left; oy = rect.top;                     // 画布是全窗口的，树要对齐舞台
    draw(t);

    // 树顶星星（DOM，用舞台内坐标；绽放时淡出）
    const sp = project(0, treeH * 0.5 + 12, 0);
    starTop.style.transform = `translate3d(${(sp.sx - ox).toFixed(1)}px, ${(sp.sy - oy).toFixed(1)}px, 0)`;
    starTop.style.zIndex = 300;
    starTop.style.opacity = String(1 - spread);

    // 照片卡片（DOM，舞台内坐标）
    for (let k = 0; k < items.length; k++) {
      const s = slots[k];
      const bob = reduceMotion ? 0 : Math.sin(t / 1500 + s.ph) * 3;
      const ang = s.ang + rotY;
      const r = coneR(s.y) * 0.88 + itemSize * 0.22;
      const spreadR = 1 + spread * 1.7;
      const x = Math.cos(ang) * r * spreadR;
      const z = Math.sin(ang) * r * spreadR;
      const wy = (s.y - 0.5) * treeH * (1 + spread * 0.5);
      const pr = project(x, wy, z);
      const scale = 0.62 + pr.depth * 0.55;
      const el = items[k];
      el.style.transform =
        `translate3d(${(pr.sx - ox).toFixed(1)}px, ${(pr.sy - oy + bob).toFixed(1)}px, 0) scale(${scale.toFixed(3)})`;
      el.style.opacity = (0.3 + pr.depth * 0.7).toFixed(3);
      el.style.zIndex = String(100 + Math.round(pr.depth * 100));
    }
  }

  function frame(t) {
    // 绽放进度缓动
    spread += (spreadTarget - spread) * 0.045;
    if (!dragging) {
      if (autoSpin) velY += ((spreadTarget > 0.5 ? 0.0016 : 0.0042) - velY) * 0.04;
      else { velY *= 0.95; velX *= 0.95; }
      rotY += velY;
      tilt = Math.max(-0.55, Math.min(0.4, tilt + velX));
      velX *= 0.9;
    }
    render(t);
    requestAnimationFrame(frame);
  }

  measure();
  buildSky();
  requestAnimationFrame(frame);

  /* ---------- 拖拽 / 缩放 ---------- */
  stage.addEventListener("pointerdown", (e) => {
    dragging = true; moved = 0;
    lastX = e.clientX; lastY = e.clientY; lastT = performance.now();
    velY = 0; velX = 0;
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    const now = performance.now();
    const dt = Math.max(now - lastT, 1);
    moved += Math.abs(dx) + Math.abs(dy);
    rotY += dx * 0.005;
    tilt = Math.max(-0.55, Math.min(0.4, tilt + dy * 0.002));
    velY = (dx * 0.005) / (dt / 16);
    velX = (dy * 0.002) / (dt / 16);
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    if (moved > 8) hint.classList.add("gone");
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("dragging");
    if (e.pointerId != null && stage.hasPointerCapture && stage.hasPointerCapture(e.pointerId)) {
      stage.releasePointerCapture(e.pointerId);
    }
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoom = Math.max(0.72, Math.min(1.45, zoom - Math.sign(e.deltaY) * 0.08));
    measure();
  }, { passive: false });

  /* ---------- 灯箱 ---------- */
  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbName = document.getElementById("lb-name");
  const lbNote = document.getElementById("lb-note");
  let lastFocus = null;

  items.forEach((el, i) => {
    el.addEventListener("click", () => {
      if (moved > 8) return;
      const person = people[i];
      lastFocus = el;
      lbImg.src = person.img;
      lbImg.alt = person.name ? `${person.name}的照片` : "照片";
      lbImg.onerror = () => { lbImg.src = fallbackAvatar(person.name || "?"); };
      lbName.textContent = person.name || "";
      lbNote.textContent = person.note || "";
      lightbox.hidden = false;
      lightbox.querySelector(".close").focus();
    });
  });

  function bindOverlay(root) {
    const close = () => {
      root.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    root.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) close(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  }
  bindOverlay(lightbox);

  /* ---------- 说明 ---------- */
  const help = document.getElementById("help");
  bindOverlay(help);
  document.getElementById("btn-help").addEventListener("click", () => {
    lastFocus = document.activeElement;
    help.hidden = false;
    help.querySelector(".close").focus();
  });

  /* ---------- 自动旋转开关 ---------- */
  const btnRotate = document.getElementById("btn-rotate");
  btnRotate.setAttribute("aria-pressed", String(autoSpin));
  btnRotate.addEventListener("click", () => {
    autoSpin = !autoSpin;
    btnRotate.setAttribute("aria-pressed", String(autoSpin));
    if (!autoSpin) { velY = 0; velX = 0; }
  });

  /* ---------- 音乐开关 ---------- */
  const bgm = document.getElementById("bgm");
  const btnMusic = document.getElementById("btn-music");
  btnMusic.addEventListener("click", async () => {
    if (bgm.paused) {
      try { await bgm.play(); btnMusic.setAttribute("aria-pressed", "true"); } catch (e) { /* 浏览器拦截时保持关闭状态 */ }
    } else {
      bgm.pause();
      btnMusic.setAttribute("aria-pressed", "false");
    }
  });

  /* ---------- 绽放 / 聚拢 ---------- */
  const btnSpread = document.getElementById("btn-spread");
  btnSpread.addEventListener("click", () => {
    spreadTarget = spreadTarget > 0.5 ? 0 : 1;
    const on = spreadTarget > 0.5;
    btnSpread.setAttribute("aria-pressed", String(on));
    btnSpread.lastChild.textContent = on ? "聚拢" : "绽放";
  });
})();
