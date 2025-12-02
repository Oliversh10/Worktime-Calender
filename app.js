function normalizeTimeInput(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s) return "";
  // Accept "8" => 08:00, "8:5" => 08:05, "08" => 08:00, "08:00" stays
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return s; // leave as-is; other validation may handle it
  let h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  let min = m[2] == null ? 0 : Math.max(0, Math.min(59, parseInt(m[2], 10)));
  const hh = String(h).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  return `${hh}:${mm}`;
}
function bindTimeAutoFormat(inputEl){
  if (!inputEl) return;
  inputEl.addEventListener("blur", () => {
    const v = normalizeTimeInput(inputEl.value);
    if (v) inputEl.value = v;
  });
}

// Enkel kalender-app med localStorage som 'database'.
// Data structure:
// localStorage.persons = JSON.stringify([ {id,name,color} ])
// localStorage.events = JSON.stringify({ personId: [ {id,date,start,end,note} ] })

(function(){
  // helpers
  function qs(sel){ return document.querySelector(sel) }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)) }
  function uid(){ return Math.random().toString(36).slice(2,9) }

  // initial state
  const today = new Date()
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  let viewYear = today.getFullYear()
  let viewMonth = today.getMonth() // 0-based
  let persons = JSON.parse(localStorage.getItem('persons') || '[]')
  let events = JSON.parse(localStorage.getItem('events') || '{}')
  let activePersonId = persons[0]?.id || null

  // seed default persons if empty
  if (persons.length === 0) {
    persons = [
      {id:'Name', name:'Name', color:'#3B82F6'},
    ]
    localStorage.setItem('persons', JSON.stringify(persons))
    localStorage.setItem('events', JSON.stringify(events))
    activePersonId = persons[0].id
  }

  // DOM refs
  const tabsEl = qs('#person-tabs')
  const activeNameEl = qs('#active-name')
  const monthLabel = qs('#month-label')
  const grid = qs('#calendar-grid')
  const prevBtn = qs('#prev-month')
  const nextBtn = qs('#next-month')
  const eventList = qs('#event-list')
  const modal = qs('#modal-backdrop')
  const mDate = qs('#m-date'), mStart = qs('#m-start'), mEnd = qs('#m-end'), mNote = qs('#m-note')
  const mSave = qs('#m-save'), mClose = qs('#m-close'), mDelete = qs('#m-delete')
  const exportCsvBtn = qs('#export-csv'), printBtn = qs('#print')
  const editPersonsBtn = qs('#edit-persons'), personsBackdrop = qs('#persons-backdrop')
  const personsList = qs('#persons-list'), pName = qs('#p-name'), pColor = qs('#p-color'), pAdd = qs('#p-add'), pClose = qs('#p-close')

  let modalEditingEvent = null

  function saveState(){ localStorage.setItem('persons', JSON.stringify(persons)); localStorage.setItem('events', JSON.stringify(events)) }

  // render tabs
  function renderTabs(){
    tabsEl.innerHTML = ''
    persons.forEach(p => {
      const d = document.createElement('div')
      d.className = 'tab' + (p.id===activePersonId ? ' active' : '')
      d.title = p.name
      d.style.display = 'flex'
      d.style.alignItems = 'center'
      d.style.gap = '8px'
      d.innerHTML = `<span class="person-color" style="background:${p.color}"></span>${p.name}`
      d.onclick = ()=>{ activePersonId = p.id; renderAll() }
      tabsEl.appendChild(d)
    })
  }

  // calendar generation
  function startOfMonth(y,m){ return new Date(y,m,1) }
  function daysInMonth(y,m){ return new Date(y,m+1,0).getDate() }
  function renderCalendar(){
    monthLabel.textContent = new Date(viewYear, viewMonth, 1).toLocaleString('da-DK', { month:'long', year:'numeric' })
    grid.innerHTML = ''
    const first = startOfMonth(viewYear, viewMonth)
    const startWeekDay = first.getDay() // 0=Sunday
    // We want grid Monday-first. Adjust: if Sunday (0) -> 6, else day-1
    const offset = (startWeekDay === 0) ? 6 : (startWeekDay - 1)
    const total = offset + daysInMonth(viewYear, viewMonth)
    const weeks = Math.ceil(total / 7)
    const cells = weeks * 7
    for (let i=0;i<cells;i++){
      const cell = document.createElement('div')
      cell.className = 'day'
      const dayIndex = i - offset + 1
      if (dayIndex < 1 || dayIndex > daysInMonth(viewYear, viewMonth)) {
        cell.className += ' other'
        grid.appendChild(cell)
        continue
      }
      const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(dayIndex).padStart(2,'0')}`
      // highlight dagens dato
      if (dateStr === todayDateStr) cell.classList.add('today')
      cell.dataset.date = dateStr
      cell.innerHTML = `<div class="date">${dayIndex}</div>`
      const evs = (events[activePersonId] || []).filter(e=>e.date===dateStr)
      evs.forEach(ev=>{
        const pill = document.createElement('div')
        pill.className = 'event-pill'
        pill.style.background = persons.find(p=>p.id===activePersonId)?.color || '#888'
        pill.textContent = ev.start && ev.end ? `${ev.start}-${ev.end}` : (ev.note || 'Tid')
        cell.appendChild(pill)
      })
      cell.onclick = ()=>openModal(dateStr)
      grid.appendChild(cell)
    }
  }

  function renderEventList(){
    eventList.innerHTML = ''
    const evs = (events[activePersonId] || []).slice().sort((a,b)=>a.date.localeCompare(b.date))
    evs.forEach(ev=>{
      const div = document.createElement('div')
      div.className = 'event-list-item'
      div.innerHTML = `<div><strong>${ev.date}</strong><div style="font-size:12px;opacity:0.9">${ev.start} - ${ev.end} ${ev.note ? ' • '+ev.note : ''}</div></div><div><button class="btn small">Åbn</button></div>`
      div.querySelector('button').onclick = ()=>{ openModal(ev.date, ev.id) }
      eventList.appendChild(div)
    })
  }

  function renderAll(){
    if (!activePersonId && persons[0]) activePersonId = persons[0].id
    const active = persons.find(p=>p.id===activePersonId)
    activeNameEl.textContent = active?.name || 'Ingen person valgt'
    renderTabs()
    renderCalendar()
    renderEventList()
  }

  function openModal(date, eventId){
    modal.classList.remove('hidden')
    mDate.value = date
    modalEditingEvent = null
    mDelete.style.display = 'none'
    mStart.value=''; mEnd.value=''; mNote.value=''
    if (eventId) {
      const ev = (events[activePersonId] || []).find(e=>e.id===eventId)
      if (ev) {
        modalEditingEvent = ev
        mStart.value = ev.start || ''
        mEnd.value = ev.end || ''
        mNote.value = ev.note || ''
        mDelete.style.display = ''
      }
    } else {
      // check if event exists for date
      const ev = (events[activePersonId] || []).find(e=>e.date===date)
      if (ev) { modalEditingEvent = ev; mStart.value=ev.start; mEnd.value=ev.end; mNote.value=ev.note; mDelete.style.display='' }
    }
  }

  function closeModal(){ modal.classList.add('hidden'); modalEditingEvent=null }

  mSave.onclick = ()=>{
    if (!activePersonId) return alert('Vælg en person først')
    const date = mDate.value, start=normalizeTimeInput(mStart.value), end=normalizeTimeInput(mEnd.value), note=mNote.value.trim()
    if (!events[activePersonId]) events[activePersonId]=[]
    if (modalEditingEvent) {
      // update
      modalEditingEvent.start = start; modalEditingEvent.end = end; modalEditingEvent.note = note
    } else {
      const ev = { id: uid(), date, start, end, note }
      // remove any existing event on that date (we keep one per day per person)
      events[activePersonId] = (events[activePersonId] || []).filter(e=>e.date!==date).concat([ev])
    }
    saveState(); renderAll(); closeModal()
  }
  mClose.onclick = closeModal
  mDelete.onclick = ()=>{
    if (!modalEditingEvent) return
    events[activePersonId] = (events[activePersonId] || []).filter(e=>e.id!==modalEditingEvent.id)
    saveState(); renderAll(); closeModal()
  }

  // month nav
  prevBtn.onclick = ()=>{ viewMonth--; if (viewMonth<0){ viewMonth=11; viewYear-- } renderAll() }
  nextBtn.onclick = ()=>{ viewMonth++; if (viewMonth>11){ viewMonth=0; viewYear++ } renderAll() }

  // exports
  exportCsvBtn.onclick = ()=>{
    const active = persons.find(p=>p.id===activePersonId)
    const evs = (events[activePersonId] || []).slice().sort((a,b)=>a.date.localeCompare(b.date))
    if (!evs.length) return alert('Ingen events at eksportere for denne person.')
    const rows = evs.map(e=>`${e.date};${e.start};${e.end};${(e.note||'').replace(/;/g,',')}`)
    const csv = 'Dato;Start;Slut;Note\n' + rows.join('\n')
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download = (active?.name || 'export') + '.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  printBtn.onclick = ()=>{ window.print() }

  // edit persons modal
  editPersonsBtn.onclick = ()=>{ personsBackdrop.classList.remove('hidden'); renderPersonsList() }
  pClose.onclick = ()=>{ personsBackdrop.classList.add('hidden') }

  function renderPersonsList(){
    personsList.innerHTML = ''
    persons.forEach(p=>{
      const div = document.createElement('div')
      div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center'; div.style.marginBottom='8px'
      div.innerHTML = `<div><span class="person-color" style="background:${p.color}"></span> ${p.name}</div><div><button class="btn small edit">Redigér</button> <button class="btn small del">Slet</button></div>`
      div.querySelector('.del').onclick = ()=>{ if (confirm('Slet personen?')){ persons = persons.filter(x=>x.id!==p.id); delete events[p.id]; saveState(); if (activePersonId===p.id) activePersonId = persons[0]?.id || null; renderAll(); renderPersonsList() } }
      div.querySelector('.edit').onclick = ()=>{
        const newName = prompt('Nyt navn', p.name)
        const newColor = prompt('Ny farve (#hex)', p.color)
        if (newName) p.name=newName; if (newColor) p.color=newColor; saveState(); renderAll(); renderPersonsList()
      }
      personsList.appendChild(div)
    })
  }

  pAdd.onclick = ()=>{
    const name = pName.value.trim(), color = pColor.value.trim() || '#888'
    if (!name) return alert('Skriv et navn')
    if (persons.length >= 10) return alert('Maks antal personer nået.')
    const id = uid()
    persons.push({id,name,color}); saveState(); pName.value=''; renderAll(); renderPersonsList()
  }

  // initial render
  renderAll()

})()

document.querySelectorAll('[data-time="true"]').forEach(bindTimeAutoFormat);


bindTimeAutoFormat(mStart)
bindTimeAutoFormat(mEnd)




// Night mode toggle (robust)
(function(){
  function initThemeToggle(){
    const btn = document.getElementById('themeToggle');
    if(!btn) return;

    const applyLabel = ()=>{
      const isDark = document.body.classList.contains('dark');
      btn.textContent = isDark ? 'Light mode' : 'Night mode';
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    };

    // load saved state
    const saved = localStorage.getItem('theme') || 'light';
    if(saved === 'dark') document.body.classList.add('dark');
    applyLabel();

    btn.addEventListener('click', ()=>{
      document.body.classList.toggle('dark');
      localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
      applyLabel();
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initThemeToggle);
  }else{
    initThemeToggle();
  }
})();
