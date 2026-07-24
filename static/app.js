const TOKEN_KEY = "healthlog_token";

let currentStaff = null;
let currentPatient = null;

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  currentStaff = null;
  currentPatient = null;
  delete document.documentElement.dataset.role;
}

const ROLE_LABEL = { admin: "원장", doctor: "의사", nurse: "간호사" };

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("is-active"));
  document.getElementById("view-" + name).classList.add("is-active");
}

function showSubview(name) {
  document.querySelectorAll(".subview").forEach((s) => s.classList.remove("is-active"));
  document.getElementById("sub-" + name).classList.add("is-active");
  document.querySelectorAll(".nav-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.view === name);
  });
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

/* ---------------- 로그인 ---------------- */

const authForm = document.getElementById("auth-form");
const authMsg = document.getElementById("auth-msg");
const authSubmit = document.getElementById("auth-submit");

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(authMsg);

  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;

  authSubmit.disabled = true;

  try {
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
    setToken(data.access_token);
    await enterApp();
  } catch (err) {
    showMsg(authMsg, err.message, "error");
  } finally {
    authSubmit.disabled = false;
  }
});

document.getElementById("logout-btn").addEventListener("click", () => {
  clearSession();
  showScreen("auth");
});

/* ---------------- 앱 진입 / 내비게이션 ---------------- */

const navStaffTab = document.getElementById("nav-staff-tab");

document.getElementById("nav-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".nav-tab");
  if (!btn) return;
  const view = btn.dataset.view;
  showSubview(view);
  if (view === "patients") loadAllPatients();
  if (view === "staff") loadStaffList();
});

async function enterApp() {
  const res = await apiFetch("/me");
  currentStaff = await res.json();

  document.getElementById("current-name").textContent = currentStaff.name;

  document.querySelectorAll("#current-role-row .role-pip").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.rolePip === currentStaff.role);
  });

  document.documentElement.dataset.role = currentStaff.role;

  navStaffTab.hidden = currentStaff.role !== "admin";

  showScreen("app");
  showSubview("patients");
  await loadAllPatients();
}

/* ---------------- 환자 검색 / 등록 / 목록 ---------------- */

const patientSearchForm = document.getElementById("patient-search-form");
const patientSearchMsg = document.getElementById("patient-search-msg");
const patientRegisterPanel = document.getElementById("patient-register-panel");
const patientRegisterForm = document.getElementById("patient-register-form");
const patientRegisterMsg = document.getElementById("patient-register-msg");
const patientsTbody = document.getElementById("patients-tbody");
const patientsPagination = document.getElementById("patients-pagination");
const patientsPrevBtn = document.getElementById("patients-prev-btn");
const patientsNextBtn = document.getElementById("patients-next-btn");
const patientsPageLabel = document.getElementById("patients-page-label");

const PAGE_SIZE = 10;
let patientsPage = 1;

function renderPatientsTable(patients) {
  if (patients.length === 0) {
    patientsTbody.innerHTML = '<tr class="empty-row"><td colspan="5">환자가 없어요.</td></tr>';
    return;
  }

  patientsTbody.innerHTML = patients
    .map(
      (p) => `
        <tr class="row-click" data-id="${p.id}">
          <td>${p.name}</td>
          <td class="mono">${p.birth_date}</td>
          <td>${p.gender === "M" ? "남" : "여"}</td>
          <td class="mono">${p.phone}</td>
          <td class="actions-cell">
            <button class="icon-btn" data-open="${p.id}" title="차트 열기" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  patientsTbody.querySelectorAll("[data-id]").forEach((row) => {
    row.addEventListener("click", () => openPatientChart(row.dataset.id));
  });
}

async function loadAllPatients(page = 1) {
  patientsPage = page;
  const params = new URLSearchParams({ page, page_size: PAGE_SIZE });
  const res = await apiFetch("/patients?" + params.toString());
  const data = await res.json();
  renderPatientsTable(data.patients);

  const totalPages = Math.max(1, Math.ceil(data.count / data.page_size));
  patientsPageLabel.textContent = `${data.page} / ${totalPages} 페이지 (총 ${data.count}명)`;
  patientsPrevBtn.disabled = data.page <= 1;
  patientsNextBtn.disabled = data.page >= totalPages;
  patientsPagination.hidden = false;
}

patientsPrevBtn.addEventListener("click", () => {
  if (patientsPage > 1) loadAllPatients(patientsPage - 1);
});

patientsNextBtn.addEventListener("click", () => {
  loadAllPatients(patientsPage + 1);
});

patientSearchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(patientSearchMsg);
  patientRegisterPanel.hidden = true;

  const name = document.getElementById("ps-name").value.trim();
  const phone4 = document.getElementById("ps-phone4").value.trim();

  const params = new URLSearchParams({ name, phone_last4: phone4 });
  const res = await apiFetch("/patients/search?" + params.toString());
  const data = await res.json();

  if (data.count === 0) {
    showMsg(patientSearchMsg, "일치하는 환자가 없어요. 아래에서 신규 등록해주세요.", "error");
    document.getElementById("pr-name").value = name;
    patientRegisterPanel.hidden = false;
    renderPatientsTable([]);
    patientsPagination.hidden = true;
  } else {
    renderPatientsTable(data.patients);
    patientsPagination.hidden = true;
  }
});

patientRegisterForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(patientRegisterMsg);

  const payload = {
    name: document.getElementById("pr-name").value.trim(),
    phone: document.getElementById("pr-phone").value.trim(),
    birth_date: document.getElementById("pr-birth").value,
    gender: document.getElementById("pr-gender").value
  };

  try {
    const res = await apiFetch("/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.detail ? JSON.stringify(body.detail) : "환자 등록에 실패했어요.");
    }

    const patient = await res.json();
    patientRegisterPanel.hidden = true;
    patientRegisterForm.reset();
    await openPatientChart(patient.id);
  } catch (err) {
    showMsg(patientRegisterMsg, err.message, "error");
  }
});

/* ---------------- 환자 차트 ---------------- */

const chartBackBtn = document.getElementById("chart-back-btn");
const patientInfoBar = document.getElementById("patient-info-bar");
const chartStatRow = document.getElementById("chart-stat-row");
const chartRecordsTbody = document.getElementById("chart-records-tbody");
const chartTrendDelta = document.getElementById("chart-trend-delta");
const chartWrapWeight = document.getElementById("chart-wrap-weight");
const chartWrapBp = document.getElementById("chart-wrap-bp");
const chartRecordForm = document.getElementById("chart-record-form");
const chartRecordMsg = document.getElementById("chart-record-msg");
const chartTodayLabel = document.getElementById("chart-today-label");

chartBackBtn.addEventListener("click", () => {
  currentPatient = null;
  showSubview("patients");
  loadAllPatients();
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

function renderChartStatRow(latest) {
  if (!latest) {
    chartStatRow.innerHTML =
      '<div class="panel" style="grid-column: 1 / -1; padding: 20px; color: var(--ink-600);">' +
      "아직 진료 기록이 없어요. 왼쪽 폼에서 첫 기록을 남겨보세요." +
      "</div>";
    return;
  }

  const bmiSev = severity("bmi", latest.bmi_category);
  const bpSev = severity("bp", latest.bp_category);
  const sugarSev = severity("sugar", latest.sugar_category);

  chartStatRow.innerHTML = `
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

function renderChartRecordsTable(records) {
  if (records.length === 0) {
    chartRecordsTbody.innerHTML =
      '<tr class="empty-row"><td colspan="7">등록된 기록이 없어요.</td></tr>';
    return;
  }

  const sorted = [...records].sort((a, b) => (a.date < b.date ? 1 : -1));

  chartRecordsTbody.innerHTML = sorted
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

  chartRecordsTbody.querySelectorAll("[data-delete]").forEach((btn) => {
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
    chartWrapWeight.innerHTML = '<div class="chart-empty">기록이 쌓이면 체중 추이를 보여드릴게요.</div>';
    chartTrendDelta.textContent = "";
    return;
  }

  if (!document.getElementById("chart-trend-weight")) {
    chartWrapWeight.innerHTML = '<canvas id="chart-trend-weight" height="90"></canvas>';
  }

  const data = recent.map((r) => r.weight);

  if (data.length >= 2) {
    const diff = data[data.length - 1] - data[0];
    chartTrendDelta.textContent =
      (diff <= 0 ? "▾ " : "▴ ") + Math.abs(diff).toFixed(1) + "kg (구간 내 변화)";
    chartTrendDelta.className = "delta mono " + (diff <= 0 ? "down" : "up");
  } else {
    chartTrendDelta.textContent = "";
  }

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();

  renderLineChart(document.getElementById("chart-trend-weight"), [
    { data, color: accent, fill: true }
  ]);
}

function drawBpTrend(records) {
  const recent = [...records].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(-8);

  if (recent.length === 0) {
    chartWrapBp.innerHTML = '<div class="chart-empty">기록이 쌓이면 혈압 추이를 보여드릴게요.</div>';
    return;
  }

  if (!document.getElementById("chart-trend-bp")) {
    chartWrapBp.innerHTML = '<canvas id="chart-trend-bp" height="90"></canvas>';
  }

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();
  const muted = styles.getPropertyValue("--ink-400").trim();

  renderLineChart(document.getElementById("chart-trend-bp"), [
    { data: recent.map((r) => r.systolic), color: accent },
    { data: recent.map((r) => r.diastolic), color: muted, dashed: true }
  ]);
}

async function loadPatientChart() {
  const res = await apiFetch(`/patients/${currentPatient.id}/records`);
  const data = await res.json();
  const records = data.records;

  const latest = [...records].sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  renderChartStatRow(latest);
  renderChartRecordsTable(records);
  drawWeightTrend(records);
  drawBpTrend(records);
}

async function openPatientChart(patientId) {
  const res = await apiFetch(`/patients/${patientId}`);
  currentPatient = await res.json();

  patientInfoBar.innerHTML = `
    <div><strong>${currentPatient.name}</strong></div>
    <div><span>생년월일</span> ${currentPatient.birth_date}</div>
    <div><span>성별</span> ${currentPatient.gender === "M" ? "남" : "여"}</div>
    <div><span>전화번호</span> ${currentPatient.phone}</div>
  `;

  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("cf-date").value = today;
  chartTodayLabel.textContent = "오늘의 요약 · " + today;

  showSubview("chart");
  await loadPatientChart();
}

async function deleteRecord(id) {
  await apiFetch(`/patients/${currentPatient.id}/records/${id}`, { method: "DELETE" });
  await loadPatientChart();
}

chartRecordForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(chartRecordMsg);

  const payload = {
    date: document.getElementById("cf-date").value,
    weight: parseFloat(document.getElementById("cf-weight").value),
    height: parseFloat(document.getElementById("cf-height").value),
    systolic: parseInt(document.getElementById("cf-systolic").value, 10),
    diastolic: parseInt(document.getElementById("cf-diastolic").value, 10),
    blood_sugar: parseInt(document.getElementById("cf-sugar").value, 10),
    steps: parseInt(document.getElementById("cf-steps").value || "0", 10),
    sleep_hours: parseFloat(document.getElementById("cf-sleep").value || "0"),
    memo: document.getElementById("cf-memo").value
  };

  try {
    const res = await apiFetch(`/patients/${currentPatient.id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.detail ? JSON.stringify(body.detail) : "기록 저장에 실패했어요.");
    }

    document.getElementById("cf-memo").value = "";
    await loadPatientChart();
    showMsg(chartRecordMsg, "기록이 저장됐어요.", "success");
  } catch (err) {
    showMsg(chartRecordMsg, err.message, "error");
  }
});

/* ---------------- 직원 관리 (admin) ---------------- */

const staffCreateForm = document.getElementById("staff-create-form");
const staffCreateMsg = document.getElementById("staff-create-msg");
const staffTbody = document.getElementById("staff-tbody");

function renderStaffTable(staffList) {
  if (staffList.length === 0) {
    staffTbody.innerHTML = '<tr class="empty-row"><td colspan="4">등록된 직원이 없어요.</td></tr>';
    return;
  }

  staffTbody.innerHTML = staffList
    .map(
      (s) => `
        <tr data-id="${s.id}">
          <td>${s.name}</td>
          <td class="mono">${s.email}</td>
          <td><span class="role-pip role-${s.role}">${ROLE_LABEL[s.role] || s.role}</span></td>
          <td class="actions-cell">
            <button class="icon-btn" data-delete="${s.id}" title="삭제" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </td>
        </tr>
      `
    )
    .join("");

  staffTbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteStaff(btn.dataset.delete));
  });
}

async function loadStaffList() {
  const res = await apiFetch("/staff");
  const data = await res.json();
  renderStaffTable(data.staff);
}

async function deleteStaff(id) {
  await apiFetch(`/staff/${id}`, { method: "DELETE" });
  await loadStaffList();
}

staffCreateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(staffCreateMsg);

  const payload = {
    name: document.getElementById("sf-name").value.trim(),
    role: document.getElementById("sf-role").value,
    email: document.getElementById("sf-email").value.trim(),
    password: document.getElementById("sf-password").value
  };

  try {
    const res = await apiFetch("/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(body.detail ? JSON.stringify(body.detail) : "계정 발급에 실패했어요.");
    }

    staffCreateForm.reset();
    await loadStaffList();
    showMsg(staffCreateMsg, "계정이 발급됐어요.", "success");
  } catch (err) {
    showMsg(staffCreateMsg, err.message, "error");
  }
});

/* ---------------- 시작 ---------------- */

if (getToken()) {
  enterApp().catch(() => {
    clearSession();
    showScreen("auth");
  });
}
