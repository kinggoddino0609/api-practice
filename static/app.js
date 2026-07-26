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

function formatApiError(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && e.msg ? e.msg.replace(/^Value error,\s*/, "") : String(e)))
      .join("\n");
  }
  return fallback;
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
  if (view === "appointments") initAppointmentsTab();
  if (view === "stats") initStatsTab();
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
  document.getElementById("nav-stats-tab").hidden = currentStaff.role !== "admin";
  apptPanelTitle.textContent =
    currentStaff.role === "doctor" ? `${currentStaff.name}님의 예약 목록` : "전체 예약 목록";

  showScreen("app");

  if (currentStaff.role === "admin") {
    showSubview("staff");
    await loadStaffList();
  } else if (currentStaff.role === "doctor") {
    showSubview("appointments");
    await initAppointmentsTab();
  } else {
    showSubview("patients");
    await loadAllPatients();
  }
}

/* ---------------- 환자 검색 / 등록 / 목록 ---------------- */

const patientSearchForm = document.getElementById("patient-search-form");
const patientSearchMsg = document.getElementById("patient-search-msg");
const patientRegisterPanel = document.getElementById("patient-register-panel");
const patientRegisterForm = document.getElementById("patient-register-form");
const patientRegisterMsg = document.getElementById("patient-register-msg");
const openPatientRegisterBtn = document.getElementById("open-patient-register-btn");

openPatientRegisterBtn.addEventListener("click", () => {
  patientRegisterPanel.hidden = !patientRegisterPanel.hidden;
  if (!patientRegisterPanel.hidden) {
    document.getElementById("pr-name").focus();
  }
});
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
          <td><div class="actions-cell">
            <button class="icon-btn" data-open="${p.id}" title="차트 열기" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="m9 6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div></td>
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
      throw new Error(formatApiError(body.detail, "환자 등록에 실패했어요."));
    }

    const patient = await res.json();
    patientRegisterPanel.hidden = true;
    patientRegisterForm.reset();
    await openPatientChart(patient.id);
  } catch (err) {
    showMsg(patientRegisterMsg, err.message, "error");
  }
});

/* ---------------- 오늘 예약 ---------------- */

const apptDatePicker = document.getElementById("appt-date-picker");
const appointmentsTbody = document.getElementById("appointments-tbody");
const apptPanelTitle = document.getElementById("appt-panel-title");
const apptFilterPanel = document.getElementById("appt-filter-panel");
const apptDoctorCards = document.getElementById("appt-doctor-cards");
const apptCalendarPanel = document.getElementById("appt-calendar-panel");
const apptCalendarTitle = document.getElementById("appt-calendar-title");
const calGrid = document.getElementById("cal-grid");
const calPrevBtn = document.getElementById("cal-prev-btn");
const calNextBtn = document.getElementById("cal-next-btn");

let todayAppointments = [];
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;
let selectedDoctorId = null;
let doctorList = [];

function apptStatusClass(status) {
  if (status === "완료") return "done";
  if (status === "취소") return "cancelled";
  return "scheduled";
}

function apptStatusOptions(current) {
  return ["예정", "완료", "취소"]
    .map((s) => `<option value="${s}" ${s === current ? "selected" : ""}>${s}</option>`)
    .join("");
}

async function loadDoctorList(selectEl) {
  const res = await apiFetch("/doctors");
  const data = await res.json();
  selectEl.innerHTML = data.doctors
    .map((d) => `<option value="${d.id}">${d.name} (${ROLE_LABEL[d.role] || d.role})</option>`)
    .join("");
}

async function loadDoctorCards() {
  const res = await apiFetch("/doctors");
  const data = await res.json();
  doctorList = data.doctors;

  if (!selectedDoctorId) {
    const admin = doctorList.find((d) => d.role === "admin");
    selectedDoctorId = admin ? String(admin.id) : doctorList[0] ? String(doctorList[0].id) : null;
  }

  await renderDoctorCards();
}

async function renderDoctorCards() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [todayRes, ...summaryResList] = await Promise.all([
    apiFetch("/appointments?date=" + todayStr),
    ...doctorList.map((d) =>
      apiFetch(`/appointments/summary?year=${year}&month=${month}&staff_id=${d.id}`)
    )
  ]);

  const todayData = await todayRes.json();
  const todayCountByStaff = {};
  todayData.appointments.forEach((a) => {
    todayCountByStaff[a.staff_id] = (todayCountByStaff[a.staff_id] || 0) + 1;
  });

  const summaries = await Promise.all(summaryResList.map((r) => r.json()));
  const monthCountByStaff = {};
  doctorList.forEach((d, i) => {
    const counts = summaries[i].counts;
    monthCountByStaff[d.id] = Object.values(counts).reduce((sum, c) => sum + c, 0);
  });

  apptDoctorCards.innerHTML = doctorList
    .map(
      (d) => `
        <button type="button" class="doctor-card ${String(d.id) === selectedDoctorId ? "is-active" : ""}" data-doctor-id="${d.id}">
          <span class="doctor-card-name">${d.name}</span>
          <span class="doctor-card-count"><strong>${todayCountByStaff[d.id] || 0}</strong>건 / <strong>${monthCountByStaff[d.id] || 0}</strong>건</span>
        </button>
      `
    )
    .join("");

  apptDoctorCards.querySelectorAll("[data-doctor-id]").forEach((card) => {
    card.addEventListener("click", () => {
      selectedDoctorId = card.dataset.doctorId;
      calYear = new Date().getFullYear();
      calMonth = new Date().getMonth() + 1;
      renderDoctorCards();
      loadCalendar();
      loadTodayAppointments();
    });
  });
}

function selectedApptStaffId() {
  return selectedDoctorId;
}

function heatLevel(count) {
  if (count === 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  return 3;
}

function renderCalendar(counts) {
  const firstWeekday = new Date(calYear, calMonth - 1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const selectedDate = apptDatePicker.value;

  let cells = "";
  for (let i = 0; i < firstWeekday; i++) {
    cells += '<div class="cal-cell empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const count = counts[dateStr] || 0;
    const isSunday = new Date(calYear, calMonth - 1, d).getDay() === 0;

    const classes = ["cal-cell"];
    if (isSunday) classes.push("is-sunday");
    if (dateStr === todayStr) classes.push("is-today");
    if (dateStr === selectedDate) classes.push("is-selected");

    const pillClass = count > 0 ? `level-${heatLevel(count)}` : "";

    cells += `
      <div class="${classes.join(" ")}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        <span class="cal-count-pill ${pillClass}">${count > 0 ? count + "건" : ""}</span>
      </div>
    `;
  }

  calGrid.innerHTML = cells;

  calGrid.querySelectorAll("[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => {
      apptDatePicker.value = cell.dataset.date;
      loadTodayAppointments();
      renderCalendar(counts);
    });
  });
}

async function loadCalendar() {
  const staffId = selectedApptStaffId();

  if (!staffId) {
    apptCalendarPanel.hidden = true;
    return;
  }

  apptCalendarPanel.hidden = false;
  apptCalendarTitle.textContent = `${calYear}년 ${calMonth}월`;

  const params = new URLSearchParams({ year: calYear, month: calMonth, staff_id: staffId });
  const res = await apiFetch("/appointments/summary?" + params.toString());
  const data = await res.json();
  renderCalendar(data.counts);
}

calPrevBtn.addEventListener("click", () => {
  calMonth -= 1;
  if (calMonth < 1) {
    calMonth = 12;
    calYear -= 1;
  }
  loadCalendar();
});

calNextBtn.addEventListener("click", () => {
  calMonth += 1;
  if (calMonth > 12) {
    calMonth = 1;
    calYear += 1;
  }
  loadCalendar();
});

async function initAppointmentsTab() {
  if (currentStaff.role === "doctor") {
    apptFilterPanel.hidden = true;
    selectedDoctorId = String(currentStaff.id);
  } else {
    apptFilterPanel.hidden = false;
    await loadDoctorCards();
  }

  calYear = new Date().getFullYear();
  calMonth = new Date().getMonth() + 1;

  await loadCalendar();
  await loadTodayAppointments();
}

async function updateAppointmentStatus(appointment, newStatus) {
  await apiFetch(`/patients/${appointment.patient_id}/appointments/${appointment.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      staff_id: appointment.staff_id,
      date: appointment.date,
      time: appointment.time,
      reason: appointment.reason,
      status: newStatus
    })
  });
}

function renderTodayAppointments(appointments) {
  todayAppointments = appointments;

  if (appointments.length === 0) {
    appointmentsTbody.innerHTML = '<tr class="empty-row"><td colspan="6">해당 날짜에 예약이 없어요.</td></tr>';
    return;
  }

  appointmentsTbody.innerHTML = appointments
    .map(
      (a) => `
        <tr>
          <td>${a.staff_name}</td>
          <td class="mono">${a.time}</td>
          <td class="row-click" data-open-patient="${a.patient_id}">${a.patient_name}</td>
          <td>${a.reason || "-"}</td>
          <td>
            <select class="appt-status-select ${apptStatusClass(a.status)}" data-appt="${a.id}">
              ${apptStatusOptions(a.status)}
            </select>
          </td>
          <td><div class="actions-cell">
            <button class="icon-btn" data-delete-appt="${a.id}" title="삭제" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div></td>
        </tr>
      `
    )
    .join("");

  appointmentsTbody.querySelectorAll("[data-open-patient]").forEach((el) => {
    el.addEventListener("click", () => openPatientChart(el.dataset.openPatient));
  });

  appointmentsTbody.querySelectorAll(".appt-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const appt = todayAppointments.find((a) => String(a.id) === sel.dataset.appt);
      sel.className = "appt-status-select " + apptStatusClass(sel.value);
      await updateAppointmentStatus(appt, sel.value);
      await loadTodayAppointments();
    });
  });

  appointmentsTbody.querySelectorAll("[data-delete-appt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const appt = todayAppointments.find((a) => String(a.id) === btn.dataset.deleteAppt);
      await apiFetch(`/patients/${appt.patient_id}/appointments/${appt.id}`, { method: "DELETE" });
      await loadTodayAppointments();
    });
  });
}

async function loadTodayAppointments() {
  if (!apptDatePicker.value) {
    apptDatePicker.value = new Date().toISOString().slice(0, 10);
  }

  const params = new URLSearchParams({ date: apptDatePicker.value });
  const staffId = selectedApptStaffId();
  if (staffId) params.set("staff_id", staffId);

  const res = await apiFetch("/appointments?" + params.toString());
  const data = await res.json();
  renderTodayAppointments(data.appointments);
}

apptDatePicker.addEventListener("change", () => loadTodayAppointments());

/* ---------------- 환자 차트 ---------------- */

const chartBackBtn = document.getElementById("chart-back-btn");
const patientInfoBar = document.getElementById("patient-info-bar");
const chartStatRow = document.getElementById("chart-stat-row");
const chartRecordsTbody = document.getElementById("chart-records-tbody");
const chartRecordsPagination = document.getElementById("chart-records-pagination");
const chartRecordsPrevBtn = document.getElementById("chart-records-prev-btn");
const chartRecordsNextBtn = document.getElementById("chart-records-next-btn");
const chartRecordsPageLabel = document.getElementById("chart-records-page-label");
const chartRecordForm = document.getElementById("chart-record-form");
const chartRecordMsg = document.getElementById("chart-record-msg");
const chartTodayLabel = document.getElementById("chart-today-label");
const memoPopover = document.getElementById("memo-popover");

chartRecordsPrevBtn.addEventListener("click", () => {
  if (chartRecordsPage > 1) {
    chartRecordsPage -= 1;
    renderChartRecordsPage();
  }
});

chartRecordsNextBtn.addEventListener("click", () => {
  chartRecordsPage += 1;
  renderChartRecordsPage();
});
let memoPopoverTrigger = null;

function hideMemoPopover() {
  memoPopover.hidden = true;
  memoPopoverTrigger = null;
}

function showMemoPopover(triggerEl, text) {
  if (memoPopoverTrigger === triggerEl && !memoPopover.hidden) {
    hideMemoPopover();
    return;
  }

  memoPopover.textContent = text;
  memoPopover.hidden = false;
  memoPopoverTrigger = triggerEl;

  const rect = triggerEl.getBoundingClientRect();
  const popRect = memoPopover.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left;

  if (left + popRect.width > window.innerWidth - 12) {
    left = window.innerWidth - popRect.width - 12;
  }
  if (top + popRect.height > window.innerHeight - 12) {
    top = rect.top - popRect.height - 8;
  }

  memoPopover.style.top = top + "px";
  memoPopover.style.left = left + "px";
}

document.addEventListener("click", (e) => {
  if (memoPopover.hidden) return;
  if (memoPopoverTrigger && memoPopoverTrigger.contains(e.target)) return;
  if (memoPopover.contains(e.target)) return;
  hideMemoPopover();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideMemoPopover();
});

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

function renderChartStatRow(latest) {
  if (!latest) {
    chartStatRow.innerHTML =
      '<div class="panel" style="padding: 20px; color: var(--ink-600);">' +
      "아직 진료 기록이 없어요. 왼쪽 폼에서 첫 기록을 남겨보세요." +
      "</div>";
    return;
  }

  const bmiSev = severity("bmi", latest.bmi_category);
  const bpSev = severity("bp", latest.bp_category);
  const sugarSev = severity("sugar", latest.sugar_category);

  chartStatRow.innerHTML = `
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

let chartRecords = [];
let chartRecordsPage = 1;
const CHART_RECORDS_PAGE_SIZE = 7;

function renderChartRecordsTable(records) {
  chartRecords = records;
  chartRecordsPage = 1;
  renderChartRecordsPage();
}

function renderChartRecordsPage() {
  if (chartRecords.length === 0) {
    chartRecordsTbody.innerHTML =
      '<tr class="empty-row"><td colspan="6">등록된 기록이 없어요.</td></tr>';
    chartRecordsPagination.hidden = true;
    return;
  }

  const sorted = [...chartRecords].sort((a, b) => (a.date < b.date ? 1 : -1));
  const totalPages = Math.max(1, Math.ceil(sorted.length / CHART_RECORDS_PAGE_SIZE));
  chartRecordsPage = Math.min(chartRecordsPage, totalPages);

  const start = (chartRecordsPage - 1) * CHART_RECORDS_PAGE_SIZE;
  const pageItems = sorted.slice(start, start + CHART_RECORDS_PAGE_SIZE);

  chartRecordsTbody.innerHTML = pageItems
    .map((r) => {
      const bmiCls = sevClass(severity("bmi", r.bmi_category));
      const bpCls = sevClass(severity("bp", r.bp_category));
      const sugarCls = sevClass(severity("sugar", r.sugar_category));

      const hasWarnings = r.warnings && r.warnings.length > 0;

      const hasMemo = r.memo && r.memo.trim().length > 0;
      const memoIcon = hasMemo
        ? `<button class="memo-icon has-memo" data-memo="${r.id}" type="button" title="소견/메모 보기">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9L14 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v6h6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>`
        : `<span class="memo-icon is-empty" title="메모 없음">–</span>`;

      return `
        <tr data-id="${r.id}" class="${hasWarnings ? "risk-row" : ""}">
          <td class="date-cell">${r.date}</td>
          <td class="mono">${r.bmi.toFixed(1)} <span class="chip ${bmiCls}">${r.bmi_category}</span></td>
          <td class="mono">${r.systolic}/${r.diastolic} <span class="chip ${bpCls}">${r.bp_category}</span></td>
          <td class="mono">${r.blood_sugar} <span class="chip ${sugarCls}">${r.sugar_category}</span></td>
          <td>${memoIcon}</td>
          <td><div class="actions-cell">
            <button class="icon-btn" data-edit="${r.id}" title="수정" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="icon-btn" data-delete="${r.id}" title="삭제" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div></td>
        </tr>
      `;
    })
    .join("");

  chartRecordsTbody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const record = chartRecords.find((r) => String(r.id) === btn.dataset.edit);
      if (record) startEditRecord(record);
    });
  });

  chartRecordsTbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteRecord(btn.dataset.delete));
  });

  chartRecordsTbody.querySelectorAll("[data-memo]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const record = chartRecords.find((r) => String(r.id) === btn.dataset.memo);
      if (record) showMemoPopover(btn, record.memo);
    });
  });

  chartRecordsPagination.hidden = false;
  chartRecordsPageLabel.textContent = `${chartRecordsPage} / ${totalPages} 페이지 (총 ${sorted.length}건)`;
  chartRecordsPrevBtn.disabled = chartRecordsPage <= 1;
  chartRecordsNextBtn.disabled = chartRecordsPage >= totalPages;
}

const TREND_METRICS = {
  bmi: {
    axis: { min: 12, max: 35 },
    bands: [
      { from: 12, to: 18.5, token: "--warn" },
      { from: 18.5, to: 23, token: "--good" },
      { from: 23, to: 25, token: "--warn" },
      { from: 25, to: 35, token: "--crit" }
    ],
    getSeries: (recent) => [
      {
        data: recent.map((r) => r.bmi),
        pointSeverity: recent.map((r) => severity("bmi", r.bmi_category)),
        pointLabels: recent.map((r) => `${r.bmi.toFixed(1)} (${r.weight.toFixed(1)}kg·${r.height}cm)`)
      }
    ]
  },
  bp: {
    axis: { min: 50, max: 180 },
    bands: [
      { from: 50, to: 120, token: "--good" },
      { from: 120, to: 140, token: "--warn" },
      { from: 140, to: 180, token: "--crit" }
    ],
    getSeries: (recent) => {
      const sev = recent.map((r) => severity("bp", r.bp_category));
      return [
        {
          data: recent.map((r) => r.systolic),
          pointSeverity: sev,
          pointLabels: recent.map((r) => String(r.systolic))
        },
        {
          data: recent.map((r) => r.diastolic),
          pointSeverity: sev,
          pointLabels: recent.map((r) => String(r.diastolic)),
          dashed: true
        }
      ];
    }
  },
  sugar: {
    axis: { min: 50, max: 220 },
    bands: [
      { from: 50, to: 100, token: "--good" },
      { from: 100, to: 126, token: "--warn" },
      { from: 126, to: 220, token: "--crit" }
    ],
    getSeries: (recent) => [
      {
        data: recent.map((r) => r.blood_sugar),
        pointSeverity: recent.map((r) => severity("sugar", r.sugar_category)),
        pointLabels: recent.map((r) => String(r.blood_sugar))
      }
    ]
  }
};

function sevColorToken(sev) {
  return sev === 2 ? "--crit" : sev === 1 ? "--warn" : "--good";
}

function formatShortDate(dateStr) {
  const parts = dateStr.split("-");
  return `${parts[1]}-${parts[2]}`;
}

function renderPointColoredChart(canvas, series, axis, bands, dates, showBands) {
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
  const lineColor = styles.getPropertyValue("--ink-400").trim();
  const axisLabelColor = styles.getPropertyValue("--ink-400").trim();
  const pointColor = styles.getPropertyValue("--ink-900").trim();
  const resolve = (token) => styles.getPropertyValue(token).trim();

  const pad = { top: 22, right: 14, bottom: 24, left: 38 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const min = axis.min;
  const max = axis.max;

  const yAt = (v) => {
    const clamped = Math.max(min, Math.min(max, v));
    return pad.top + plotH * (1 - (clamped - min) / (max - min));
  };

  if (showBands) {
    (bands || []).forEach((band) => {
      const yTop = yAt(band.to);
      const yBottom = yAt(band.from);
      ctx.fillStyle = resolve(band.token) + "26";
      ctx.fillRect(pad.left, yTop, plotW, yBottom - yTop);
    });
  }

  ctx.strokeStyle = gridLine;
  ctx.lineWidth = 1;
  const rows = 2;
  for (let r = 0; r <= rows; r++) {
    const y = pad.top + (plotH / rows) * r;
    ctx.beginPath();
    ctx.moveTo(pad.left, y + 0.5);
    ctx.lineTo(w - pad.right, y + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = axisLabelColor;
  ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(max), pad.left - 8, pad.top);
  ctx.fillText(Math.round(min), pad.left - 8, h - pad.bottom);

  const xAt = (i, len) => (len === 1 ? pad.left + plotW / 2 : pad.left + (plotW / (len - 1)) * i);

  const xLen = dates.length;
  ctx.fillStyle = axisLabelColor;
  ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  dates.forEach((d, i) => {
    ctx.fillText(formatShortDate(d), xAt(i, xLen), h - pad.bottom + 6);
  });

  series.forEach((s) => {
    const data = s.data;
    const len = data.length;

    if (len >= 2) {
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = xAt(i, len);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      if (s.dashed) ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    data.forEach((v, i) => {
      const x = xAt(i, len);
      const y = yAt(v);
      const isLast = i === len - 1;
      const dotColor = s.pointSeverity ? resolve(sevColorToken(s.pointSeverity[i])) : pointColor;
      ctx.beginPath();
      ctx.arc(x, y, isLast ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.strokeStyle = surface;
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      if (s.pointLabels) {
        ctx.fillStyle = pointColor;
        ctx.font = "700 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(s.pointLabels[i], x, y - 8);
      }
    });
  });
}

let currentTrendMetric = "bmi";
let showRiskBands = false;
const trendBandToggle = document.getElementById("trend-band-toggle");

trendBandToggle.addEventListener("click", () => {
  showRiskBands = !showRiskBands;
  trendBandToggle.classList.toggle("is-active", showRiskBands);
  drawTrendChart(currentTrendMetric, chartRecords);
});

function drawTrendChart(metric, records) {
  currentTrendMetric = metric;

  document.querySelectorAll("#trend-tabs .trend-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.metric === metric);
  });
  document.getElementById("trend-bp-legend").hidden = metric !== "bp";

  const wrap = document.getElementById("chart-wrap-trend");
  const recent = [...records].sort((a, b) => (a.date > b.date ? 1 : -1)).slice(-8);

  if (recent.length === 0) {
    wrap.innerHTML = '<div class="chart-empty">기록이 쌓이면 추이를 보여드릴게요.</div>';
    return;
  }

  if (!document.getElementById("chart-trend-canvas")) {
    wrap.innerHTML = '<canvas id="chart-trend-canvas" height="115"></canvas>';
  }

  const config = TREND_METRICS[metric];
  const series = config.getSeries(recent);
  const dates = recent.map((r) => r.date);
  renderPointColoredChart(
    document.getElementById("chart-trend-canvas"),
    series,
    config.axis,
    config.bands,
    dates,
    showRiskBands
  );
}

document.getElementById("trend-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".trend-tab");
  if (!btn) return;
  drawTrendChart(btn.dataset.metric, chartRecords);
});

function drawTrendCharts(records) {
  drawTrendChart(currentTrendMetric, records);
}

async function loadPatientChart() {
  const res = await apiFetch(`/patients/${currentPatient.id}/records`);
  const data = await res.json();
  const records = data.records;

  const latest = [...records].sort((a, b) => (a.date > b.date ? -1 : 1))[0];
  renderChartStatRow(latest);
  renderChartRecordsTable(records);
  drawTrendCharts(records);
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
  cancelEditRecord();
  document.getElementById("af-date").value = today;
  chartTodayLabel.textContent = "오늘의 요약 · " + today;

  showSubview("chart");
  await loadDoctorList(document.getElementById("af-staff"));
  await loadPatientChart();
  await loadPatientAppointments();
}

async function deleteRecord(id) {
  await apiFetch(`/patients/${currentPatient.id}/records/${id}`, { method: "DELETE" });
  await loadPatientChart();
}

let editingRecordId = null;

const chartRecordFormTitle = document.getElementById("chart-record-form-title");
const chartRecordSubmitBtn = document.getElementById("chart-record-submit-btn");
const chartRecordCancelEdit = document.getElementById("chart-record-cancel-edit");

function startEditRecord(record) {
  editingRecordId = record.id;

  document.getElementById("cf-date").value = record.date;
  document.getElementById("cf-weight").value = record.weight;
  document.getElementById("cf-height").value = record.height;
  document.getElementById("cf-systolic").value = record.systolic;
  document.getElementById("cf-diastolic").value = record.diastolic;
  document.getElementById("cf-sugar").value = record.blood_sugar;
  document.getElementById("cf-steps").value = record.steps;
  document.getElementById("cf-sleep").value = record.sleep_hours;
  document.getElementById("cf-memo").value = record.memo;

  chartRecordFormTitle.textContent = "진료 기록 수정";
  chartRecordSubmitBtn.textContent = "수정 완료";
  chartRecordCancelEdit.hidden = false;
  hideMsg(chartRecordMsg);
}

function cancelEditRecord() {
  editingRecordId = null;
  chartRecordForm.reset();
  document.getElementById("cf-date").value = new Date().toISOString().slice(0, 10);
  chartRecordFormTitle.textContent = "진료 기록 추가";
  chartRecordSubmitBtn.textContent = "저장";
  chartRecordCancelEdit.hidden = true;
  hideMsg(chartRecordMsg);
}

chartRecordCancelEdit.addEventListener("click", (e) => {
  e.preventDefault();
  cancelEditRecord();
});

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

  const isEditing = editingRecordId !== null;
  const url = isEditing
    ? `/patients/${currentPatient.id}/records/${editingRecordId}`
    : `/patients/${currentPatient.id}/records`;

  try {
    const res = await apiFetch(url, {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(formatApiError(body.detail, "기록 저장에 실패했어요."));
    }

    const wasEditing = isEditing;
    cancelEditRecord();
    await loadPatientChart();
    showMsg(chartRecordMsg, wasEditing ? "기록이 수정됐어요." : "기록이 저장됐어요.", "success");
  } catch (err) {
    showMsg(chartRecordMsg, err.message, "error");
  }
});

/* ---------------- 환자 차트 내 예약 ---------------- */

const apptForm = document.getElementById("appt-form");
const apptMsg = document.getElementById("appt-msg");
const apptStaffSelect = document.getElementById("af-staff");
const chartAppointmentsTbody = document.getElementById("chart-appointments-tbody");

let chartAppointments = [];

function renderChartAppointments(appointments) {
  chartAppointments = appointments;

  if (appointments.length === 0) {
    chartAppointmentsTbody.innerHTML = '<tr class="empty-row"><td colspan="6">예약된 일정이 없어요.</td></tr>';
    return;
  }

  const sorted = [...appointments].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
  );

  chartAppointmentsTbody.innerHTML = sorted
    .map((a) => {
      const staffName = apptStaffSelect.querySelector(`option[value="${a.staff_id}"]`);
      return `
        <tr>
          <td>${staffName ? staffName.textContent : a.staff_id}</td>
          <td class="date-cell">${a.date}</td>
          <td class="mono">${a.time}</td>
          <td>${a.reason || "-"}</td>
          <td>
            <select class="appt-status-select ${apptStatusClass(a.status)}" data-appt="${a.id}">
              ${apptStatusOptions(a.status)}
            </select>
          </td>
          <td><div class="actions-cell">
            <button class="icon-btn" data-delete-chart-appt="${a.id}" title="삭제" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div></td>
        </tr>
      `;
    })
    .join("");

  chartAppointmentsTbody.querySelectorAll(".appt-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const appt = chartAppointments.find((a) => String(a.id) === sel.dataset.appt);
      sel.className = "appt-status-select " + apptStatusClass(sel.value);
      await updateAppointmentStatus(appt, sel.value);
      await loadPatientAppointments();
    });
  });

  chartAppointmentsTbody.querySelectorAll("[data-delete-chart-appt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiFetch(`/patients/${currentPatient.id}/appointments/${btn.dataset.deleteChartAppt}`, {
        method: "DELETE"
      });
      await loadPatientAppointments();
    });
  });
}

async function loadPatientAppointments() {
  const res = await apiFetch(`/patients/${currentPatient.id}/appointments`);
  const data = await res.json();
  renderChartAppointments(data.appointments);
}

apptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg(apptMsg);

  const payload = {
    staff_id: parseInt(document.getElementById("af-staff").value, 10),
    date: document.getElementById("af-date").value,
    time: document.getElementById("af-time").value,
    reason: document.getElementById("af-reason").value
  };

  try {
    const res = await apiFetch(`/patients/${currentPatient.id}/appointments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const body = await res.json();
      throw new Error(formatApiError(body.detail, "예약 등록에 실패했어요."));
    }

    document.getElementById("af-reason").value = "";
    await loadPatientAppointments();
    showMsg(apptMsg, "예약이 등록됐어요.", "success");
  } catch (err) {
    showMsg(apptMsg, err.message, "error");
  }
});

/* ---------------- 직원 관리 (admin) ---------------- */

const staffCreateForm = document.getElementById("staff-create-form");
const staffCreateMsg = document.getElementById("staff-create-msg");
const staffTbody = document.getElementById("staff-tbody");
const staffCountSummary = document.getElementById("staff-count-summary");
const sfNameInput = document.getElementById("sf-name");
const sfPasswordInput = document.getElementById("sf-password");

let sfPasswordTouched = false;

sfNameInput.addEventListener("input", () => {
  if (!sfPasswordTouched) {
    sfPasswordInput.value = sfNameInput.value.trim() ? sfNameInput.value.trim() + "1234" : "";
  }
});

sfPasswordInput.addEventListener("input", () => {
  sfPasswordTouched = true;
});

// 이번 화면 세션에서 새로 발급한 계정 id (최근 발급순, 앞쪽이 최신). 새로고침하면 초기화됨.
let recentlyCreatedStaffIds = [];

function sortStaffForDisplay(staffList) {
  const recent = recentlyCreatedStaffIds
    .map((id) => staffList.find((s) => s.id === id))
    .filter(Boolean);
  const recentIds = new Set(recent.map((s) => s.id));
  const rest = staffList.filter((s) => !recentIds.has(s.id)).sort((a, b) => a.id - b.id);
  return [...recent, ...rest];
}

function renderStaffTable(staffList) {
  if (staffList.length === 0) {
    staffTbody.innerHTML = '<tr class="empty-row"><td colspan="4">등록된 직원이 없어요.</td></tr>';
    staffCountSummary.innerHTML = "";
    return;
  }

  const sortedList = sortStaffForDisplay(staffList);

  staffTbody.innerHTML = sortedList
    .map(
      (s) => `
        <tr data-id="${s.id}">
          <td>${s.name}</td>
          <td class="mono">${s.name}1234</td>
          <td><span class="role-pip role-${s.role}">${ROLE_LABEL[s.role] || s.role}</span></td>
          <td><div class="actions-cell">
            <button class="icon-btn" data-delete="${s.id}" title="해고" type="button">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div></td>
        </tr>
      `
    )
    .join("");

  staffTbody.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => deleteStaff(btn.dataset.delete));
  });

  const counts = { admin: 0, doctor: 0, nurse: 0 };
  staffList.forEach((s) => {
    if (counts[s.role] !== undefined) counts[s.role] += 1;
  });
  staffCountSummary.innerHTML = `
    <span class="role-pip role-admin">원장 ${counts.admin}명</span>
    <span class="role-pip role-doctor">의사 ${counts.doctor}명</span>
    <span class="role-pip role-nurse">간호사 ${counts.nurse}명</span>
  `;
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

  const name = document.getElementById("sf-name").value.trim();

  const payload = {
    name,
    role: document.getElementById("sf-role").value,
    email: name,
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
      throw new Error(formatApiError(body.detail, "계정 발급에 실패했어요."));
    }

    const created = await res.json();
    recentlyCreatedStaffIds.unshift(created.id);

    staffCreateForm.reset();
    sfPasswordTouched = false;
    await loadStaffList();
    showMsg(staffCreateMsg, "계정이 발급됐어요.", "success");
  } catch (err) {
    showMsg(staffCreateMsg, err.message, "error");
  }
});

/* ---------------- 병원 통계 (admin) ---------------- */

async function initStatsTab() {
  const res = await apiFetch("/stats/hospital");
  const data = await res.json();
  renderHospitalStats(data);
}

function renderHospitalStats(data) {
  const staffTotal = Object.values(data.staff_counts).reduce((sum, n) => sum + n, 0);
  const staffBreakdown = Object.entries(data.staff_counts)
    .map(([role, n]) => `${ROLE_LABEL[role] || role} ${n}`)
    .join(" · ");

  document.getElementById("hospital-stat-row").innerHTML = `
    <div class="stat-card">
      <div class="label">전체 환자 수</div>
      <div class="value mono">${data.total_patients}<span class="unit">명</span></div>
    </div>
    <div class="stat-card">
      <div class="label">전체 직원 수</div>
      <div class="value mono">${staffTotal}<span class="unit">명</span></div>
      <span class="chip good">${staffBreakdown}</span>
    </div>
    <div class="stat-card">
      <div class="label">이번달 진료 건수</div>
      <div class="value mono">${data.visits_this_month}<span class="unit">건</span></div>
    </div>
    <div class="stat-card">
      <div class="label">예약 (이번달 / 오늘)</div>
      <div class="value mono">${data.appointments_this_month}<span class="unit">건 / ${data.appointments_today}건</span></div>
    </div>
  `;

  document.getElementById("risk-stat-row").innerHTML = `
    <div class="stat-card">
      <div class="label">비만</div>
      <div class="value mono">${data.risk_breakdown.obesity}<span class="unit">명</span></div>
      <span class="chip crit">비만</span>
    </div>
    <div class="stat-card">
      <div class="label">고혈압</div>
      <div class="value mono">${data.risk_breakdown.hypertension}<span class="unit">명</span></div>
      <span class="chip crit">고혈압</span>
    </div>
    <div class="stat-card">
      <div class="label">당뇨 의심</div>
      <div class="value mono">${data.risk_breakdown.diabetes_risk}<span class="unit">명</span></div>
      <span class="chip crit">당뇨 의심</span>
    </div>
  `;

  drawVisitsTrend(data.daily_visits);
  renderTopDoctors(data.top_doctors_this_month);
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
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const allValues = seriesList.flatMap((s) => s.data);
  const min = Math.min(0, ...allValues);
  const max = Math.max(...allValues) + 1;

  ctx.strokeStyle = gridLine;
  ctx.lineWidth = 1;
  const rows = 2;
  for (let r = 0; r <= rows; r++) {
    const y = pad.top + (plotH / rows) * r;
    ctx.beginPath();
    ctx.moveTo(pad.left, y + 0.5);
    ctx.lineTo(w - pad.right, y + 0.5);
    ctx.stroke();
  }

  seriesList.forEach((s) => {
    const data = s.data;
    const len = data.length;
    const xAt = (i) => (len === 1 ? pad.left + plotW / 2 : pad.left + (plotW / (len - 1)) * i);
    const yAt = (v) => pad.top + plotH * (1 - (v - min) / (max - min || 1));

    if (s.fill && len >= 2) {
      const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
      grad.addColorStop(0, s.color + "33");
      grad.addColorStop(1, s.color + "00");
      ctx.beginPath();
      ctx.moveTo(xAt(0), yAt(data[0]));
      data.forEach((v, i) => ctx.lineTo(xAt(i), yAt(v)));
      ctx.lineTo(xAt(len - 1), h - pad.bottom);
      ctx.lineTo(xAt(0), h - pad.bottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }

    if (len >= 2) {
      ctx.beginPath();
      data.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    data.forEach((v, i) => {
      const x = xAt(i);
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

function drawVisitsTrend(dailyVisits) {
  const dates = Object.keys(dailyVisits).sort();
  const wrap = document.getElementById("visits-trend-wrap");

  if (dates.length === 0) {
    wrap.innerHTML = '<div class="chart-empty">최근 진료 기록이 없어요.</div>';
    return;
  }

  if (!document.getElementById("visits-trend-chart")) {
    wrap.innerHTML = '<canvas id="visits-trend-chart" height="90"></canvas>';
  }

  const data = dates.map((d) => dailyVisits[d]);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim();

  renderLineChart(document.getElementById("visits-trend-chart"), [
    { data, color: accent, fill: true }
  ]);
}

function renderTopDoctors(list) {
  const tbody = document.getElementById("top-doctors-tbody");

  if (list.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">이번달 진료 기록이 없어요.</td></tr>';
    return;
  }

  tbody.innerHTML = list
    .map(
      (d, i) => `
        <tr>
          <td class="mono">${i + 1}</td>
          <td>${d.name}</td>
          <td class="num mono">${d.visits}</td>
        </tr>
      `
    )
    .join("");
}

/* ---------------- 시작 ---------------- */

if (getToken()) {
  enterApp().catch(() => {
    clearSession();
    showScreen("auth");
  });
}
