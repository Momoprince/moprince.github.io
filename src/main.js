/* 生日照片蛋糕 —— 粒子蛋糕引擎 + 星空 + 交互 */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const people = Array.isArray(window.PEOPLE) ? window.PEOPLE.filter(p => p && p.img) : [];

  /* ---------- DOM ---------- */
  const stage = document.getElementById("stage");
  const treeEl = document.getElementById("tree");
  const hint = document.getElementById("hint");
  const count = document.getElementById("count");

  count.innerHTML = `这个生日，有 <b>${people.length}</b> 位重要的人陪你过`;

  function fallbackAvatar(name) {
    const ch = (name || "?").trim().slice(0, 1);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">` +
      `<rect width="200" height="200" fill="#3a3f5c"/>` +
      `<text x="100" y="118" font-size="72" text-anchor="middle" fill="#f2e3c0" ` +
      `font-family="serif">${ch}</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  /* ---------- 照片卡片（围着蛋糕的拍立得） ---------- */
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

  // 每张照片的位置：围着蛋糕一圈漂浮
  const N = Math.max(items.length, 1);
  const slots = people.map((_, k) => ({
    y: 0.12 + 0.68 * (k / N) + 0.3 / N,                // 均匀错开高度
    ang: k * 2.399963,                                  // 黄金角，四周均匀
    rr: 1.22 + 0.10 * Math.sin(k * 2.1),                // 略微远近不一
    ph: Math.random() * Math.PI * 2,                    // 浮动相位
  }));

  /* ---------- 状态 ---------- */
  let rotY = 0, velY = 0, velX = 0;
  let tilt = -0.10;
  let autoSpin = !reduceMotion;
  let zoom = 1;
  let spreadTarget = 0, spread = 0;                     // 绽放程度 0..1
  let dragging = false, moved = 0;
  let lastX = 0, lastY = 0, lastT = 0;
  let W = 0, H = 0, cx = 0, cy = 0, cakeH = 0, maxR = 0, itemSize = 84;
  let ox = 0, oy = 0;                                   // 舞台在视口中的偏移（画布铺满整个窗口）

  function measure() {
    W = stage.clientWidth; H = stage.clientHeight;
    const T = Math.min(W, H);
    cakeH = T * 0.62 * zoom;
    maxR = cakeH * 0.36;
    cy = H / 2 + T * 0.03;
    cx = W / 2;
    itemSize = Math.max(56, Math.min(110, T * 0.12));
    treeEl.style.setProperty("--psize", itemSize + "px");
  }
  window.addEventListener("resize", measure);

  /* ---------- 画布：星星 + 彩带 + 粒子蛋糕 ---------- */
  const canvas = document.getElementById("bg");
  const ctx = canvas.getContext("2d");
  let stars = [], flakes = [];

  const CONFETTI = ["#ffd98a", "#ff9fb0", "#a8e6cf", "#fdf0d5", "#c7b9ff"];

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
    flakes = Array.from({ length: Math.round(Math.min(140, innerWidth / 10)) }, () => ({
      x: Math.random() * innerWidth, y: Math.random() * innerHeight,
      r: 0.9 + Math.random() * 1.8, vy: 0.25 + Math.random() * 0.6,
      ph: Math.random() * Math.PI * 2, sway: 0.3 + Math.random() * 0.7,
      col: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
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
    cream: makeSprite(255, 238, 214, false),   // 奶油
    creamSoft: makeSprite(255, 232, 200, true),
    pink: makeSprite(255, 174, 196, false),    // 草莓粉
    pinkSoft: makeSprite(255, 160, 190, true),
    gold: makeSprite(255, 208, 118, false),    // 金色糖珠
    goldSoft: makeSprite(255, 196, 96, true),
    cherry: makeSprite(255, 92, 92, true),     // 樱桃
    white: makeSprite(255, 250, 240, false),
  };

  /* ---------- 粒子蛋糕：三层糕体 + 奶油裱花 + 蜡烛 ---------- */
  // y：0 蛋糕底 → 1 蜡烛火苗顶端（世界坐标 y 以 (y-0.46)*cakeH 垂直居中）
  const TIERS = [
    { y0: 0.00, y1: 0.30, r: 1.00 },   // 底层
    { y0: 0.32, y1: 0.52, r: 0.68 },   // 中层
    { y0: 0.54, y1: 0.70, r: 0.42 },   // 顶层
  ];
  const CANDLES = [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3];  // 三支蜡烛的角度
  const CANDLE_R = 0.16;               // 蜡烛离蛋糕轴心的半径（相对 maxR）
  const CANDLE_Y0 = 0.70, CANDLE_Y1 = 0.86, FLAME_Y = 0.90;

  const pts = [];
  function push(p) {
    // 每个粒子的「绽放」目标位置：以蛋糕为中心的大球
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    const R = Math.cbrt(Math.random());
    p.sx = R * Math.sin(ph) * Math.cos(th);
    p.sy = R * Math.cos(ph);
    p.sz = R * Math.sin(ph) * Math.sin(th);
    pts.push(p);
  }

  (function buildCake() {
    // ① 糕体填充
    const fills = [1500, 900, 550];
    TIERS.forEach((tier, ti) => {
      for (let i = 0; i < fills[ti]; i++) {
        const y = tier.y0 + Math.random() * (tier.y1 - tier.y0);
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random());            // 体积内均匀
        const c = Math.random();
        push({
          y, ang, rr: rr * tier.r, glow: Math.random() < 0.10,
          sp: c < 0.5 ? SP.cream : c < 0.72 ? SP.pink : c < 0.88 ? SP.gold : c < 0.96 ? SP.white : SP.cherry,
          size: 3 + Math.random() * 5,
          tw: Math.random() * Math.PI * 2, tws: 0.5 + Math.random() * 1.6,
        });
      }
      // ② 表面壳层：让每层轮廓更清晰
      for (let i = 0; i < 520; i++) {
        const y = tier.y0 + Math.random() * (tier.y1 - tier.y0);
        const c = Math.random();
        push({
          y, ang: Math.random() * Math.PI * 2,
          rr: tier.r * (0.96 + Math.random() * 0.045),
          glow: false,
          sp: c < 0.5 ? SP.cream : c < 0.75 ? SP.pink : c < 0.9 ? SP.gold : SP.white,
          size: 3 + Math.random() * 4,
          tw: Math.random() * Math.PI * 2, tws: 0.5 + Math.random() * 1.4,
        });
      }
      // ③ 奶油裱花：每层顶部的亮边 + 垂下来的奶油
      for (let i = 0; i < 380; i++) {
        const drip = Math.random() < 0.45;
        const y = drip
          ? tier.y1 - Math.random() * (tier.y1 - tier.y0) * 0.35   // 垂下的奶油
          : tier.y1 + (Math.random() - 0.5) * 0.006;               // 顶部亮边
        push({
          y, ang: Math.random() * Math.PI * 2,
          rr: tier.r * (drip ? 0.98 + Math.random() * 0.04 : 0.92 + Math.random() * 0.12),
          glow: Math.random() < 0.4,
          sp: Math.random() < 0.7 ? SP.creamSoft : SP.white,
          size: 3.5 + Math.random() * 4.5,
          tw: Math.random() * Math.PI * 2, tws: 0.6 + Math.random() * 1.6,
        });
      }
    });

    // ④ 三支蜡烛：柱体条纹 + 顶部火苗
    for (const ca of CANDLES) {
      for (let i = 0; i < 46; i++) {
        const y = CANDLE_Y0 + Math.random() * (CANDLE_Y1 - CANDLE_Y0);
        push({
          y, ang: ca + (Math.random() - 0.5) * 0.12,
          rr: CANDLE_R + (Math.random() - 0.5) * 0.03,
          glow: false,
          sp: Math.floor(y * 90) % 2 ? SP.pink : SP.white,          // 粉白条纹
          size: 3.2 + Math.random() * 2.4,
          tw: Math.random() * Math.PI * 2, tws: 0.8,
        });
      }
      // 火苗：一小簇摇曳的暖光
      for (let i = 0; i < 26; i++) {
        push({
          y: FLAME_Y + (Math.random() - 0.5) * 0.035,
          ang: ca + (Math.random() - 0.5) * 0.10,
          rr: CANDLE_R + (Math.random() - 0.5) * 0.03,
          glow: true, flame: true,
          sp: Math.random() < 0.6 ? SP.goldSoft : SP.creamSoft,
          size: 5 + Math.random() * 7,
          tw: Math.random() * Math.PI * 2, tws: 3 + Math.random() * 3,
        });
      }
    }

    // ⑤ 蛋糕周围的光尘
    for (let i = 0; i < 240; i++) {
      push({
        y: Math.random() * 0.9, ang: Math.random() * Math.PI * 2,
        rr: 1.1 + Math.random() * 0.5, glow: true,
        sp: Math.random() < 0.5 ? SP.goldSoft : SP.pinkSoft,
        size: 4 + Math.random() * 8,
        tw: Math.random() * Math.PI * 2, tws: 0.3 + Math.random(),
      });
    }
  })();

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

    // 蛋糕下的光晕（像托盘反光）
    const glowY = oy + cy + cakeH * 0.48;
    const g = ctx.createRadialGradient(ox + cx, glowY, 0, ox + cx, glowY, maxR * 1.8);
    g.addColorStop(0, "rgba(255,205,140,0.16)");
    g.addColorStop(1, "rgba(255,205,140,0)");
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(ox + cx, glowY, maxR * 1.8, maxR * 0.42, 0, 0, Math.PI * 2); ctx.fill();

    // 粒子蛋糕（发光叠加，绽放时插值到球状散布）
    ctx.globalCompositeOperation = "lighter";
    const scatterR = cakeH * 0.62;
    const sAng = rotY * 0.25;                           // 散开时也缓慢流转
    const sCos = Math.cos(sAng), sSin = Math.sin(sAng);
    for (const p of pts) {
      // 蛋糕上的位置
      const ang = p.ang + rotY;
      const r = maxR * p.rr;
      const tx = Math.cos(ang) * r;
      const tz = Math.sin(ang) * r;
      const ty = (p.y - 0.46) * cakeH;
      let x = tx, wy = ty, z = tz;
      if (spread > 0.001) {
        const bx = p.sx * scatterR, by = p.sy * scatterR, bz = p.sz * scatterR;
        const rx = bx * sCos - bz * sSin;
        const rz = bx * sSin + bz * sCos;
        x = tx + (rx - tx) * spread;
        wy = ty + (by - ty) * spread;
        z = tz + (rz - tz) * spread;
      }
      const pr = project(x, wy, z);
      // 火苗快速摇曳，其余粒子缓慢闪烁
      const tw = reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(p.tw + t / (p.flame ? 90 : 700) * p.tws));
      const a = tw * (0.3 + pr.depth * 0.7) * (p.glow ? 0.55 : 1);
      let s = p.size * (0.55 + pr.depth * 0.65) * (p.glow ? 2.2 : 1);
      if (p.flame && !reduceMotion) s *= 0.85 + 0.3 * Math.sin(t / 110 + p.tw);
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(p.sp, pr.sx - s / 2, pr.sy - s / 2, s, s);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 彩色纸屑飘落
    for (const f of flakes) {
      if (!reduceMotion) {
        f.y += f.vy; f.ph += 0.01 * f.sway;
        if (f.y > innerHeight + 4) { f.y = -4; f.x = Math.random() * innerWidth; }
      }
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(f.ph * 3);
      ctx.fillStyle = f.col;
      ctx.beginPath(); ctx.arc(f.x + Math.sin(f.ph) * 14, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 渲染 ---------- */
  function render(t) {
    const rect = stage.getBoundingClientRect();
    ox = rect.left; oy = rect.top;                      // 画布是全窗口的，蛋糕要对齐舞台
    draw(t);

    // 照片卡片（DOM，舞台内坐标）
    for (let k = 0; k < items.length; k++) {
      const s = slots[k];
      const bob = reduceMotion ? 0 : Math.sin(t / 1500 + s.ph) * 3;
      const ang = s.ang + rotY;
      const r = maxR * s.rr * (1 + spread * 1.7);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const wy = (s.y - 0.46) * cakeH * (1 + spread * 0.5);
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

  lightbox.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) {
      lightbox.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
  });
  lightbox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      lightbox.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
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
