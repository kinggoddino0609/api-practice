const TOKEN_KEY = "healthlog_token";
const EMAIL_KEY = "healthlog_email";

let authMode = "login";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, email) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
  document.getElementById("view-" + name).classList.add("is-active");
}

function showMsg(el, text, type) {
  el.textContent = text;
  el.className = "form-msg show " + type;
}

function hideMsg(el) {
  el.className = "form-msg";
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({}, options.headers || {});
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(path, Object.assign({}, options, { headers }));

  if (res.status === 401) {
    clearSession();
    showScreen("auth");
    throw new Error("로그인이 만료됐어요. 다시 로그인해주세요.");
  }

  return res;
}

/* ---------------- 인증 화면 ---------------- */

const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authSubmit = document.getElementById("auth-submit");
const authMsg = document.getElementById("auth-msg");
const authToggleText = document.getElementById("auth-toggle-text");
const authToggleLink = document.getElementById("auth-toggle-link");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");

function setAuthMode(mode) {
  authMode = mode;
  hideMsg(authMsg);

  if (mode === "login") {
    authTitle.textContent = "다시 오셨네요";
    authSub.textContent = "오늘의 기록을 남기러 로그인하세요";
    authSubmit.textContent = "로그인";
    authToggleText.textContent = "계정이 없으신가요?";
    authToggleLink.textContent = "회원가입";
  } else {
    authTitle.textContent = "계정 만들기";
    authSub.textContent = "건강 기록을 시작해보세요";
    authSubmit.textContent = "회원가입";
    authToggleText.textContent = "이미 계정이 있으신가요?";
    authToggleLink.textContent = "로그인";
  }
}

authToggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  setAuthMode(authMode === "login" ? "signup" : "login");
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(authMsg);

  const email = authEmail.value.trim();
  const password = authPassword.value;

  authSubmit.disabled = true;

  try {
    if (authMode === "signup") {
      const res = await fetch("/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "회원가입에 실패했어요.");
      }

      setAuthMode("login");
      showMsg(authMsg, "가입 완료! 이제 로그인해주세요.", "success");
      authPassword.value = "";
    } else {
      const form = new URLSearchParams();
      form.set("username", email);
      form.set("password", password);

      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.detail || "로그인에 실패했어요.");
      }

      const data = await res.json();
      setSession(data.access_token, email);
      await enterDashboard();
    }
  } catch (err) {
    showMsg(authMsg, err.message, "error");
  } finally {
    authSubmit.disabled = false;
  }
});

/* ---------------- 대시보드 ---------------- */

const currentEmailEl = document.getElementById("current-email");
const logoutBtn = document.getElementById("logout-btn");
const statRow = document.getElementById("stat-row");
const recordsTbody = document.getElementById("records-tbody");
const trendDelta = document.getElementById("trend-delta");
const chartWrap = document.getElementById("chart-wrap");
const chartWrapBp = document.getElementById("chart-wrap-bp");
const recordForm = document.getElementById("record-form");
const recordMsg = document.getElementById("record-msg");
const todayLabel = document.getElementById("today-label");

logoutBtn.addEventListener("click", () => {
  clearSession();
  showScreen("auth");
  setAuthMode("login");
});

function severity(kind, category) {
  if (kind === "bmi") {
    if (category === "비만") return 2;
    if (category === "과체중" || category === "저체중") return 1;
    return 0;
  }
  if (kind === "bp") {
    if (category === "고혈압") return 2;
    if (category === "주의") return 1;
    return 0;
  }
  if (category === "당뇨 의심") return 2;
  if (category === "공복혈당장애") return 1;
  return 0;
}

function sevClass(sev) {
  return sev === 2 ? "crit" : sev === 1 ? "warn" : "good";
}

function worstOf(record) {
  const items = [
    { label: record.bp_category, sev: severity("bp", record.bp_category) },
    { label: record.sugar_category, sev: severity("sugar", record.sugar_category) },
    { label: record.bmi_category, sev: severity("bmi", record.bmi_category) }
  ];
  items.sort((a, b) => b.sev - a.sev);
  return items[0];
}

function renderStatRow(latest) {
  if (!latest) {
    statRow.innerHTML =
      '<div class="panel" style="grid-column: 1 / -1; padding: 20px; color: var(--ink-600);">' +
      "아직 기록이 없어요. 오른쪽 폼에서 첫 기록을 남겨보세요." +
      "</div>";
    return;
  }

  const bmiSev = severity("bmi", latest.bmi_category);
  const bpSev = severity("bp", latest.bp_category);
  const sugarSev = severity("sugar", latest.sugar_category);

  statRow.innerHTML = `
    <div class="stat-card">
      <div class="label">체중</div>
      <div class="value mono">${latest.weight.toFixed(1)}<span class="unit">kg</span></div>
      <span class="chip ${sevClass(bmiSev)}">${latest.bmi_category}</span>
    </div>
    <div class="stat-card">
      <div class="label">BMI</div>
      <div class="value mono">${latest.bmi.toFixed(1)}</div>
      <span class="chip ${sevClass(bmiSev)}">${latest.bmi_category}</span>
    </div>
    <div class="stat-card">
      <div class="label">혈압</div>
      <div class="value mono">${latest.systolic}<span class="unit">/ ${latest.diastolic}</span></div>
      <span class="chip ${sevClass(bpSev)}">${latest.bp_category}</span>
    </div>
    <div class="stat-card">
      <div class="label">공복혈당</div>
      <div class="value mono">${latest.blood_sugar}<span class="unit">mg/dL</span></div>
      <span class="chip ${sevClass(sugarSev)}">${latest.sugar_category}</span>
    </div>
  `;
}

function renderTable(records) {
  if (records.length === 0) {
    recordsTbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">등록된 기록이 없어요.</td></tr>';
    return;
  }

  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  recordsTbody.innerHTML = sorted
    .map((r) => {
      const worst = worstOf(r);
      const hasWarnings = r.warnings && r.warnings.length > 0;
      const warnIcon = hasWarnings
        ? `<span class="warn-icon" title="${r.warnings.join(" ")}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 3 1 21h22L12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>
          </span>`
        : "";

      return `
        <tr data-id="${r.id}">
          <td class="date-cell">${r.date}</td>
          <td class="num mono">${r.weight.toFixed(1)}</td>
          <td class="num mono">${r.bmi.toFixed(1)}</td>
          <td class="num mono">${r.systolic}/${r.diastolic}</td>
          <td class="num mono">${r.blood_sugar}</td>
          <td><span class="chip ${sevClass(worst.sev)}">${worst.label}</span> ${warnIcon}</td>
          <td class="actions-cell">
            <button class="icon-btn" data-delete="${r.id}" title="삭제" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  recordsTbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteRecord(btn.dataset.delete));
  });
}

function renderLineChart(canvas, seriesList) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const styles = getComputedStyle(document.documentElement);
  const gridLine = styles.getPropertyValue("--line").trim();
  const surface = styles.getPropertyValue("--surface").trim();

  const pad = { top: 12, right: 12, bottom: 8, left: 12 };
  const allValues = seriesList.flatMap((s) => s.data);
  const min = Math.min(...allValues) - 3;
  const max = Math.max(...allValues) + 3;

  ctx.strokeStyle = gridLine;
  ctx.lineWidth = 1;
  const rows = 2;
  for (let r = 0; r <= rows; r++) {
    const y = pad.top + ((h - pad.top - pad.bottom) / rows) * r;
    ctx.beginPath();
    ctx.moveTo(pad.left, y + 0.5);
    ctx.lineTo(w - pad.right, y + 0.5);
    ctx.stroke();
  }

  const xAt = (i, len) =>
    len === 1 ? w / 2 : pad.left + ((w - pad.left - pad.right) / (len - 1)) * i;
  const yAt = (v) => pad.top + (h - pad.top - pad.bottom) * (1 - (v - min) / (max - min));

  seriesList.forEach((s) => {
    const data = s.data;
    const len = data.length;

    if (s.fill && len >= 2) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
      grad.addColorStop(0, s.color + "33");
      grad.addColorStop(1, s.color + "00");
      ctx.beginPath();
      ctx.moveTo(xAt(0, len), yAt(data[0]));
      data.forEach((v, i) => ctx.lineTo(xAt(i, len), yAt(v)));
      ctx.lineTo(xAt(len - 1, len), h - pad.bottom);
      ctx.lineTo(xAt(0, len), h - pad.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (len >= 2) {
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = xAt(i, len);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      if (s.dashed) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    data.forEach((v, i) => {
      const x = xAt(i, len);
      const y = yAt(v);
      const isLast = i === len - 1;
      ctx.beginPath();
      ctx.arc(x, y, isLast ? 3.5 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = isLast ? s.color : surface;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.3;
      ctx.fill();
      ctx.stroke();
    });
  });
}

function drawWeightTrend(records) {
  const recent = [...records].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(-8);

  if (recent.length === 0) {
    chartWrap.innerHTML = '<div class="chart-empty">기록이 쌓이면 체중 추이를 보여드릴게요.</div>';
    trendDelta.textContent = "";
    return;
  }

  if (!document.getElementById("trend-weight")) {
    chartWrap.innerHTML = '<canvas id="trend-weight" height="90"></canvas>';
  }

  const data = recent.map((r) => r.weight);

  if (data.length >= 2) {
    const diff = data[data.length - 1] - data[0];
    trendDelta.textContent =
      (diff <= 0 ? "▾ " : "▴ ") + Math.abs(diff).toFixed(1) + "kg (구간 내 변화)";
    trendDelta.className = "delta mono " + (diff <= 0 ? "down" : "up");
  } else {
    trendDelta.textContent = "";
  }

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();

  renderLineChart(document.getElementById("trend-weight"), [
    { data, color: accent, fill: true }
  ]);
}

function drawBpTrend(records) {
  const recent = [...records].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(-8);

  if (recent.length === 0) {
    chartWrapBp.innerHTML = '<div class="chart-empty">기록이 쌓이면 혈압 추이를 보여드릴게요.</div>';
    return;
  }

  if (!document.getElementById("trend-bp")) {
    chartWrapBp.innerHTML = '<canvas id="trend-bp" height="90"></canvas>';
  }

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const muted = styles.getPropertyValue("--ink-400").trim();

  renderLineChart(document.getElementById("trend-bp"), [
    { data: recent.map((r) => r.systolic), color: accent },
    { data: recent.map((r) => r.diastolic), color: muted, dashed: true }
  ]);
}

async function loadDashboard() {
  const res = await apiFetch("/records");
  const data = await res.json();
  const records = data.records;

  const latest = [...records].sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  renderStatRow(latest);
  renderTable(records);
  drawWeightTrend(records);
  drawBpTrend(records);
}

async function deleteRecord(id) {
  await apiFetch("/records/" + id, { method: "DELETE" });
  await loadDashboard();
}

recordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(recordMsg);

  const payload = {
    date: document.getElementById("rf-date").value,
    weight: parseFloat(document.getElementById("rf-weight").value),
    height: parseFloat(document.getElementById("rf-height").value),
    systolic: parseInt(document.getElementById("rf-systolic").value, 10),
    diastolic: parseInt(document.getElementById("rf-diastolic").value, 10),
    blood_sugar: parseInt(document.getElementById("rf-sugar").value, 10),
    steps: parseInt(document.getElementById("rf-steps").value || "0", 10),
    sleep_hours: parseFloat(document.getElementById("rf-sleep").value || "0"),
    memo: document.getElementById("rf-memo").value
  };

  try {
    const res = await apiFetch("/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.detail ? JSON.stringify(body.detail) : "기록 저장에 실패했어요.");
    }

    document.getElementById("rf-memo").value = "";
    await loadDashboard();
    showMsg(recordMsg, "기록이 저장됐어요.", "success");
  } catch (err) {
    showMsg(recordMsg, err.message, "error");
  }
});

async function enterDashboard() {
  const email = localStorage.getItem(EMAIL_KEY) || "";
  currentEmailEl.textContent = email;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("rf-date").value = today;
  todayLabel.textContent = "오늘의 요약 · " + today;

  showScreen("dashboard");
  await loadDashboard();
}

/* ---------------- 시작 ---------------- */

if (getToken()) {
  enterDashboard().catch(() => {
    showScreen("auth");
    setAuthMode("login");
  });
} else {
  setAuthMode("login");
}
